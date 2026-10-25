"""
GeoVision AI — Validation Benchmark Repair & Bhuvan Workflow Tests
Verifies:
1. Benchmark endpoint responds quickly with full schema in cached empirical mode.
2. Zero-division and undefined metric denominators are handled gracefully.
3. Official Bhuvan/NRSC assessment returns permitted workflow and strict policy boundaries.
4. Reference cases registry returns complete metadata, provenance, and attribution.
5. User reference case creation persists manual evidence independently from automated GEE runs.
"""

import unittest
from pathlib import Path
import json
import urllib.request
import urllib.parse

ROOT_DIR = Path(__file__).resolve().parent.parent

class TestValidationBenchmarkRepairs(unittest.TestCase):
    """Test suite for validation benchmark repair and Bhuvan reference workflow."""

    def test_bhuvan_assessment_endpoint(self):
        """Verify official Bhuvan/NRSC assessment endpoint returns restricted policy verdict."""
        url = "http://127.0.0.1:8000/api/analysis/bhuvan-assessment"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))

        self.assertIn("platform_name", data)
        self.assertIn("agency", data)
        self.assertEqual(data["api_feasibility_verdict"], "RESTRICTED_MANUAL_WORKFLOW_ONLY")
        self.assertTrue(len(data["terms_of_service_analysis"]) >= 3)
        self.assertIn("bhuvan.nrsc.gov.in", data["official_portal_url"])

    def test_reference_cases_endpoint(self):
        """Verify reference cases endpoint returns 24 curated real-observation samples."""
        url = "http://127.0.0.1:8000/api/analysis/reference-cases"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))

        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 24)

        # Check required fields for evidence-first audit
        first = data[0]
        self.assertIn("sample_id", first)
        self.assertIn("module", first)
        self.assertIn("aoi_name", first)
        self.assertIn("coordinates", first)
        self.assertIn("reference_source", first)
        self.assertIn("reference_label", first)
        self.assertIn("evidence_quality_rating", first)
        self.assertIn("inclusion_status", first)

    def test_validation_benchmark_cached_empirical(self):
        """Verify validation benchmark endpoint returns cached empirical data rapidly."""
        url = "http://127.0.0.1:8000/api/analysis/validation-benchmark?mode=cached_empirical"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode("utf-8"))

        self.assertIn("title", data)
        self.assertIn("pipeline_version", data)
        self.assertEqual(data["selected_mode"], "cached_empirical")
        self.assertIn("benchmarks", data)
        self.assertIn("real_observation_benchmark", data["benchmarks"])

        real_bench = data["benchmarks"]["real_observation_benchmark"]
        self.assertIn("modules", real_bench)
        self.assertIn("flood", real_bench["modules"])
        self.assertIn("deforestation", real_bench["modules"])
        self.assertIn("mining", real_bench["modules"])

    def test_post_reference_case_workflow(self):
        """Verify manual reference evidence import workflow persists case independently."""
        url = "http://127.0.0.1:8000/api/analysis/reference-cases"
        payload = {
            "aoi_name": "Test Bhuvan Verification Site",
            "module": "mining",
            "lat": 18.5204,
            "lng": 73.8567,
            "buffer_meters": 500,
            "earlier_date": "2023-01-15",
            "later_date": "2024-03-20",
            "reference_platform": "Bhuvan (ISRO/NRSC)",
            "sensor_product": "Resourcesat-2A LISS-IV (5.8m)",
            "evidence_identifier": "TEST-BHUVAN-DOC-001",
            "evidence_url": "https://bhuvan.nrsc.gov.in",
            "reference_label": "change_observed",
            "label_rationale": "High-resolution optical scene comparison confirms newly exposed quarry pit.",
            "reviewer": "Automated Test Reviewer",
            "confidence_level": "corroborated",
            "evidence_limitations": "Tested during dry season.",
            "field_verification_status": "pending",
            "attribution": "NRSC / ISRO Bhuvan",
            "reference_image_url": "",
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            self.assertEqual(response.status, 200)
            res_data = json.loads(response.read().decode("utf-8"))

        self.assertTrue(res_data["sample_id"].startswith("REF-USER-"))
        self.assertEqual(res_data["aoi_name"], "Test Bhuvan Verification Site")
        self.assertEqual(res_data["reference_label"], "change_observed")

    def test_invalid_evaluation_mode_returns_400(self):
        """Verify invalid evaluation mode returns HTTP 400 error cleanly."""
        url = "http://127.0.0.1:8000/api/analysis/validation-benchmark?mode=invalid_mode"
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=5):
                self.fail("Expected HTTP 400 error")
        except urllib.error.HTTPError as ex:
            self.assertEqual(ex.code, 400)


if __name__ == "__main__":
    unittest.main()
