"""
GeoVision AI — Regression Tests for AOI Report Integrity & Geographic Independence
Verifies:
1. Custom AOI reports correctly unpack supported nested `analysis_results` payloads.
2. Non-Pune AOI reports reflect exact custom area/metrics and NEVER inherit Pune baseline numbers.
3. Empty or malformed AOI payloads return HTTP 400 error instead of substituting Pune baseline metrics.
4. Custom GeoJSON export requires valid geometry and never silently substitutes Pune boundary.
5. Regional Pune pilot reports remain explicitly separate and operational.
"""

import unittest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

class TestAOIReportIntegrity(unittest.TestCase):
    """Test suite ensuring report integrity and preventing silent Pune baseline fallback."""

    def setUp(self):
        # A realistic non-Pune AOI: Jim Corbett National Park Buffer, Uttarakhand
        self.non_pune_polygon = {
            "type": "Polygon",
            "coordinates": [[
                [78.78, 29.51],
                [78.82, 29.51],
                [78.82, 29.55],
                [78.78, 29.55],
                [78.78, 29.51]
            ]]
        }

        # Simulated or extracted non-Pune findings (17.21 km2, Risk 17)
        self.non_pune_analysis_results = {
            "region_name": "Jim Corbett Reserve Buffer (Uttarakhand)",
            "area_km2": 17.21,
            "geometry": self.non_pune_polygon,
            "start_year": 2023,
            "end_year": 2026,
            "source": "Copernicus Sentinel-2 Level-2A via Google Earth Engine",
            "is_live": True,
            "is_demo": False,
            "summary": {
                "total_area_km2": 17.21,
                "vegetation_loss_km2": 0.45,
                "disturbance_km2": 0.32,
                "water_expansion_km2": 0.12,
                "net_ndvi_change": -0.024,
                "net_ndbi_change": +0.018,
                "net_ndwi_change": +0.006,
                "dominant_risk": "Vegetation Loss",
                "risk_score": 17,
                "risk_level": "Low",
            },
            "ml_result": {
                "prediction": 0,
                "probability": 0.17,
                "risk_score": 17,
                "risk_level": "Low",
                "label": "Normal / Stable Ecological State",
                "top_features": [
                    {"feature": "NDVI_2026", "value": 0.52, "importance": 0.24, "description": "High canopy vigor"},
                    {"feature": "NDBI_Change", "value": 0.018, "importance": 0.21, "description": "Minor soil bareness"},
                ],
            },
            "yearly_progression": [
                {"year": 2023, "ndvi_mean": 0.54, "ndbi_mean": -0.10, "ndwi_mean": -0.15, "vegetation_health": "Dense Forest"},
                {"year": 2026, "ndvi_mean": 0.52, "ndbi_mean": -0.08, "ndwi_mean": -0.14, "vegetation_health": "Dense Forest"},
            ]
        }

    def test_nested_analysis_results_payload_support(self):
        """Supported nested analysis_results payloads must be unpacked correctly."""
        nested_payload = {
            "aoi_name": "Jim Corbett Reserve Buffer (Uttarakhand)",
            "geometry": self.non_pune_polygon,
            "analysis_period": "2023 to 2026",
            "analysis_results": self.non_pune_analysis_results
        }
        res = client.post("/api/reports/generate-aoi-report", json=nested_payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        # Must reflect the non-Pune area and metrics, not Pune's 78.54 km2 or risk 74
        self.assertEqual(data["area_km2"], 17.21)
        self.assertEqual(data["risk_score"], 17)
        self.assertIn("Jim Corbett", data["title"])
        self.assertIn("Bounding Extent", data["bbox_info"])
        self.assertIn("78.7800°E", data["bbox_info"])
        self.assertIn("29.5100°N", data["bbox_info"])

    def test_non_pune_aoi_report_cannot_inherit_pune_baseline_metrics(self):
        """Custom non-Pune AOI reports must NEVER inherit Pune pilot area (78.54 km2) or risk score (74)."""
        flattened_payload = {
            "region_name": "Jim Corbett Reserve Buffer (Uttarakhand)",
            "geometry": self.non_pune_polygon,
            "area_km2": 17.21,
            "start_year": 2023,
            "end_year": 2026,
            "source": "Copernicus Sentinel-2 Level-2A via Google Earth Engine",
            "is_live": True,
            "is_demo": False,
            "summary": self.non_pune_analysis_results["summary"],
            "ml_result": self.non_pune_analysis_results["ml_result"],
            "yearly_progression": self.non_pune_analysis_results["yearly_progression"],
        }
        res = client.post("/api/reports/generate-aoi-report", json=flattened_payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertNotEqual(data["area_km2"], 78.54, "Must not inherit Pune pilot area")
        self.assertNotEqual(data["risk_score"], 74, "Must not inherit Pune pilot risk score")
        self.assertEqual(data["area_km2"], 17.21)
        self.assertEqual(data["risk_score"], 17)
        self.assertNotIn("Pune", data["title"])

    def test_missing_or_malformed_aoi_payload_returns_400_not_pune_fallback(self):
        """Empty or malformed payload must return 400 validation error, NOT substitute Pune baseline."""
        # 1. Empty payload
        res_empty = client.post("/api/reports/generate-aoi-report", json={})
        self.assertEqual(res_empty.status_code, 400)
        self.assertIn("Payload is required", res_empty.json()["detail"])

        # 2. Missing summary and ml_result
        malformed = {"region_name": "Unknown Zone", "area_km2": 10.0}
        res_malformed = client.post("/api/reports/generate-aoi-report", json=malformed)
        self.assertEqual(res_malformed.status_code, 400)
        self.assertIn("Missing required AOI analysis findings", res_malformed.json()["detail"])

    def test_aoi_pdf_requires_valid_findings_and_rejects_empty(self):
        """AOI PDF generation must reject empty payload with 400, not substitute Pune data."""
        res_empty = client.post("/api/reports/aoi-pdf", json={})
        self.assertEqual(res_empty.status_code, 400)

        # Valid non-Pune payload produces valid PDF
        nested_payload = {
            "region_name": "Jim Corbett Reserve Buffer",
            "geometry": self.non_pune_polygon,
            "analysis_results": self.non_pune_analysis_results
        }
        res_valid = client.post("/api/reports/aoi-pdf", json=nested_payload)
        self.assertEqual(res_valid.status_code, 200)
        self.assertTrue(res_valid.content.startswith(b"%PDF"))

    def test_aoi_geojson_export_requires_geometry_and_has_no_pune_fallback(self):
        """Custom AOI GeoJSON export must require valid geometry and not substitute Pune coordinates."""
        # Missing geometry should fail with 400
        res_no_geom = client.post("/api/export/aoi-geojson", json={"region_name": "Test Zone"})
        self.assertEqual(res_no_geom.status_code, 400)
        self.assertIn("Missing required valid polygon geometry", res_no_geom.json()["detail"])

        # Valid non-Pune polygon must export only non-Pune coordinates
        valid_payload = {
            "region_name": "Jim Corbett Reserve Buffer",
            "geometry": self.non_pune_polygon,
            "analysis_results": self.non_pune_analysis_results
        }
        res_valid = client.post("/api/export/aoi-geojson", json=valid_payload)
        self.assertEqual(res_valid.status_code, 200)
        gj = res_valid.json()
        first_pt = gj["features"][0]["geometry"]["coordinates"][0][0]
        self.assertAlmostEqual(first_pt[0], 78.78, delta=0.01)
        self.assertAlmostEqual(first_pt[1], 29.51, delta=0.01)

    def test_regional_pune_report_endpoints_remain_separate_and_intact(self):
        """Regional Pune pilot reporting remains separate and intact."""
        res_summary = client.get("/api/reports/summary")
        self.assertEqual(res_summary.status_code, 200)
        summary = res_summary.json()
        self.assertTrue("source" in summary or "summary" in summary)

        res_pdf = client.get("/api/reports/pdf")
        self.assertEqual(res_pdf.status_code, 200)
        self.assertTrue(res_pdf.content.startswith(b"%PDF"))

        res_geojson = client.get("/api/export/geojson?limit=5")
        self.assertEqual(res_geojson.status_code, 200)
        gj = res_geojson.json()
        self.assertTrue(len(gj["features"]) > 0)

    def test_deeply_nested_analysis_results_summary_payload(self):
        """Supported nested analysis_results.summary payloads must be unpacked correctly."""
        nested_payload = {
            "aoi_name": "Sundarbans Coastal Mangrove Delta",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[88.80, 21.85], [88.95, 21.85], [88.95, 21.98], [88.80, 21.98], [88.80, 21.85]]]
            },
            "analysis_results": {
                "status": "success",
                "summary": {
                    "total_area_km2": 45.80,
                    "geometry_area_km2": 45.80,
                    "vegetation_loss_km2": 2.10,
                    "disturbance_km2": 0.85,
                    "water_expansion_km2": 6.40,
                    "net_ndvi_change": -0.035,
                    "net_ndbi_change": +0.015,
                    "net_ndwi_change": +0.082,
                    "dominant_risk": "Water Extent / Inundation",
                    "risk_score": 64,
                    "risk_level": "High",
                }
            }
        }
        res = client.post("/api/reports/generate-aoi-report", json=nested_payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["area_km2"], 45.80)
        self.assertEqual(data["risk_score"], 64)
        self.assertEqual(data["risk_level"], "High")
        self.assertIn("Sundarbans", data["title"])
        self.assertNotIn("Pune", data["title"])
        self.assertNotEqual(data["area_km2"], 78.54)
        self.assertNotEqual(data["risk_score"], 74)

    def test_malformed_empty_and_non_dict_summary_returns_400_not_pune_fallback(self):
        """Empty or non-dict summary must return HTTP 400 validation error without substituting Pune baseline."""
        # Empty summary dict
        empty_summary_payload = {
            "region_name": "Singrauli Quarry Area",
            "analysis_results": {
                "summary": {}
            }
        }
        res1 = client.post("/api/reports/generate-aoi-report", json=empty_summary_payload)
        self.assertEqual(res1.status_code, 400)
        self.assertIn("Missing required AOI analysis findings", res1.json()["detail"])

        # Non-dict summary
        nondict_summary_payload = {
            "region_name": "Singrauli Quarry Area",
            "summary": "invalid_string_summary"
        }
        res2 = client.post("/api/reports/generate-aoi-report", json=nondict_summary_payload)
        self.assertEqual(res2.status_code, 400)
        self.assertIn("Missing required AOI analysis findings", res2.json()["detail"])

        # PDF endpoint also rejects malformed summary
        res3 = client.post("/api/reports/aoi-pdf", json=empty_summary_payload)
        self.assertEqual(res3.status_code, 400)
        self.assertIn("Missing required AOI analysis findings", res3.json()["detail"])

    def test_distinct_non_pune_aois_never_inherit_pune_metrics_in_pdf_and_report(self):
        """Multiple distinct non-Pune AOIs must preserve exact areas, coordinates, and hazard classifications."""
        sundarbans_payload = {
            "aoi_name": "Sundarbans Biosphere Fringe",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[88.80, 21.85], [88.92, 21.85], [88.92, 21.95], [88.80, 21.95], [88.80, 21.85]]]
            },
            "summary": {
                "total_area_km2": 31.42,
                "vegetation_loss_km2": 1.15,
                "disturbance_km2": 0.40,
                "water_expansion_km2": 4.10,
                "net_ndvi_change": -0.018,
                "net_ndbi_change": +0.008,
                "net_ndwi_change": +0.075,
                "dominant_risk": "Flood / Inundation",
                "risk_score": 58,
                "risk_level": "Medium",
            }
        }
        # JSON Report
        res_report = client.post("/api/reports/generate-aoi-report", json=sundarbans_payload)
        self.assertEqual(res_report.status_code, 200)
        data = res_report.json()
        self.assertEqual(data["area_km2"], 31.42)
        self.assertEqual(data["risk_score"], 58)
        self.assertNotIn("Pune", data["title"])
        self.assertIn("88.8000°E", data["bbox_info"])
        self.assertIn("21.8500°N", data["bbox_info"])

        # PDF Report
        res_pdf = client.post("/api/reports/aoi-pdf", json=sundarbans_payload)
        self.assertEqual(res_pdf.status_code, 200)
        self.assertTrue(res_pdf.content.startswith(b"%PDF"))

    def test_export_aoi_csv_requires_valid_findings_and_rejects_empty(self):
        """AOI CSV export requires valid findings and rejects empty payloads with 400."""
        res_empty = client.post("/api/export/aoi-csv", json={})
        self.assertEqual(res_empty.status_code, 400)

        res_malformed = client.post("/api/export/aoi-csv", json={"region_name": "Test", "summary": {}})
        self.assertEqual(res_malformed.status_code, 400)

        valid_payload = {
            "region_name": "Jim Corbett Reserve Buffer",
            "geometry": self.non_pune_polygon,
            "analysis_results": self.non_pune_analysis_results
        }
        res_valid = client.post("/api/export/aoi-csv", json=valid_payload)
        self.assertEqual(res_valid.status_code, 200)
        self.assertIn("text/csv", res_valid.headers.get("content-type", ""))
        self.assertIn("Jim Corbett", res_valid.text)
        self.assertNotIn("78.54", res_valid.text)

if __name__ == "__main__":
    unittest.main()
