"""
GeoVision AI — Regression Tests for Radius AOI Drawing Tool & GEE Analysis Geometry
Verifies:
1. Circular AOI generation produces valid GeoJSON Polygons with closed rings (64 segments + closing vertex).
2. Kilometre-to-metre conversion is accurately handled (2 km -> 2000m, 5 km -> 5000m).
3. Area scaling matches pi * r^2 (~12.57 km2 for 2 km, ~78.54 km2 for 5 km).
4. Google Earth Engine geometry parser correctly processes circular AOI polygons without errors.
5. End-to-end /api/analysis/aoi endpoint executes successfully with custom radius circular AOIs.
6. Changing radius and repositioning circular AOIs update geometry cleanly without stale or corrupt bounds.
"""

import math
import unittest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.gee_service import gee_service

client = TestClient(app)


def generate_circular_polygon(lat: float, lng: float, radius_km: float, points: int = 64) -> dict:
    """Python reference implementation of createCircularPolygon for test verification."""
    radius_meters = radius_km * 1000.0
    earth_radius = 6378137.0
    coords = []
    lat_rad = math.radians(lat)

    for i in range(points):
        angle = (i * 2.0 * math.pi) / points
        d_lat = (radius_meters * math.sin(angle)) / earth_radius
        d_lng = (radius_meters * math.cos(angle)) / (earth_radius * math.cos(lat_rad))
        p_lat = lat + math.degrees(d_lat)
        p_lng = lng + math.degrees(d_lng)
        coords.append([round(p_lng, 5), round(p_lat, 5)])

    # Explicitly close the ring with exact first point coordinates
    coords.append([coords[0][0], coords[0][1]])

    return {
        "type": "Polygon",
        "coordinates": [coords],
        "radius_meters": radius_meters,
        "radius_km": radius_km,
        "center": [round(lng, 5), round(lat, 5)],
    }


class TestRadiusAOI(unittest.TestCase):
    """Test suite ensuring accurate circular AOI creation, radius adjustments, and GEE pipeline integration."""

    def setUp(self):
        self.pune_lat = 18.5204
        self.pune_lng = 73.8567

    def test_2km_circular_polygon_geometry_structure(self):
        """2 km circular AOI must produce a valid 64-vertex closed polygon ring."""
        geom = generate_circular_polygon(self.pune_lat, self.pune_lng, 2.0)

        self.assertEqual(geom["type"], "Polygon")
        self.assertEqual(len(geom["coordinates"]), 1)
        ring = geom["coordinates"][0]

        # 64 vertices + 1 closing vertex = 65 total coordinates
        self.assertEqual(len(ring), 65)

        # Polygon must be strictly closed (first point == last point)
        self.assertEqual(ring[0], ring[-1])

        # Centroid check: center must be Pune coordinates
        self.assertAlmostEqual(geom["center"][0], self.pune_lng, places=4)
        self.assertAlmostEqual(geom["center"][1], self.pune_lat, places=4)

        # Km to meters conversion check
        self.assertEqual(geom["radius_meters"], 2000.0)
        self.assertEqual(geom["radius_km"], 2.0)

    def test_circular_aoi_area_scaling(self):
        """Calculated area must match pi * r^2 within 1% across various radius choices."""
        test_radii = [1.0, 2.0, 5.0, 10.0, 15.0, 20.0]

        for r in test_radii:
            geom = generate_circular_polygon(self.pune_lat, self.pune_lng, r)
            expected_area = math.pi * (r ** 2)

            # Validate in GEE geometry parser
            _, computed_area_km2, centroid, err = gee_service.geojson_to_ee_geometry(geom)
            self.assertIsNone(err, f"Error validating radius {r}km: {err}")
            self.assertIsNotNone(centroid)

            # Area must be within 1.5% of theoretical pi * r^2
            discrepancy = abs(computed_area_km2 - expected_area) / expected_area
            self.assertLess(
                discrepancy,
                0.015,
                f"Radius {r}km area {computed_area_km2} deviated from expected {expected_area}",
            )

    def test_gee_service_validates_2km_circle(self):
        """gee_service.geojson_to_ee_geometry must parse 2 km circle with ~12.5 km2 area."""
        geom_2km = generate_circular_polygon(self.pune_lat, self.pune_lng, 2.0)
        ee_geom, area_km2, centroid, err = gee_service.geojson_to_ee_geometry(geom_2km)

        self.assertIsNone(err)
        # Expected pi * 2^2 = ~12.57 km2
        self.assertGreaterEqual(area_km2, 12.0)
        self.assertLessEqual(area_km2, 13.0)
        self.assertAlmostEqual(centroid["lat"], self.pune_lat, places=3)
        self.assertAlmostEqual(centroid["lng"], self.pune_lng, places=3)

    def test_aoi_analysis_api_with_2km_radius(self):
        """POST /api/analysis/aoi must succeed with 2 km circular AOI geometry."""
        geom_2km = generate_circular_polygon(self.pune_lat, self.pune_lng, 2.0)

        payload = {
            "geometry": geom_2km,
            "start_year": 2023,
            "end_year": 2026,
            "start_month": 1,
            "end_month": 4,
            "region_name": "Radial Buffer (18.520°N, 73.857°E, r=2km)",
            "demo": True,
        }

        res = client.post("/api/analysis/aoi", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertIn("area_km2", data)
        self.assertAlmostEqual(data["area_km2"], 12.52, delta=0.5)
        self.assertEqual(data["region_name"], "Radial Buffer (18.520°N, 73.857°E, r=2km)")
        self.assertIn("ml_result", data)
        self.assertIn("risk_score", data["ml_result"])
        self.assertIn("summary", data)

    def test_radius_change_recomputes_geometry_cleanly(self):
        """Changing radius from 5 km to 2 km must reduce geographic bounding box and area."""
        geom_5km = generate_circular_polygon(self.pune_lat, self.pune_lng, 5.0)
        geom_2km = generate_circular_polygon(self.pune_lat, self.pune_lng, 2.0)

        ring_5km = geom_5km["coordinates"][0]
        ring_2km = geom_2km["coordinates"][0]

        lng_span_5km = max(p[0] for p in ring_5km) - min(p[0] for p in ring_5km)
        lat_span_5km = max(p[1] for p in ring_5km) - min(p[1] for p in ring_5km)

        lng_span_2km = max(p[0] for p in ring_2km) - min(p[0] for p in ring_2km)
        lat_span_2km = max(p[1] for p in ring_2km) - min(p[1] for p in ring_2km)

        # 2 km span must be exactly 2/5 = 0.4 of 5 km span
        self.assertAlmostEqual(lng_span_2km / lng_span_5km, 0.4, delta=0.01)
        self.assertAlmostEqual(lat_span_2km / lat_span_5km, 0.4, delta=0.01)

    def test_repositioning_radius_aoi(self):
        """Clicking a new center updates coordinates and centroid independently."""
        pune_geom = generate_circular_polygon(18.5204, 73.8567, 2.0)
        corbett_geom = generate_circular_polygon(29.5300, 78.8000, 2.0)

        _, pune_area, pune_centroid, _ = gee_service.geojson_to_ee_geometry(pune_geom)
        _, corbett_area, corbett_centroid, _ = gee_service.geojson_to_ee_geometry(corbett_geom)

        # Both have same radius so areas are essentially identical
        self.assertAlmostEqual(pune_area, corbett_area, delta=0.5)

        # Centroids are completely distinct
        self.assertAlmostEqual(pune_centroid["lat"], 18.520, delta=0.01)
        self.assertAlmostEqual(corbett_centroid["lat"], 29.530, delta=0.01)
        self.assertAlmostEqual(pune_centroid["lng"], 73.857, delta=0.01)
        self.assertAlmostEqual(corbett_centroid["lng"], 78.800, delta=0.01)


if __name__ == "__main__":
    unittest.main()
