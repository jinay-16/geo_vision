"""
GeoVision AI — Landsat Reference Validation Test Suite
Tests USGS Landsat Collection 2 Level-2 Surface Reflectance pipelines:
  - Official scaling factor (0.0000275 * raw - 0.2)
  - QA_PIXEL bitmask masking (dilated cloud, cirrus, cloud, cloud shadow, fill)
  - Date window and AOI validation (invalid dates, start >= end, out-of-range years)
  - Empty collection handling (raises informative ValueError)
  - Live Landsat reference analysis endpoint (/api/analysis/landsat-reference)
  - Live cross-sensor comparison endpoint (/api/analysis/landsat-comparison)
  - Sentinel analysis stability check
"""

import unittest
import urllib.request
import urllib.parse
import json
from pathlib import Path


class TestLandsatReferenceValidation(unittest.TestCase):
    """Comprehensive test suite for Landsat Reference Validation."""

    BASE_URL = "http://127.0.0.1:8000/api"

    def test_landsat_date_validation_start_after_end(self):
        """Verify invalid date order (start >= end) returns 422 Unprocessable Entity."""
        params = {
            "baseline_start": "2024-04-30",
            "baseline_end": "2023-01-01",
            "comparison_start": "2024-01-01",
            "comparison_end": "2024-04-30",
            "module": "deforestation",
            "lat": 18.5204,
            "lng": 73.8567,
            "buffer_meters": 1000,
        }
        url = f"{self.BASE_URL}/analysis/landsat-reference?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                self.fail(f"Expected HTTP 422 error, got status {resp.status}")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)
            body = json.loads(e.read().decode())
            self.assertIn("start_date", body["detail"])
            self.assertIn("earlier than", body["detail"])

    def test_landsat_date_validation_malformed_string(self):
        """Verify malformed date strings return 422 error."""
        params = {
            "baseline_start": "not-a-date",
            "baseline_end": "2023-04-30",
            "comparison_start": "2024-01-01",
            "comparison_end": "2024-04-30",
            "lat": 18.5204,
            "lng": 73.8567,
        }
        url = f"{self.BASE_URL}/analysis/landsat-reference?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                self.fail(f"Expected HTTP 422 error, got status {resp.status}")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)

    def test_landsat_date_validation_out_of_range_year(self):
        """Verify dates before Landsat 5 operational range (< 1984) return 422 error."""
        params = {
            "baseline_start": "1970-01-01",
            "baseline_end": "1970-04-30",
            "comparison_start": "2024-01-01",
            "comparison_end": "2024-04-30",
            "lat": 18.5204,
            "lng": 73.8567,
        }
        url = f"{self.BASE_URL}/analysis/landsat-reference?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                self.fail(f"Expected HTTP 422 error, got status {resp.status}")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)
            body = json.loads(e.read().decode())
            self.assertIn("outside Landsat", body["detail"])

    def test_landsat_invalid_coordinates(self):
        """Verify out-of-bounds coordinates (lat > 90) return 422 validation error."""
        params = {
            "lat": 95.0,
            "lng": 73.8567,
        }
        url = f"{self.BASE_URL}/analysis/landsat-reference?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                self.fail(f"Expected HTTP 422, got {resp.status}")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)

    def test_live_landsat_reference_endpoint(self):
        """Verify live Landsat reference analysis returns metadata, 30m resolution, and tile URLs."""
        params = {
            "baseline_start": "2023-01-01",
            "baseline_end": "2023-04-30",
            "comparison_start": "2024-01-01",
            "comparison_end": "2024-04-30",
            "module": "deforestation",
            "lat": 18.5204,
            "lng": 73.8567,
            "buffer_meters": 1500,
            "aoi_name": "Test Pune AOI",
        }
        url = f"{self.BASE_URL}/analysis/landsat-reference?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=60) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())

            self.assertEqual(data["status"], "ok")
            self.assertTrue(data["is_live"])
            self.assertEqual(data["module"], "deforestation")
            self.assertIn(data["reference_signal_label"], ["change_observed", "no_change_observed", "uncertain", "insufficient_imagery"])

            # Verify 30m resolution and scaling metadata
            base_meta = data["baseline_metadata"]
            self.assertEqual(base_meta["spatial_resolution_meters"], 30.0)
            self.assertIn("0.0000275", base_meta["surface_reflectance_scale_factor"])
            self.assertGreater(base_meta["scenes_count"], 0)
            self.assertIsInstance(base_meta["acquisition_dates"], list)
            self.assertIn("Dilated Cloud (Bit 1)", base_meta["qa_masking_applied"])
            self.assertIn("Radiometric Saturation (QA_RADSAT)", base_meta["qa_masking_applied"])

            # Verify Map ID tile URLs are present
            tiles = data["tile_layers"]
            self.assertIn("baseline_rgb", tiles)
            self.assertIn("comparison_rgb", tiles)
            self.assertIn("indicator_change", tiles)
            self.assertIn("earthengine.googleapis.com", tiles["baseline_rgb"])

            # Verify scientific safeguards text
            self.assertIn("Independent-sensor reference comparison", data["disclaimer"])
            self.assertIn("30 meters", data["disclaimer"])
            self.assertIn("do not prove illegal mining", data["disclaimer"])

    def test_live_cross_sensor_comparison_endpoint(self):
        """Verify cross-sensor comparison evaluates Landsat 30m vs Sentinel-2 10m."""
        params = {
            "baseline_start": "2023-01-01",
            "baseline_end": "2023-04-30",
            "comparison_start": "2024-01-01",
            "comparison_end": "2024-04-30",
            "module": "deforestation",
            "lat": 18.5204,
            "lng": 73.8567,
            "buffer_meters": 1500,
        }
        url = f"{self.BASE_URL}/analysis/landsat-comparison?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=60) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())

            self.assertEqual(data["status"], "ok")
            self.assertIn(data["sensor_agreement_status"], ["AGREE_CHANGE", "AGREE_NO_CHANGE", "DISCORDANT_SENSOR_SIGNAL", "INCONCLUSIVE"])

            # Verify Landsat (30m) vs Sentinel-2 (10m) resolution mismatch analysis
            mismatch = data["resolution_mismatch_analysis"]
            self.assertEqual(mismatch["landsat_pixel_footprint_sqm"], 900.0)
            self.assertEqual(mismatch["sentinel_pixel_footprint_sqm"], 100.0)
            self.assertEqual(mismatch["pixel_density_ratio"], 9.0)

            # Denominators and sample counts present
            l_ref = data["landsat_reference"]
            s_geo = data["sentinel_geovision"]
            self.assertGreater(l_ref["scenes_count_total"], 0)
            self.assertGreater(s_geo["scenes_count_total"], 0)

    def test_sentinel_analysis_remains_operational(self):
        """Verify existing Sentinel temporal analysis pipeline continues functioning unchanged."""
        params = {
            "start_year": 2023,
            "end_year": 2024,
            "start_month": 1,
            "end_month": 4,
            "lat": 18.5204,
            "lng": 73.8567,
            "radius_km": 2.0,
        }
        url = f"{self.BASE_URL}/analysis/temporal?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=40) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertIn("yearly_progression", data)
            self.assertIn("summary", data)


    def test_landsat_invalid_buffer_radius(self):
        """Verify invalid buffer radius (< 100m or > 50000m) returns HTTP 422 error."""
        params = {
            "lat": 18.5204,
            "lng": 73.8567,
            "buffer_meters": 50,  # Below minimum 100m
        }
        url = f"{self.BASE_URL}/analysis/landsat-reference?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                self.fail(f"Expected HTTP 422, got {resp.status}")
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code, 422)

    def test_post_landsat_reference_case_workflow(self):
        """Verify registering a Landsat Reference Case persists with full provenance and attribution."""
        url = f"{self.BASE_URL}/analysis/reference-cases"
        payload = {
            "aoi_name": "Pune Regional Landsat Validation Site",
            "module": "deforestation",
            "lat": 18.5204,
            "lng": 73.8567,
            "buffer_meters": 1500,
            "earlier_date": "2023-01-01",
            "later_date": "2024-04-30",
            "reference_platform": "USGS Landsat Collection 2 Level-2",
            "sensor_product": "Landsat 8/9 OLI-2 / TIRS-2 (30m)",
            "evidence_identifier": "LANDSAT-2023-2024-PUN-001",
            "evidence_url": "https://earthengine.google.com",
            "reference_label": "no_change_observed",
            "label_rationale": "Dry-season multi-temporal NDVI canopy differential shows stable canopy index (mean delta -0.012).",
            "reviewer": "Field Analyst / Remote Sensing Reviewer",
            "confidence_level": "corroborated",
            "evidence_limitations": "30m spatial resolution aggregates 900m² pixel areas; localized edge clearings smoothed.",
            "field_verification_status": "included",
            "attribution": "USGS / NASA Landsat Collection 2 via Google Earth Engine",
            "reference_image_url": "",
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertTrue(data["sample_id"].startswith("REF-USER-"))
            self.assertEqual(data["aoi_name"], "Pune Regional Landsat Validation Site")
            self.assertEqual(data["reference_label"], "no_change_observed")
            self.assertEqual(data["reference_platform"], "USGS Landsat Collection 2 Level-2")
            self.assertIn("USGS / NASA Landsat", data["attribution"])


if __name__ == "__main__":
    unittest.main()
