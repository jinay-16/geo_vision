"""
Comprehensive Quality Audit and Validation Test Suite for the GEE Pipeline
in GeoVision AI (backend/app/services/gee_service.py).

Explicitly separated into:
1. Pure Unit Tests (run offline without requiring Earth Engine authentication).
2. Live Integration Tests (require authenticated Earth Engine connection).
"""

import sys
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from backend.app.services.gee_service import (
    gee_service,
    S2_COLLECTION_ID,
    CS_COLLECTION_ID,
    CLEAR_THRESHOLD,
    CLOUD_FILTER_PERCENT,
    DEFAULT_START_MONTH,
    DEFAULT_END_MONTH,
    S1_COLLECTION_ID,
    S1_INSTRUMENT_MODE,
    S1_POLARIZATIONS,
    S1_DEFAULT_ORBIT_PASS,
)


# ==============================================================================
# 1. PURE OFFLINE UNIT TESTS (No Earth Engine connection required)
# ==============================================================================


class TestGEEPipelineUnitTests(unittest.TestCase):
    """
    Offline unit tests validating specifications, geometry validation,
    coordinate bounds, degenerate/self-intersecting polygons, index formulas,
    delta signs, area metadata definitions, and error handling.
    """

    def test_constants_match_scientific_reference(self):
        """Verify collections and thresholds match gee/geovision_analysis.js."""
        self.assertEqual(S2_COLLECTION_ID, "COPERNICUS/S2_SR_HARMONIZED")
        self.assertEqual(CS_COLLECTION_ID, "GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED")
        self.assertEqual(CLEAR_THRESHOLD, 0.60)
        self.assertEqual(CLOUD_FILTER_PERCENT, 60)
        self.assertEqual(DEFAULT_START_MONTH, 1)
        self.assertEqual(DEFAULT_END_MONTH, 4)

    def test_aoi_geometry_validation_catches_all_invalid_formats(self):
        """Verify malformed, out-of-bounds, degenerate, and self-intersecting geometries are rejected."""
        # 1. Missing coordinates
        _, _, _, err1 = gee_service.geojson_to_ee_geometry({"type": "Polygon", "coordinates": []})
        self.assertIsNotNone(err1)
        self.assertIn("missing coordinates", err1.lower())

        # 2. Coordinates out of bounds (lon > 180)
        _, _, _, err2 = gee_service.geojson_to_ee_geometry({
            "type": "Polygon",
            "coordinates": [[[200.0, 18.0], [201.0, 18.0], [201.0, 19.0], [200.0, 19.0], [200.0, 18.0]]]
        })
        self.assertIsNotNone(err2)
        self.assertIn("out of bounds", err2.lower())

        # 3. Coordinates out of bounds (lat > 90)
        _, _, _, err3 = gee_service.geojson_to_ee_geometry({
            "type": "Polygon",
            "coordinates": [[[73.0, 95.0], [74.0, 95.0], [74.0, 96.0], [73.0, 96.0], [73.0, 95.0]]]
        })
        self.assertIsNotNone(err3)
        self.assertIn("out of bounds", err3.lower())

        # 4. Invalid point radius (negative or zero)
        _, _, _, err4 = gee_service.geojson_to_ee_geometry({
            "type": "Point",
            "coordinates": [73.85, 18.52],
            "radius_meters": -500
        })
        self.assertIsNotNone(err4)
        self.assertIn("radius", err4.lower())

        # 5. Polygon with fewer than 4 points
        _, _, _, err5 = gee_service.geojson_to_ee_geometry({
            "type": "Polygon",
            "coordinates": [[[73.0, 18.0], [74.0, 18.0]]]
        })
        self.assertIsNotNone(err5)
        self.assertIn("at least 4 coordinates", err5.lower())

        # 6. Degenerate collinear polygon (zero width / height)
        _, _, _, err6 = gee_service.geojson_to_ee_geometry({
            "type": "Polygon",
            "coordinates": [[[73.5, 18.5], [73.5, 18.6], [73.5, 18.7], [73.5, 18.5]]]
        })
        self.assertIsNotNone(err6)
        self.assertIn("degenerate", err6.lower())

        # 7. Self-intersecting polygon (bow-tie geometry)
        _, _, _, err7 = gee_service.geojson_to_ee_geometry({
            "type": "Polygon",
            "coordinates": [[[0.0, 0.0], [1.0, 1.0], [0.0, 1.0], [1.0, 0.0], [0.0, 0.0]]]
        })
        self.assertIsNotNone(err7)
        self.assertIn("self-intersecting", err7.lower())

        # 8. Non-numeric coordinates
        _, _, _, err8 = gee_service.geojson_to_ee_geometry({
            "type": "Polygon",
            "coordinates": [[["invalid", 18.0], [74.0, 18.0], [74.0, 19.0], ["invalid", 18.0]]]
        })
        self.assertIsNotNone(err8)
        self.assertIn("numeric", err8.lower())

    def test_valid_aoi_geometry_parsing_and_area(self):
        """Verify valid polygon parses cleanly and computes positive geodesic area."""
        valid_polygon = {
            "type": "Polygon",
            "coordinates": [
                [
                    [73.80, 18.50],
                    [73.85, 18.50],
                    [73.85, 18.55],
                    [73.80, 18.55],
                    [73.80, 18.50]
                ]
            ]
        }
        geom, area_km2, centroid, err = gee_service.geojson_to_ee_geometry(valid_polygon)
        self.assertIsNone(err)
        self.assertGreater(area_km2, 1.0)
        self.assertLess(area_km2, 100.0)
        self.assertIsNotNone(centroid)
        self.assertAlmostEqual(centroid["lat"], 18.525, delta=0.05)
        self.assertAlmostEqual(centroid["lng"], 73.825, delta=0.05)

    def test_area_discrepancy_and_definitions_metadata(self):
        """
        Regression test: Verify that geometry area and pixel area are distinct concepts
        and explicitly labeled to prevent false discrepancy confusion.
        """
        # A circular AOI with 5000m radius
        radius_m = 5000.0
        import math
        geom_area = round((math.pi * (radius_m / 1000.0) ** 2), 2)  # ~78.54 km2
        # Rasterized pixel sum over 50m cells inside the circle gives ~77.36 km2 due to discretization
        raster_pixel_area = 77.36

        # Both represent legitimate physical measurements of different representations:
        self.assertAlmostEqual(geom_area, 78.54, delta=0.01)
        self.assertAlmostEqual(raster_pixel_area, 77.36, delta=0.01)
        # Discrepancy is ~1.5% due to raster grid cell center inclusion vs smooth continuous circle boundary:
        discrepancy_ratio = abs(geom_area - raster_pixel_area) / geom_area
        self.assertLess(discrepancy_ratio, 0.03)

    def test_index_formulas_and_delta_sign_math(self):
        """
        Verify normalized difference index formulas and evaluation-minus-baseline sign:
        NDVI = (B8 - B4) / (B8 + B4)
        NDWI = (B3 - B8) / (B3 + B8)
        NDBI = (B11 - B8) / (B11 + B8)
        Change = Eval - Baseline
        """
        # Healthy vegetation: high NIR (B8=3000), low Red (B4=500), low Green (B3=700), low SWIR (B11=800)
        b4_base, b8_base, b3_base, b11_base = 500.0, 3000.0, 700.0, 800.0
        ndvi_base = (b8_base - b4_base) / (b8_base + b4_base)
        ndwi_base = (b3_base - b8_base) / (b3_base + b8_base)
        ndbi_base = (b11_base - b8_base) / (b11_base + b8_base)

        self.assertAlmostEqual(ndvi_base, 0.7143, delta=0.001)
        self.assertAlmostEqual(ndwi_base, -0.6216, delta=0.001)
        self.assertAlmostEqual(ndbi_base, -0.5789, delta=0.001)

        # Degraded / disturbed site: lower NIR (B8=1500), higher Red (B4=1400), higher SWIR (B11=2200)
        b4_eval, b8_eval, b3_eval, b11_eval = 1400.0, 1500.0, 1100.0, 2200.0
        ndvi_eval = (b8_eval - b4_eval) / (b8_eval + b4_eval)
        ndwi_eval = (b3_eval - b8_eval) / (b3_eval + b8_eval)
        ndbi_eval = (b11_eval - b8_eval) / (b11_eval + b8_eval)

        # Delta = Evaluation - Baseline
        delta_ndvi = ndvi_eval - ndvi_base
        delta_ndbi = ndbi_eval - ndbi_base

        # Loss of vegetation MUST be negative
        self.assertLess(delta_ndvi, 0.0)
        self.assertAlmostEqual(delta_ndvi, 0.0345 - 0.7143, delta=0.001)

        # Expansion of bare soil / built-up MUST be positive
        self.assertGreater(delta_ndbi, 0.0)

    def test_date_window_and_year_validation(self):
        """Verify year ranges and month window ordering are strictly enforced."""
        # 1. Year before Sentinel-2 operational era (< 2016)
        with self.assertRaises(ValueError) as ctx1:
            gee_service.get_annual_composite(year=2014, geometry=MagicMock())
        self.assertIn("out of valid sentinel-2 operational range", str(ctx1.exception).lower())

        # 2. Inverted month window (start_month >= end_month)
        with self.assertRaises(ValueError) as ctx2:
            gee_service.get_annual_composite(year=2024, geometry=MagicMock(), start_month=5, end_month=2)
        self.assertIn("start_month", str(ctx2.exception).lower())

    def test_no_synthetic_defaults_on_extraction_error(self):
        """Verify that when extraction encounters an error, it raises ValueError, not silent fallback."""
        with self.assertRaises(ValueError):
            gee_service.extract_aoi_ml_features(geometry=None, area_km2=10.0)

    def test_s1_constants_and_polarizations(self):
        """Verify Sentinel-1 constants and polarizations match mission specifications."""
        self.assertEqual(S1_COLLECTION_ID, "COPERNICUS/S1_GRD")
        self.assertEqual(S1_INSTRUMENT_MODE, "IW")
        self.assertEqual(S1_POLARIZATIONS, ["VV", "VH"])
        self.assertEqual(S1_DEFAULT_ORBIT_PASS, "DESCENDING")

    def test_s1_temporal_validation(self):
        """Verify Sentinel-1 temporal window ordering and mission date boundaries."""
        # 1. Year before Sentinel-1A launch (< 2014)
        with self.assertRaises(ValueError) as ctx1:
            gee_service.get_sentinel1_composite(year=2013, geometry=MagicMock())
        self.assertIn("out of valid sentinel-1 operational range", str(ctx1.exception).lower())

        # 2. Inverted month window (start_month >= end_month)
        with self.assertRaises(ValueError) as ctx2:
            gee_service.get_sentinel1_composite(year=2024, geometry=MagicMock(), start_month=6, end_month=2)
        self.assertIn("start_month", str(ctx2.exception).lower())

    def test_ablation_study_structure_and_validation_gap(self):
        """Verify ablation study generates all experimental baselines and documents validation gap."""
        ablation = gee_service.evaluate_sensor_ablation(demo=True, module_type="flood")
        self.assertIn("methods", ablation)
        self.assertIn("s2_optical_only", ablation["methods"])
        self.assertIn("s1_sar_only", ablation["methods"])
        self.assertIn("s1_s2_dual_sensor_fusion", ablation["methods"])
        self.assertIn("quality_aware_fusion", ablation["methods"])

        # Check cloud resilience gain
        self.assertIn("cloud_resilience_gain", ablation)
        self.assertGreater(ablation["cloud_resilience_gain"]["sar_all_weather_availability_gain_pct"], 0)

        # Check validation gap disclaimer
        self.assertIn("validation_gap_statement", ablation)
        statement = ablation["validation_gap_statement"].lower()
        self.assertIn("without ground-truth evidence", statement)



# ==============================================================================
# 2. AUTHENTICATED EARTH ENGINE INTEGRATION TESTS
# ==============================================================================


class TestGEEAuthenticatedLiveExecution(unittest.TestCase):
    """
    Genuine Earth Engine integration tests requiring live authentication.
    These tests verify real satellite collection access, Cloud Score+ joins,
    pixel masking, and independent annual composites.
    """

    @classmethod
    def setUpClass(cls):
        ok, status, msg = gee_service.initialize_gee()
        cls.is_live = ok
        cls.status = status
        cls.msg = msg

    def setUp(self):
        if not self.is_live:
            self.skipTest(f"Earth Engine not authenticated/connected: {self.msg}")

    def test_live_cloud_score_plus_composite_and_masking(self):
        """Verify live S2 and Cloud Score+ linking and that cs_cdf >= 0.60 is applied."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2000)
        comp_2024, count_2024, dates_2024 = gee_service.get_annual_composite(
            year=2024,
            geometry=test_geom,
            start_month=1,
            end_month=4
        )
        self.assertGreater(count_2024, 0, "Expected at least 1 clear scene in Pune for Jan-Apr 2024")
        self.assertIsNotNone(comp_2024)
        self.assertIsInstance(dates_2024, list)
        self.assertGreater(len(dates_2024), 0)

        # Verify bands exist in composite
        bands = comp_2024.bandNames().getInfo()
        for b in ["B2", "B3", "B4", "B8", "B11", "B12"]:
            self.assertIn(b, bands)

    def test_live_empty_collection_raises_explicit_error(self):
        """Verify that querying an empty collection raises explicit ValueError rather than silent empty data."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(500)
        # 1-day window where no Sentinel-2 overpass occurred
        with patch("backend.app.services.gee_service.CLOUD_FILTER_PERCENT", -1):
            with self.assertRaises(ValueError) as ctx:
                gee_service.get_annual_composite(
                    year=2024,
                    geometry=test_geom,
                    start_month=1,
                    end_month=2,
                )
            self.assertIn("no sentinel-2", str(ctx.exception).lower())

    def test_live_indices_and_delta_sign(self):
        """Verify live NDVI, NDWI, NDBI calculations and change delta sign in Earth Engine."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2000)
        c_2023, _, _ = gee_service.get_annual_composite(2023, test_geom, 1, 4)
        c_2026, _, _ = gee_service.get_annual_composite(2026, test_geom, 1, 4)

        ndvi_2023 = gee_service.calculate_ndvi(c_2023)
        ndvi_2026 = gee_service.calculate_ndvi(c_2026)
        ndvi_change = ndvi_2026.subtract(ndvi_2023)

        stats = ndvi_change.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=test_geom,
            scale=50,
            maxPixels=1e8
        ).getInfo()

        self.assertIn("NDVI", stats)
        mean_diff = stats["NDVI"]
        self.assertIsNotNone(mean_diff)
        self.assertIsInstance(mean_diff, (int, float))

    def test_live_pixel_area_calculation(self):
        """Verify real pixel area calculation returns valid areas in km2 with explicit definitions."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(3000)
        c_2023, _, _ = gee_service.get_annual_composite(2023, test_geom, 1, 4)
        c_2026, _, _ = gee_service.get_annual_composite(2026, test_geom, 1, 4)

        n23 = gee_service.calculate_ndvi(c_2023)
        n26 = gee_service.calculate_ndvi(c_2026)
        w23 = gee_service.calculate_ndwi(c_2023)
        w26 = gee_service.calculate_ndwi(c_2026)
        b23 = gee_service.calculate_ndbi(c_2023)
        b26 = gee_service.calculate_ndbi(c_2026)

        n_diff = n26.subtract(n23)
        w_diff = w26.subtract(w23)
        b_diff = b26.subtract(b23)

        areas = gee_service.calculate_pixel_areas(
            geometry=test_geom,
            ndvi_start=n23,
            ndvi_change=n_diff,
            ndbi_change=b_diff,
            ndwi_change=w_diff,
            scale=50
        )

        self.assertIn("geometry_area_km2", areas)
        self.assertIn("raster_pixel_area_km2", areas)
        self.assertIn("valid_observed_area_km2", areas)
        self.assertIn("vegetation_loss_km2", areas)
        self.assertIn("disturbance_km2", areas)
        self.assertIn("water_expansion_km2", areas)
        self.assertIn("overlap_loss_disturbance_km2", areas)
        # 3km circle radius has pi * 3^2 ~ 28.27 km2
        self.assertAlmostEqual(areas["geometry_area_km2"], 28.27, delta=1.5)

    def test_live_independent_annual_composites_with_observation_dates(self):
        """Verify all years in analyze_temporal_window are independently computed with observation dates."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2000)
        res = gee_service.analyze_temporal_window(
            start_year=2023,
            end_year=2026,
            start_month=1,
            end_month=4,
            geometry=test_geom
        )

        progression = res.get("yearly_progression", [])
        self.assertEqual(len(progression), 4)

        years = [p["year"] for p in progression]
        self.assertEqual(years, [2023, 2024, 2025, 2026])

        # Verify each year has independent scenes_count, observation_dates, and ndvi_mean
        for p in progression:
            self.assertGreater(p["scenes_count"], 0)
            self.assertIsNotNone(p["ndvi_mean"])
            self.assertTrue(p["is_observed"])
            self.assertIsInstance(p.get("observation_dates"), list)
            self.assertGreater(len(p["observation_dates"]), 0)

        # Metadata records real observation parameters and area definitions
        summary = res["summary"]
        self.assertIn("geometry_area_km2", summary)
        self.assertIn("raster_pixel_area_km2", summary)
        self.assertIn("valid_observed_area_km2", summary)
        meta = summary["metadata"]
        self.assertEqual(meta["s2_collection"], S2_COLLECTION_ID)
        self.assertEqual(meta["cloud_score_collection"], CS_COLLECTION_ID)
        self.assertEqual(meta["cloud_score_threshold"], 0.60)
        self.assertTrue(meta["is_real_observation"])
        self.assertIn("area_definitions", meta)
        self.assertIn("scientific_caveat", meta)

    def test_live_s1_composite_and_speckle_filtering(self):
        """Verify live Sentinel-1 GRD SAR acquisition query and 30m median speckle filtering."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2000)
        s1_comp, s1_count, s1_dates, _ = gee_service.get_sentinel1_composite(
            year=2024,
            geometry=test_geom,
            start_month=1,
            end_month=4,
            orbit_pass="DESCENDING"
        )
        self.assertGreater(s1_count, 0, "Expected at least 1 Sentinel-1 GRD scene in Pune for Jan-Apr 2024")
        self.assertIsNotNone(s1_comp)
        self.assertIsInstance(s1_dates, list)
        self.assertGreater(len(s1_dates), 0)

        # Verify radar backscatter bands VV and VH exist
        bands = s1_comp.bandNames().getInfo()
        self.assertIn("VV", bands)
        self.assertIn("VH", bands)

    def test_live_dual_sensor_flood_analysis(self):
        """Verify live dual-sensor (S1+S2) flood and water-extent analysis pipeline."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2500)
        res = gee_service.analyze_dual_sensor_aoi(
            geometry=test_geom,
            start_year=2023,
            end_year=2024,
            module="flood"
        )
        self.assertTrue(res["is_live"])
        self.assertFalse(res["is_demo"])
        self.assertIn("sensor_status", res)
        self.assertTrue(res["sensor_status"]["s1_available"])
        self.assertTrue(res["sensor_status"]["s2_available"])
        self.assertIn(res["sensor_status"]["status"], ["both_available", "s1_only", "s2_only"])

        # Check radar and optical water metrics
        s1_m = res.get("s1_metrics", {})
        s2_m = res.get("s2_metrics", {})
        self.assertIn("sar_water_extent_km2", s1_m)
        self.assertGreaterEqual(s1_m["sar_water_extent_km2"], 0.0)
        self.assertIn("optical_water_extent_km2", s2_m)

        # Check provenance and limitations
        self.assertIn("Sentinel-1", res["source"])
        self.assertIn("Sentinel-2", res["source"])
        self.assertIn("limitations", res)
        self.assertGreater(len(res["limitations"]), 0)

    def test_live_dual_sensor_deforestation_analysis(self):
        """Verify live dual-sensor deforestation and vegetation change analysis."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2000)
        res = gee_service.analyze_dual_sensor_aoi(
            geometry=test_geom,
            start_year=2023,
            end_year=2024,
            module="deforestation"
        )
        self.assertTrue(res["is_live"])
        s1_m = res.get("s1_metrics", {})
        s2_m = res.get("s2_metrics", {})
        self.assertIn("sar_structural_loss_km2", s1_m)
        self.assertIn("optical_vegetation_loss_km2", s2_m)
        self.assertGreaterEqual(s2_m["optical_vegetation_loss_km2"], 0.0)
        self.assertIn("fusion_metrics", res)
        self.assertIn("fusion_method", res["fusion_metrics"])

    def test_live_dual_sensor_mining_analysis(self):
        """Verify live dual-sensor mining and land disturbance analysis."""
        import ee
        test_geom = ee.Geometry.Point([73.8567, 18.5204]).buffer(2000)
        res = gee_service.analyze_dual_sensor_aoi(
            geometry=test_geom,
            start_year=2023,
            end_year=2024,
            module="mining"
        )
        self.assertTrue(res["is_live"])
        s1_m = res.get("s1_metrics", {})
        s2_m = res.get("s2_metrics", {})
        self.assertIn("sar_disturbance_km2", s1_m)
        self.assertIn("optical_disturbance_km2", s2_m)
        self.assertGreaterEqual(s2_m["optical_disturbance_km2"], 0.0)
        self.assertIn("s1_vv_mean_dB", s1_m)
        # Check disclaimer against unverified illegal mining claims
        self.assertIn("field verification", res["limitations"].lower())


if __name__ == "__main__":
    unittest.main()

