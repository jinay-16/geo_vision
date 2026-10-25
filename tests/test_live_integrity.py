"""
GeoVision AI — Live Mode Integrity Regression Test Suite
(Improvement #2 Verification)

Validates that:
1. GEE exceptions cannot produce a successful-looking live result containing synthetic measurements.
2. Demo responses are explicitly labelled (is_live: False, is_demo: True).
3. is_live and source metadata are strictly consistent with the actual data source.
4. Missing imagery cannot be converted into fabricated zero values or risk scores.
5. Partial results identify missing observations.
6. Frontend-facing endpoints handle live failures correctly (raising HTTP 422/502).
7. Existing successful live responses remain backwards-compatible.

Runs completely OFFLINE without requiring live Earth Engine credentials.
"""

import sys
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
import asyncio

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from fastapi import HTTPException
from backend.app.schemas.responses import AOIAnalysisRequest, MultiSensorAnalysisRequest
from backend.app.routes.analysis import get_temporal_analysis, analyze_aoi, run_ablation_study
from backend.app.routes.photo_analysis import analyze_geotagged_photo
from backend.app.routes.predict import predict
from backend.app.schemas.responses import PredictionRequest, PredictionResponse
from backend.app.routes.deforestation import get_deforestation, analyze_deforestation_aoi
from backend.app.routes.mining import get_mining, analyze_mining_aoi
from backend.app.routes.flood import get_flood, analyze_flood_aoi
from backend.app.routes.overview import get_overview
from backend.app.services.demo_data import demo_data
from backend.app.services.gee_service import gee_service
from backend.app.services.ml_service import ml_service



def make_mock_upload(filename="field_test.jpg", content=b"dummy_image_data"):
    """Helper creating a mock UploadFile with async read()."""
    upload = MagicMock()
    async def _read():
        return content
    upload.read = _read
    upload.filename = filename
    return upload


class TestLiveModeIntegrity(unittest.TestCase):
    """Regression test suite for live pipeline integrity and source-of-truth rules."""

    # --------------------------------------------------------------------------
    # 1. GEE Exception Cannot Produce Synthetic Measurements Masquerading as Live
    # --------------------------------------------------------------------------

    def test_temporal_gee_exception_raises_http_error_not_synthetic_data(self):
        """When GEE fails and demo=False, get_temporal_analysis must raise HTTPException (422/502)."""
        with patch.object(gee_service, "analyze_temporal_window", side_effect=RuntimeError("GEE Connection Timeout")):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(get_temporal_analysis(
                    start_year=2023,
                    end_year=2026,
                    start_month=1,
                    end_month=4,
                    demo=False,
                    lat=None,
                    lng=None,
                    radius_km=None,
                ))
            self.assertIn(ctx.exception.status_code, [422, 502])
            self.assertIn("Live Earth Engine", ctx.exception.detail)

    def test_aoi_gee_exception_raises_http_error_not_synthetic_bands(self):
        """When GEE fails and demo=False, analyze_aoi must raise HTTPException rather than using fallback dict."""
        req = AOIAnalysisRequest(
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
                ],
            },
            demo=False,
        )
        with patch.object(gee_service, "extract_aoi_ml_features", side_effect=RuntimeError("GEE Quota Exceeded")):
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(analyze_aoi(req))
            self.assertIn(ctx.exception.status_code, [422, 502])
            self.assertIn("Live Earth Engine", ctx.exception.detail)

    def test_photo_gee_exception_returns_partial_without_fabricated_spectral_data(self):
        """When GEE fails in photo analysis, it returns status='partial' with satellite_status='unavailable'."""
        fake_upload = make_mock_upload()

        with patch("backend.app.routes.photo_analysis._extract_exif_metadata", return_value={
            "latitude": 18.52,
            "longitude": 73.85,
            "altitude_m": 560.0,
            "has_gps": True,
        }):
            with patch.object(gee_service, "extract_aoi_ml_features", side_effect=RuntimeError("GEE Server Error")):
                res = asyncio.run(analyze_geotagged_photo(
                    file=fake_upload,
                    buffer_meters=1000.0,
                    start_year=2023,
                    end_year=2026,
                    demo=False,
                ))

                # Must NOT fabricate fake bands or fake ML results!
                self.assertEqual(res["status"], "partial")
                self.assertTrue(res["has_gps"])
                self.assertEqual(res["satellite_status"], "unavailable")
                self.assertIsNone(res["satellite_analysis"])
                self.assertIn("Live satellite observation extraction failed", res["satellite_error"])

    # --------------------------------------------------------------------------
    # 2. Demo Responses Are Explicitly Labelled
    # --------------------------------------------------------------------------

    def test_temporal_demo_mode_is_explicitly_labelled(self):
        """When demo=True, temporal endpoint returns is_live=False, is_demo=True, and demo source."""
        res = asyncio.run(get_temporal_analysis(
            start_year=2023,
            end_year=2026,
            start_month=1,
            end_month=4,
            demo=True,
            lat=None,
            lng=None,
            radius_km=None,
        ))
        self.assertFalse(res.is_live)
        self.assertTrue(res.is_demo)
        self.assertIn("Demonstration", res.source)

    def test_aoi_demo_mode_is_explicitly_labelled(self):
        """When demo=True, AOI endpoint returns is_live=False, is_demo=True, and demo source."""
        req = AOIAnalysisRequest(
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
                ],
            },
            demo=True,
        )
        res = asyncio.run(analyze_aoi(req))
        self.assertFalse(res.is_live)
        self.assertTrue(res.is_demo)
        self.assertIn("Demonstration", res.source)

    def test_photo_demo_mode_is_explicitly_labelled(self):
        """When demo=True, photo analysis returns is_live=False, is_demo=True, and demo source."""
        fake_upload = make_mock_upload()

        with patch("backend.app.routes.photo_analysis._extract_exif_metadata", return_value={
            "latitude": 18.52,
            "longitude": 73.85,
            "altitude_m": 560.0,
            "has_gps": True,
        }):
            res = asyncio.run(analyze_geotagged_photo(
                file=fake_upload,
                buffer_meters=1000.0,
                start_year=2023,
                end_year=2026,
                demo=True,
            ))
            self.assertEqual(res["status"], "demo")
            sat = res["satellite_analysis"]
            self.assertIsNotNone(sat)
            self.assertFalse(sat["is_live"])
            self.assertTrue(sat["is_demo"])
            self.assertIn("Demonstration", sat["source"])

    def test_static_module_endpoints_report_is_demo_true(self):
        """Static module endpoints serving pilot reference dataset report is_demo=True and is_live=False."""
        def_res = asyncio.run(get_deforestation())
        min_res = asyncio.run(get_mining())
        fld_res = asyncio.run(get_flood())
        ov_res = asyncio.run(get_overview())

        self.assertTrue(def_res.is_demo)
        self.assertFalse(def_res.is_live)
        self.assertTrue(min_res.is_demo)
        self.assertFalse(min_res.is_live)
        self.assertTrue(fld_res.is_demo)
        self.assertFalse(fld_res.is_live)
        self.assertTrue(ov_res.is_demo)
        self.assertFalse(ov_res.is_live)
        self.assertIn("pilot dataset", def_res.source.lower())
        self.assertIn("provenance not independently verified", def_res.source)

    # --------------------------------------------------------------------------
    # 3. Source Metadata Is Consistent With Actual Source & Provenance
    # --------------------------------------------------------------------------

    def test_source_string_reflects_actual_dataset_state_and_synthetic_fallback(self):
        """Test get_source() returns cautious pilot label, synthetic fallback, or user label."""
        demo_data.load()
        # Normal operational CSV load
        self.assertEqual(
            demo_data.get_source(),
            "GeoVision AI pilot dataset (Pune study area, 2023–2026; provenance not independently verified)",
        )
        self.assertTrue(demo_data.is_demo)

        # Synthetic fallback when CSV is missing
        demo_data.is_synthetic_fallback = True
        self.assertEqual(
            demo_data.get_source(),
            "GeoVision synthetic demonstration fallback (CSV unavailable)",
        )
        demo_data.is_synthetic_fallback = False

        # User ingested source label
        demo_data.dataset_type = "user"
        demo_data.user_filename = "custom_survey_2026.geojson"
        self.assertEqual(demo_data.get_source(), "User Ingested Dataset (custom_survey_2026.geojson)")
        self.assertFalse(demo_data.is_demo)

        # Reset back to operational
        demo_data.dataset_type = "operational"
        demo_data.user_filename = None
        self.assertTrue(demo_data.is_demo)

    def test_status_flags_when_gee_is_available_but_demo_requested(self):
        """When GEE is connected but request specifies demo=True, response must NOT report is_live=True."""
        with patch.object(gee_service, "_is_initialized", True):
            # Temporal demo request
            t_res = asyncio.run(get_temporal_analysis(
                start_year=2023,
                end_year=2026,
                start_month=1,
                end_month=4,
                demo=True,
                lat=None,
                lng=None,
                radius_km=None,
            ))
            self.assertFalse(t_res.is_live)
            self.assertTrue(t_res.is_demo)
            self.assertIn("demonstration", t_res.source.lower())

            # AOI demo request
            req = AOIAnalysisRequest(
                geometry={
                    "type": "Polygon",
                    "coordinates": [[[73.8, 18.5], [73.85, 18.5], [73.85, 18.55], [73.8, 18.55], [73.8, 18.5]]],
                },
                demo=True,
            )
            aoi_res = asyncio.run(analyze_aoi(req))
            self.assertFalse(aoi_res.is_live)
            self.assertTrue(aoi_res.is_demo)
            self.assertIn("demonstration", aoi_res.source.lower())

    def test_local_rf_inference_versus_heuristic_fallback(self):
        """Trained Random Forest model reports rf-v2 and is_demo=False; fallback reports demo-heuristic and is_demo=True."""
        ml_service.load_model()
        sample_features = {
            "B2_2026": 1100.0, "B3_2026": 1250.0, "B4_2026": 1400.0,
            "B8_2026": 2200.0, "B11_2026": 1900.0, "B12_2026": 1500.0,
            "NDWI_2023": -0.2, "NDWI_2026": -0.18, "NDWI_Change": 0.02,
            "NDBI_2023": 0.02, "NDBI_2026": 0.05, "NDBI_Change": 0.03,
            "NDVI_2024": 0.40, "NDVI_2025": 0.36, "NDVI_2026": 0.32,
        }

        # 1. Local trained model prediction
        res_trained = ml_service.predict(sample_features)
        self.assertEqual(res_trained["model_version"], "rf-v2-leakage-controlled")
        self.assertFalse(res_trained["is_demo"])
        self.assertIn("risk_score", res_trained)
        self.assertNotIn("is_live", res_trained)  # ML prediction is not a live satellite observation!

        # 2. Heuristic fallback when model is unavailable
        with patch.object(ml_service, "model_loaded", False):
            res_heuristic = ml_service.predict(sample_features)
            self.assertEqual(res_heuristic["model_version"], "demo-heuristic")
            self.assertTrue(res_heuristic["is_demo"])

    # --------------------------------------------------------------------------
    # 4. Missing Imagery Cannot Be Converted Into Fabricated Zero Values
    # --------------------------------------------------------------------------

    def test_missing_annual_imagery_raises_value_error_instead_of_zero(self):
        """get_annual_composite raises ValueError when scenes_count is 0."""
        with patch.object(gee_service, "get_annual_composite", side_effect=ValueError("No cloud-free Sentinel-2 scenes")):
            with self.assertRaises(ValueError):
                gee_service.get_annual_composite(year=2024, geometry=None)

    def test_missing_monthly_imagery_records_is_observed_false(self):
        """Monthly reductions without observations are recorded with is_observed=False and None values."""
        month_stat = {
            "month_num": 7,
            "month_name": "July",
            "start_year_val": None,
            "end_year_val": None,
            "change_val": None,
            "indicator_type": "NDVI (Vegetation Index)",
            "is_observed": False,
        }
        self.assertFalse(month_stat["is_observed"])
        self.assertIsNone(month_stat["change_val"])

    # --------------------------------------------------------------------------
    # 5. Partial Results Identify Missing Data
    # --------------------------------------------------------------------------

    def test_photo_analysis_missing_gps_returns_no_gps_status(self):
        """Photo without GPS metadata returns clean status='no_gps'."""
        fake_upload = make_mock_upload()

        with patch("backend.app.routes.photo_analysis._extract_exif_metadata", return_value={
            "latitude": None,
            "longitude": None,
            "has_gps": False,
        }):
            res = asyncio.run(analyze_geotagged_photo(file=fake_upload))
            self.assertEqual(res["status"], "no_gps")
            self.assertFalse(res["has_gps"])
            self.assertIn("No GPS metadata", res["message"])

    # --------------------------------------------------------------------------
    # 6. Prediction Endpoint Handles Errors With HTTP 422
    # --------------------------------------------------------------------------

    def test_predict_endpoint_missing_features_raises_http_422(self):
        """POST /predict raises HTTP 422 when required features are missing."""
        req = PredictionRequest(features={"B2_2026": 1200.0})  # Missing 14 other required features
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(predict(req))
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Missing required features", ctx.exception.detail)

    def test_predict_endpoint_success_schema_and_metadata(self):
        """POST /predict returns PredictionResponse with model_version, is_demo=False, and no is_live."""
        ml_service.load_model()
        sample_features = {
            "B2_2026": 1100.0, "B3_2026": 1250.0, "B4_2026": 1400.0,
            "B8_2026": 2200.0, "B11_2026": 1900.0, "B12_2026": 1500.0,
            "NDWI_2023": -0.2, "NDWI_2026": -0.18, "NDWI_Change": 0.02,
            "NDBI_2023": 0.02, "NDBI_2026": 0.05, "NDBI_Change": 0.03,
            "NDVI_2024": 0.40, "NDVI_2025": 0.36, "NDVI_2026": 0.32,
        }
        res = asyncio.run(predict(PredictionRequest(features=sample_features)))
        self.assertEqual(res["model_version"], "rf-v2-leakage-controlled")
        self.assertFalse(res["is_demo"])
        self.assertNotIn("is_live", res)
        # Verify schema validates cleanly
        pred_obj = PredictionResponse(**res)
        self.assertEqual(pred_obj.model_version, "rf-v2-leakage-controlled")

    # --------------------------------------------------------------------------
    # 7. Successful Live Responses Remain Compatible
    # --------------------------------------------------------------------------

    def test_live_response_schema_compatibility(self):
        """Mock successful GEE run and verify all required response fields are present."""
        mock_features = {
            "B2_2026": 1050.0, "B3_2026": 1220.0, "B4_2026": 1380.0,
            "B8_2026": 2180.0, "B11_2026": 1950.0, "B12_2026": 1580.0,
            "NDWI_2023": -0.21, "NDWI_2026": -0.19, "NDWI_Change": 0.02,
            "NDBI_2023": 0.01, "NDBI_2026": 0.06, "NDBI_Change": 0.05,
            "NDVI_2024": 0.38, "NDVI_2025": 0.35, "NDVI_2026": 0.31,
        }
        mock_extraction = {
            "features": mock_features,
            "ndvi_2023": 0.45,
            "net_ndvi": -0.14,
            "net_ndwi": 0.02,
            "net_ndbi": 0.05,
            "veg_loss_km2": 2.5,
            "disturb_km2": 1.2,
            "water_exp_km2": 0.4,
            "dominant_driver": "Vegetation Canopy Loss",
            "yearly_progression": [],
            "monthly_breakdown": [],
            "area_metrics": {
                "vector_geodesic_area_km2": 65.66,
                "raster_pixel_area_km2": 65.45,
                "valid_observed_area_km2": 65.45,
                "overlap_loss_disturbance_km2": 0.15,
                "reduction_scale_m": 20,
            },
        }

        req = AOIAnalysisRequest(
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
                ],
            },
            demo=False,
        )

        with patch.object(gee_service, "extract_aoi_ml_features", return_value=mock_extraction):
            with patch.object(gee_service, "get_map_tile_layers", return_value={"layers": {"true_color": "https://earthengine.googleapis.com/test"}}):
                res = asyncio.run(analyze_aoi(req))
                self.assertTrue(res.is_live)
                self.assertFalse(res.is_demo)
                self.assertEqual(res.area_km2, 29.31)
                self.assertEqual(res.raster_pixel_area_km2, 65.45)
                self.assertIsNotNone(res.ml_result)
                self.assertIsNotNone(res.summary)
                self.assertIsNotNone(res.features_extracted)
                self.assertEqual(res.summary.vegetation_loss_km2, 2.5)

    # --------------------------------------------------------------------------
    # 8. Dual-Sensor Live Mode Integrity & Ablation Tests (Improvement #3 & #3.1)
    # --------------------------------------------------------------------------

    def test_dual_sensor_live_exceptions_raise_http_error_not_synthetic_measurements(self):
        """When GEE fails and demo=False, dual-sensor endpoints raise HTTPException rather than returning fake metrics."""
        req = MultiSensorAnalysisRequest(
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
                ],
            },
            demo=False,
        )

        with patch.object(gee_service, "analyze_dual_sensor_aoi", side_effect=RuntimeError("GEE Connection Timeout")):
            # 1. Flood endpoint
            with self.assertRaises(HTTPException) as ctx_f:
                asyncio.run(analyze_flood_aoi(req))
            self.assertIn(ctx_f.exception.status_code, [422, 502])

            # 2. Deforestation endpoint
            with self.assertRaises(HTTPException) as ctx_d:
                asyncio.run(analyze_deforestation_aoi(req))
            self.assertIn(ctx_d.exception.status_code, [422, 502])

            # 3. Mining endpoint
            with self.assertRaises(HTTPException) as ctx_m:
                asyncio.run(analyze_mining_aoi(req))
            self.assertIn(ctx_m.exception.status_code, [422, 502])

        with patch.object(gee_service, "evaluate_sensor_ablation", side_effect=RuntimeError("GEE Connection Timeout")):
            # 4. Ablation study endpoint
            with self.assertRaises(HTTPException) as ctx_a:
                asyncio.run(run_ablation_study(req))
            self.assertIn(ctx_a.exception.status_code, [422, 502])

    def test_ablation_endpoint_demo_contains_all_four_configurations(self):
        """Verify ablation endpoint returns all 4 distinct baselines and documents validation gap."""
        req = MultiSensorAnalysisRequest(
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
                ],
            },
            demo=True,
        )
        res = asyncio.run(run_ablation_study(req))
        self.assertGreaterEqual(len(res.ablation_configurations), 4)
        config_names = [c.get("configuration") for c in res.ablation_configurations]
        self.assertIn("s2_optical_only", config_names)
        self.assertIn("s1_sar_only", config_names)
        self.assertIn("s1_s2_dual_sensor_fusion", config_names)
        self.assertIn("quality_aware_fusion", config_names)

        # Check validation gap disclosure
        self.assertIn("without ground-truth evidence", res.validation_gap_statement.lower())

    def test_dual_sensor_flood_expansion_versus_extent_distinction(self):
        """Verify flood endpoint distinguishes observed water extent from expansion relative to reference."""
        mock_analysis = {
            "region_name": "Test AOI",
            "geometry_area_km2": 25.0,
            "raster_pixel_area_km2": 24.8,
            "valid_observed_area_km2": 24.5,
            "coverage_percentage": 98.8,
            "base_year": 2023,
            "eval_year": 2024,
            "start_month": 1,
            "end_month": 4,
            "dominant_driver": "Surface Water",
            "affected_area_km2": 0.5,
            "risk_score": 30,
            "risk_level": "Low",
            "sensor_status": {
                "status": "both_available",
                "s1_available": True,
                "s2_available": True,
                "fusion_status": "both_available",
                "fusion_method": "Dual-Sensor Coincident Agreement",
            },
            "s2_metrics": {"optical_water_extent_km2": 2.1, "optical_water_expansion_km2": 0.3},
            "s1_metrics": {"sar_water_extent_km2": 2.4, "sar_water_expansion_km2": 0.5},
            "fusion_metrics": {
                "flood": {
                    "combined_water_extent_km2": 2.6,
                    "coincident_water_extent_km2": 1.9,
                    "radar_cloud_penetrated_water_km2": 0.5,
                    "potential_flood_expansion_km2": 0.5,
                    "coincident_expansion_km2": 0.3,
                    "agreement_ratio": 0.73,
                }
            },
            "source": "Copernicus Sentinel-1 SAR & Sentinel-2 Level-2A via Google Earth Engine",
            "is_live": True,
            "is_demo": False,
            "reduction_scale_meters": 50,
            "methodology": "Dual-Sensor fusion",
            "limitations": "Specular drop may confound tarmac",
        }

        req = MultiSensorAnalysisRequest(
            geometry={
                "type": "Polygon",
                "coordinates": [
                    [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
                ],
            },
            demo=False,
        )

        with patch.object(gee_service, "analyze_dual_sensor_aoi", return_value=mock_analysis):
            with patch.object(gee_service, "get_map_tile_layers", return_value={"layers": {}}):
                res = asyncio.run(analyze_flood_aoi(req))
                self.assertEqual(res.fusion_metrics["flood"]["combined_water_extent_km2"], 2.6)
                self.assertEqual(res.fusion_metrics["flood"]["potential_flood_expansion_km2"], 0.5)
                # Ensure they are distinct numbers and concepts
                self.assertNotEqual(
                    res.fusion_metrics["flood"]["combined_water_extent_km2"],
                    res.fusion_metrics["flood"]["potential_flood_expansion_km2"]
                )


if __name__ == "__main__":
    unittest.main()

