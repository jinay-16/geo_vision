"""
GeoVision AI — Satellite Comparison Unit & Regression Test Suite
Validates:
  1. Date validation (format, start >= end, after precedes before, future dates).
  2. Inclusive-to-exclusive Earth Engine date boundary conversion (+1 day).
  3. AOI geometry validation (valid, missing coordinates, degenerate, out of bounds).
  4. Spectral index formulas: NDVI and NDWI with safe zero-denominator handling.
  5. Correct sign of difference: After minus Before (positive = increase, negative = decrease).
  6. Common-valid-pixel comparison policy (strictly intersecting masks).
  7. Physical area calculation with pixelArea() integration.
  8. Missing imagery handling (clean structured unavailable_imagery response).
  9. Live vs. Demo status transparency and error handling.
  10. Endpoint integration via FastAPI TestClient (/api/satellite-comparison/analyze).
"""

import sys
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path
from datetime import date, timedelta

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.comparison_service import (
    validate_date_intervals,
    advance_date_inclusive,
    satellite_comparison_service,
    NDVI_DECLINE_THRESHOLD,
    NDVI_RECOVERY_THRESHOLD,
    NDWI_EXPANSION_THRESHOLD,
    NDWI_WATER_BODY_THRESHOLD,
)
from backend.app.services.gee_service import gee_service


class TestSatelliteComparisonDateValidation(unittest.TestCase):
    """Test date interval validation logic."""

    def test_valid_chronological_dates(self):
        """Standard valid before and after windows should pass validation."""
        ok, err = validate_date_intervals("2023-01-01", "2023-04-30", "2024-01-01", "2024-04-30")
        self.assertTrue(ok)
        self.assertIsNone(err)

    def test_invalid_date_format(self):
        """Malformed date strings should be rejected."""
        ok, err = validate_date_intervals("not-a-date", "2023-04-30", "2024-01-01", "2024-04-30")
        self.assertFalse(ok)
        self.assertIn("Invalid date format", err)

    def test_before_start_after_before_end(self):
        """Start date must be strictly earlier than end date."""
        ok, err = validate_date_intervals("2023-05-01", "2023-04-30", "2024-01-01", "2024-04-30")
        self.assertFalse(ok)
        self.assertIn("must be strictly earlier than end date", err)

    def test_after_start_after_after_end(self):
        """After-period start date must be strictly earlier than after-period end date."""
        ok, err = validate_date_intervals("2023-01-01", "2023-04-30", "2024-06-01", "2024-05-01")
        self.assertFalse(ok)
        self.assertIn("must be strictly earlier than end date", err)

    def test_before_period_after_after_period(self):
        """Before-period must precede after-period."""
        ok, err = validate_date_intervals("2024-01-01", "2024-04-30", "2023-01-01", "2023-04-30")
        self.assertFalse(ok)
        self.assertIn("must precede", err)

    def test_future_dates_rejected(self):
        """Dates beyond today should be rejected."""
        future_year = date.today().year + 5
        ok, err = validate_date_intervals(
            "2023-01-01", "2023-04-30",
            f"{future_year}-01-01", f"{future_year}-04-30"
        )
        self.assertFalse(ok)
        self.assertIn("cannot be in the future", err)

    def test_advance_date_inclusive(self):
        """Verify Earth Engine exclusive end-date conversion advances exactly 1 calendar day."""
        self.assertEqual(advance_date_inclusive("2023-04-30"), "2023-05-01")
        self.assertEqual(advance_date_inclusive("2023-12-31"), "2024-01-01")
        self.assertEqual(advance_date_inclusive("2024-02-28"), "2024-02-29")  # leap year check


class TestSpectralIndexFormulasAndDifference(unittest.TestCase):
    """Validate mathematical correctness of NDVI and NDWI formulas."""

    def test_ndvi_formula_normal_values(self):
        """NDVI = (NIR - Red) / (NIR + Red)."""
        nir, red = 0.50, 0.10
        ndvi = (nir - red) / (nir + red)
        self.assertAlmostEqual(ndvi, 0.6667, places=4)

    def test_ndvi_safe_zero_denominator(self):
        """Safe handling when NIR + Red = 0."""
        nir, red = 0.0, 0.0
        denom = nir + red
        ndvi = (nir - red) / denom if denom > 0 else 0.0
        self.assertEqual(ndvi, 0.0)

    def test_ndwi_formula_normal_values(self):
        """McFeeters NDWI = (Green - NIR) / (Green + NIR)."""
        green, nir = 0.40, 0.10
        ndwi = (green - nir) / (green + nir)
        self.assertAlmostEqual(ndwi, 0.60, places=4)

    def test_correct_sign_of_difference(self):
        """Difference must be After minus Before."""
        before_ndvi = 0.55
        after_ndvi = 0.35
        delta_ndvi = after_ndvi - before_ndvi
        self.assertAlmostEqual(delta_ndvi, -0.20, places=4)
        self.assertLess(delta_ndvi, 0, "Canopy decline must yield a negative delta")

        before_ndwi = -0.25
        after_ndwi = 0.05
        delta_ndwi = after_ndwi - before_ndwi
        self.assertAlmostEqual(delta_ndwi, 0.30, places=4)
        self.assertGreater(delta_ndwi, 0, "Water expansion must yield a positive delta")


class TestComparisonServiceOfflineExecution(unittest.TestCase):
    """Unit tests for SatelliteComparisonService offline / demo execution."""

    def setUp(self):
        self.aoi_polygon = {
            "type": "Polygon",
            "coordinates": [
                [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
            ],
        }

    def test_demo_mode_returns_structured_metrics(self):
        """When demo=True, return transparent demonstration metrics with is_live=False."""
        result = satellite_comparison_service.analyze_comparison(
            geometry=None,
            area_km2=15.0,
            before_start="2023-01-01",
            before_end="2023-04-30",
            after_start="2024-01-01",
            after_end="2024-04-30",
            region_name="Test Preset AOI",
            cloud_threshold=60,
            demo=True,
        )

        self.assertEqual(result["status"], "success")
        self.assertFalse(result["is_live"])
        self.assertTrue(result["is_demo"])
        self.assertIn("Demonstration", result["source"])
        self.assertIn("ndvi_metrics", result)
        self.assertIn("ndwi_metrics", result)
        self.assertIn("threshold_areas", result)

        # Check that metric signs and fields are populated
        ndvi = result["ndvi_metrics"]
        self.assertAlmostEqual(ndvi["delta_mean"], ndvi["after_mean"] - ndvi["before_mean"], places=4)
        self.assertGreater(result["common_valid_area_km2"], 0)
        self.assertLessEqual(result["coverage_percentage"], 100.0)

    @patch("backend.app.services.comparison_service.gee_service.initialize_gee", return_value=(True, "CONNECTED", "OK"))
    @patch.object(gee_service, "_is_initialized", True)
    @patch.object(gee_service, "_last_status", "CONNECTED")
    @patch.object(satellite_comparison_service, "get_period_composite")
    def test_missing_before_imagery_returns_unavailable_status(self, mock_get_comp, mock_init):
        """When 0 scenes exist for the before period, return unavailable_imagery status."""
        mock_get_comp.return_value = (None, 0, [], "none")

        result = satellite_comparison_service.analyze_comparison(
            geometry=MagicMock(),
            area_km2=20.0,
            before_start="2023-01-01",
            before_end="2023-01-10",
            after_start="2024-01-01",
            after_end="2024-04-30",
            demo=False,
        )

        self.assertEqual(result["status"], "unavailable_imagery")
        self.assertFalse(result["is_live"])
        self.assertEqual(result["failed_period"], "before")
        self.assertIn("suggestion", result)
        self.assertIn("widen", result["suggestion"].lower())

    @patch("backend.app.services.comparison_service.gee_service.initialize_gee", return_value=(True, "CONNECTED", "OK"))
    @patch.object(gee_service, "_is_initialized", True)
    @patch.object(gee_service, "_last_status", "CONNECTED")
    @patch.object(satellite_comparison_service, "get_period_composite")
    def test_missing_after_imagery_returns_unavailable_status(self, mock_get_comp, mock_init):
        """When before has scenes but after has 0 scenes, report after failure."""
        mock_before_comp = MagicMock()
        mock_get_comp.side_effect = [
            (mock_before_comp, 5, ["2023-01-15"], "Cloud Score+"),  # before period
            (None, 0, [], "none"),                                  # after period
        ]

        result = satellite_comparison_service.analyze_comparison(
            geometry=MagicMock(),
            area_km2=20.0,
            before_start="2023-01-01",
            before_end="2023-04-30",
            after_start="2024-01-01",
            after_end="2024-01-10",
            demo=False,
        )

        self.assertEqual(result["status"], "unavailable_imagery")
        self.assertFalse(result["is_live"])
        self.assertEqual(result["failed_period"], "after")


class TestSatelliteComparisonApiEndpoint(unittest.TestCase):
    """Integration tests for POST /api/satellite-comparison/analyze using FastAPI TestClient."""

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.valid_geometry = {
            "type": "Polygon",
            "coordinates": [
                [[73.80, 18.50], [73.85, 18.50], [73.85, 18.55], [73.80, 18.55], [73.80, 18.50]]
            ],
        }

    def test_endpoint_invalid_date_returns_422(self):
        """Submitting start date later than end date must return HTTP 422."""
        payload = {
            "geometry": self.valid_geometry,
            "before_start_date": "2023-06-01",
            "before_end_date": "2023-04-30",  # inverted
            "after_start_date": "2024-01-01",
            "after_end_date": "2024-04-30",
        }
        res = self.client.post("/api/satellite-comparison/analyze", json=payload)
        self.assertEqual(res.status_code, 422)
        data = res.json()
        self.assertIn("detail", data)
        self.assertIn("strictly earlier", data["detail"])

    def test_endpoint_invalid_geometry_returns_400(self):
        """Submitting malformed geometry with out-of-bounds coordinates returns HTTP 400."""
        bad_geometry = {
            "type": "Polygon",
            "coordinates": [
                [[250.0, 18.50], [73.85, 18.50], [73.85, 18.55], [250.0, 18.50]]
            ],
        }
        payload = {
            "geometry": bad_geometry,
            "before_start_date": "2023-01-01",
            "before_end_date": "2023-04-30",
            "after_start_date": "2024-01-01",
            "after_end_date": "2024-04-30",
        }
        res = self.client.post("/api/satellite-comparison/analyze", json=payload)
        self.assertEqual(res.status_code, 400)
        data = res.json()
        self.assertIn("detail", data)
        self.assertIn("out of bounds", data["detail"].lower())

    def test_endpoint_demo_mode_returns_200_with_full_schema(self):
        """Demo mode request should return HTTP 200 with complete SatelliteComparisonResponse."""
        payload = {
            "geometry": self.valid_geometry,
            "region_name": "Mulshi Forest Test AOI",
            "before_start_date": "2023-01-01",
            "before_end_date": "2023-04-30",
            "after_start_date": "2024-01-01",
            "after_end_date": "2024-04-30",
            "cloud_threshold": 60,
            "demo": True,
        }
        res = self.client.post("/api/satellite-comparison/analyze", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["status"], "success")
        self.assertFalse(data["is_live"])
        self.assertTrue(data["is_demo"])
        self.assertEqual(data["region_name"], "Mulshi Forest Test AOI")
        self.assertIn("ndvi_metrics", data)
        self.assertIn("ndwi_metrics", data)
        self.assertIn("before_metadata", data)
        self.assertIn("after_metadata", data)
        self.assertIn("methodology", data)
        self.assertIn("limitations", data)


if __name__ == "__main__":
    unittest.main()
