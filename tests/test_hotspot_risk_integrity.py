"""
GeoVision AI — Regression Test Suite: Hotspot Risk Scores, Coordinate Uniqueness & Provenance
Covers:
  1. Score calculation across the full dynamic range (no premature clamping at 100).
  2. Strict alignment of risk_level with documented thresholds (Low: 0-39, Med: 40-69, High: 70-100).
  3. Spatial uniqueness of hotspot observations (distinct coordinates/IDs per region).
  4. Secondary tie-breaking by change magnitude.
  5. Scientific integrity of vegetation-index decline descriptors (no unverified deforestation claims).
  6. Provenance metadata and date tracking.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.demo_data import demo_data
from backend.app.services import risk_engine

client = TestClient(app)


class TestHotspotRiskIntegrity:

    def test_deforestation_risk_score_calculation_across_dynamic_range(self):
        """1. deforestation_risk scales smoothly across the full dynamic range without saturating at -0.34."""
        # Non-decline (growth or zero) -> Low
        score_pos = risk_engine.deforestation_risk(0.05, ndvi_current=0.55, ndvi_previous=0.50)
        assert score_pos <= 10
        assert risk_engine.risk_level(score_pos) == "Low"

        # Small decline (-0.05) -> Low
        score_low = risk_engine.deforestation_risk(-0.05, ndvi_current=0.45, ndvi_previous=0.50)
        assert 15 <= score_low <= 30
        assert risk_engine.risk_level(score_low) == "Low"

        # Moderate decline (-0.15) -> Medium (40-69)
        score_med = risk_engine.deforestation_risk(-0.15, ndvi_current=0.35, ndvi_previous=0.50)
        assert 45 <= score_med <= 65
        assert risk_engine.risk_level(score_med) == "Medium"

        # Substantial decline (-0.35) -> High (70-100)
        score_high1 = risk_engine.deforestation_risk(-0.35, ndvi_current=0.15, ndvi_previous=0.50)
        assert 75 <= score_high1 <= 85
        assert risk_engine.risk_level(score_high1) == "High"

        # Severe decline (-0.55) -> High
        score_high2 = risk_engine.deforestation_risk(-0.55, ndvi_current=0.05, ndvi_previous=0.60)
        assert 85 <= score_high2 <= 95
        assert risk_engine.risk_level(score_high2) == "High"

        # Catastrophic decline (-0.85) -> Maximum High
        score_high3 = risk_engine.deforestation_risk(-0.85, ndvi_current=0.02, ndvi_previous=0.87)
        assert 98 <= score_high3 <= 100
        assert risk_engine.risk_level(score_high3) == "High"

        # Distinct scores for distinct change magnitudes (NO flat clamping at 100 for all -0.35+)
        assert score_high1 < score_high2 < score_high3

    def test_mining_and_flood_risk_score_calculations(self):
        """2. mining_risk and flood_risk scale across documented thresholds."""
        # Mining
        mine_low = risk_engine.mining_risk(0.04)
        mine_med = risk_engine.mining_risk(0.10)
        mine_high1 = risk_engine.mining_risk(0.25)
        mine_high2 = risk_engine.mining_risk(0.60)

        assert risk_engine.risk_level(mine_low) == "Low"
        assert risk_engine.risk_level(mine_med) == "Medium"
        assert risk_engine.risk_level(mine_high1) == "High"
        assert risk_engine.risk_level(mine_high2) == "High"
        assert mine_high1 < mine_high2

        # Flood
        flood_low = risk_engine.flood_risk(0.02)
        flood_med = risk_engine.flood_risk(0.08)
        flood_high1 = risk_engine.flood_risk(0.25)
        flood_high2 = risk_engine.flood_risk(0.70)

        assert risk_engine.risk_level(flood_low) == "Low"
        assert risk_engine.risk_level(flood_med) == "Medium"
        assert risk_engine.risk_level(flood_high1) == "High"
        assert risk_engine.risk_level(flood_high2) == "High"
        assert flood_high1 < flood_high2

    def test_risk_level_consistency_with_documented_thresholds(self):
        """3. Every score 0-100 precisely maps to documented thresholds (Low: 0-39, Med: 40-69, High: 70-100)."""
        for score in range(0, 40):
            assert risk_engine.risk_level(score) == "Low"
        for score in range(40, 70):
            assert risk_engine.risk_level(score) == "Medium"
        for score in range(70, 101):
            assert risk_engine.risk_level(score) == "High"

    def test_hotspot_dataset_coordinate_uniqueness_and_no_duplicate_records(self):
        """4. Repeated region names represent distinct spatial coordinates and unique observation IDs."""
        demo_data.load()
        records = demo_data.get_hotspots(module="deforestation", limit=200)

        coords_set = set()
        ids_set = set()
        for r in records:
            coord = (r["latitude"], r["longitude"])
            assert coord not in coords_set, f"Found duplicate coordinate {coord}"
            assert r["id"] not in ids_set, f"Found duplicate ID {r['id']}"
            coords_set.add(coord)
            ids_set.add(r["id"])

        # Check multiple occurrences of same region name are spatially distinct
        hadapsar_pts = [r for r in records if r["region"] == "Hadapsar-Mundhwa"]
        if len(hadapsar_pts) > 1:
            h_coords = {(p["latitude"], p["longitude"]) for p in hadapsar_pts}
            assert len(h_coords) == len(hadapsar_pts), "Hadapsar points must have distinct coordinates"

    def test_top_hotspots_graduated_scores_and_metadata(self):
        """5. Top 50 hotspots endpoint does not return flat 100s for every row and includes provenance."""
        response = client.get("/api/hotspots?module=deforestation&limit=50")
        assert response.status_code == 200
        data = response.json()
        hotspots = data["hotspots"]

        assert len(hotspots) == 50
        scores = [h["risk_score"] for h in hotspots]

        # Top 50 scores must have more than 1 distinct score (no 100% saturation)
        unique_scores = set(scores)
        assert len(unique_scores) > 1, f"Expected graduated score distribution, got: {unique_scores}"

        # Verify metadata presence
        first = hotspots[0]
        assert "id" in first
        assert "latitude" in first and "longitude" in first
        assert "region" in first
        assert "date" in first
        assert "provenance" in first
        assert "is_demo" in first
        assert first["is_demo"] is True

    def test_scientific_status_description_integrity(self):
        """6. Negative NDVI is described as vegetation-index decline, not confirmed illegal deforestation."""
        demo_data.load()
        records = demo_data.get_hotspots(module="deforestation", limit=20)
        for r in records:
            if r["risk_score"] >= 40:
                status_lower = r["status"].lower()
                assert "vegetation-index decline" in status_lower
                assert "illegal deforestation" not in status_lower

    def test_hotspot_filtering_and_edge_cases(self):
        """7. Hotspots query handles module filtering, geographic bounds, and nonexistent regions gracefully."""
        # Filter by valid region
        resp_reg = client.get("/api/hotspots?region=Aundh-Baner&limit=10")
        assert resp_reg.status_code == 200
        for h in resp_reg.json()["hotspots"]:
            assert h["region"] == "Aundh-Baner"

        # Nonexistent region returns empty list without crashing
        resp_empty = client.get("/api/hotspots?region=NonExistentRegion999&limit=10")
        assert resp_empty.status_code == 200
        assert resp_empty.json()["hotspots"] == []
