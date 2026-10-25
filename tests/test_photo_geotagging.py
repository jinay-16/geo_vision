import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def _create_sample_jpeg(with_exif_gps=False, lat=18.5204, lng=73.8567, lat_ref="N", lng_ref="E"):
    """Helper to create an in-memory JPEG with or without GPS EXIF metadata."""
    img = Image.new("RGB", (100, 100), color=(73, 109, 137))
    buf = io.BytesIO()

    if with_exif_gps:
        def _deg_to_dms(deg):
            deg = abs(deg)
            d = int(deg)
            m = int((deg - d) * 60)
            s = round(((deg - d) * 60 - m) * 60, 4)
            return (float(d), float(m), float(s))

        exif = img.getexif()
        gps_ifd = exif.get_ifd(0x8825)
        gps_ifd[1] = lat_ref
        gps_ifd[2] = _deg_to_dms(lat)
        gps_ifd[3] = lng_ref
        gps_ifd[4] = _deg_to_dms(lng)
        gps_ifd[6] = 150.0  # altitude
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")

    buf.seek(0)
    return buf.getvalue()


class TestFieldPhotoGeotagging:
    def test_upload_jpeg_with_gps_exif(self):
        """1. JPEG with valid GPS EXIF extracts coordinates and returns analysis."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=True, lat=18.5204, lng=73.8567, lat_ref="N", lng_ref="E")

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("field_inspection.jpg", jpeg_bytes, "image/jpeg")},
            data={"demo": "true", "buffer_meters": "1000"},
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["has_gps"] is True
        assert data["coordinates"]["latitude"] == pytest.approx(18.5204, abs=0.001)
        assert data["coordinates"]["longitude"] == pytest.approx(73.8567, abs=0.001)
        assert "evidence_classification" in data
        assert "EXIF" in data["evidence_classification"]["coordinate_source"]
        assert "regulatory_caveat" in data["evidence_classification"]

    def test_upload_jpeg_with_southern_western_hemisphere(self):
        """2. GPS EXIF with 'S' and 'W' coordinate references correctly applies negative signs."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=True, lat=23.5505, lng=46.6333, lat_ref="S", lng_ref="W")

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("sao_paulo_sample.jpg", jpeg_bytes, "image/jpeg")},
            data={"demo": "true"},
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["has_gps"] is True
        assert data["coordinates"]["latitude"] == pytest.approx(-23.5505, abs=0.001)
        assert data["coordinates"]["longitude"] == pytest.approx(-46.6333, abs=0.001)

    def test_upload_image_without_gps_metadata(self):
        """3. Image without GPS metadata does not crash, returning status 'no_gps'."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=False)

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("no_gps_camera.jpg", jpeg_bytes, "image/jpeg")},
            data={"demo": "true"},
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["has_gps"] is False
        assert data["status"] == "no_gps"
        assert "message" in data

    def test_manual_location_fallback_workflow(self):
        """4. Manual coordinates supplied with photo without GPS triggers analysis at manual location."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=False)

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("manual_survey.jpg", jpeg_bytes, "image/jpeg")},
            data={
                "fallback_lat": "19.0760",
                "fallback_lng": "72.8777",
                "demo": "true",
            },
        )

        assert response.status_code == 200, response.text
        data = response.json()
        assert data["has_gps"] is True
        assert data["coordinates"]["latitude"] == pytest.approx(19.0760, abs=0.001)
        assert data["coordinates"]["longitude"] == pytest.approx(72.8777, abs=0.001)
        assert "Manually supplied" in data["evidence_classification"]["coordinate_source"]

    def test_invalid_manual_coordinates_out_of_bounds(self):
        """5. Manual coordinates out of geographical range [-90,90] / [-180,180] returns 400 Bad Request."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=False)

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("invalid_coords.jpg", jpeg_bytes, "image/jpeg")},
            data={
                "fallback_lat": "125.0",  # Out of range!
                "fallback_lng": "72.0",
                "demo": "true",
            },
        )

        assert response.status_code == 400
        assert "Invalid coordinates" in response.json()["detail"]

    def test_partial_manual_coordinates(self):
        """6. Providing only fallback_lat without fallback_lng returns 400 Bad Request."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=False)

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("partial_coords.jpg", jpeg_bytes, "image/jpeg")},
            data={"fallback_lat": "19.0"},
        )

        assert response.status_code == 400
        assert "Both fallback_lat and fallback_lng must be provided" in response.json()["detail"]

    def test_unsupported_file_extension(self):
        """7. Uploading an unsupported file extension returns 400 Bad Request."""
        text_content = b"This is a text document, not an aerial photo."

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("report.txt", text_content, "text/plain")},
        )

        assert response.status_code == 400
        assert "Unsupported file extension" in response.json()["detail"]

    def test_corrupted_image_file(self):
        """8. Uploading a corrupt image file returns 400 Bad Request."""
        corrupted_bytes = b"\xff\xd8\xff\xe0corruptgarbageimagepayloadnotvalidjpeg\x00\x00"

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("corrupt.jpg", corrupted_bytes, "image/jpeg")},
        )

        assert response.status_code == 400
        assert "Invalid or corrupt image file" in response.json()["detail"]

    def test_file_size_limit_exceeded(self):
        """9. Uploading a file exceeding 25MB returns 413 Payload Too Large."""
        # 26MB of dummy bytes
        oversized_bytes = b"0" * (26 * 1024 * 1024)

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("huge_photo.jpg", oversized_bytes, "image/jpeg")},
        )

        assert response.status_code == 413
        assert "exceeds maximum allowed file size" in response.json()["detail"]

    def test_distinct_demonstration_samples_outputs(self):
        """10. Built-in demonstration samples must produce distinct, scenario-appropriate outputs."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=False)

        # Sample 1: Mulshi Ghats (Forest Canopy Loss)
        resp1 = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("Mulshi_Ghats_Forest_Loss.jpg", jpeg_bytes, "image/jpeg")},
            data={"fallback_lat": "18.5124", "fallback_lng": "73.5218", "demo": "true"},
        )
        assert resp1.status_code == 200
        d1 = resp1.json()
        sat1 = d1["satellite_analysis"]

        # Sample 2: PCMC North Quarry (Quarrying / Bare Soil Expansion)
        resp2 = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("PCMC_North_Quarry.jpg", jpeg_bytes, "image/jpeg")},
            data={"fallback_lat": "18.6642", "fallback_lng": "73.8315", "demo": "true"},
        )
        assert resp2.status_code == 200
        d2 = resp2.json()
        sat2 = d2["satellite_analysis"]

        # Sample 3: Khadakwasla Basin (Shoreline & Riparian Buffer)
        resp3 = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("Khadakwasla_Basin_Riparian.jpg", jpeg_bytes, "image/jpeg")},
            data={"fallback_lat": "18.4385", "fallback_lng": "73.7621", "demo": "true"},
        )
        assert resp3.status_code == 200
        d3 = resp3.json()
        sat3 = d3["satellite_analysis"]

        # Assert all 3 have distinct coordinates
        assert d1["coordinates"]["latitude"] == pytest.approx(18.5124, abs=0.001)
        assert d2["coordinates"]["latitude"] == pytest.approx(18.6642, abs=0.001)
        assert d3["coordinates"]["latitude"] == pytest.approx(18.4385, abs=0.001)

        # Assert distinct drivers reflecting their scenarios
        assert "Forest" in sat1["physical_impact_footprint"]["dominant_driver"]
        assert "Quarry" in sat2["physical_impact_footprint"]["dominant_driver"]
        assert "Water" in sat3["physical_impact_footprint"]["dominant_driver"]

        # Assert distinct spectral indices
        # Mulshi has large negative NDVI drop
        assert sat1["spectral_indices"]["ndvi_net_change"] < -0.15
        # PCMC has large positive NDBI increase (bare soil / rock exposure)
        assert sat2["spectral_indices"]["ndbi_net_change"] > 0.15
        # Khadakwasla has positive NDWI change (water expansion)
        assert sat3["spectral_indices"]["ndwi_net_change"] > 0.15

        # Assert results are not identical
        assert sat1["spectral_indices"]["ndvi_net_change"] != sat2["spectral_indices"]["ndvi_net_change"]
        assert sat2["spectral_indices"]["ndbi_net_change"] != sat3["spectral_indices"]["ndbi_net_change"]
        assert sat1["physical_impact_footprint"]["dominant_driver"] != sat2["physical_impact_footprint"]["dominant_driver"]

        # Assert labeled as demonstration
        assert sat1["is_demo"] is True
        assert "Demonstration" in sat1["source"]

    def test_manual_location_does_not_substitute_pune_defaults(self):
        """11. Manual location coordinates for a non-Pune AOI are preserved and not silently replaced."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=False)

        # Jaipur, Rajasthan
        jaipur_lat = 26.9124
        jaipur_lng = 75.7873

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("jaipur_survey.jpg", jpeg_bytes, "image/jpeg")},
            data={"fallback_lat": str(jaipur_lat), "fallback_lng": str(jaipur_lng), "demo": "true"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["coordinates"]["latitude"] == pytest.approx(jaipur_lat, abs=0.001)
        assert data["coordinates"]["longitude"] == pytest.approx(jaipur_lng, abs=0.001)
        assert data["gps_source"] == "manual"
        # Never reverts to Pune
        assert abs(data["coordinates"]["latitude"] - 18.5204) > 1.0

    def test_scientific_evidence_classification_integrity(self):
        """12. Protect scientific integrity: ground photo vs satellite remote sensing are distinct."""
        jpeg_bytes = _create_sample_jpeg(with_exif_gps=True, lat=18.5124, lng=73.5218)

        response = client.post(
            "/api/analysis/geotagged-photo",
            files={"file": ("field_inspection.jpg", jpeg_bytes, "image/jpeg")},
            data={"demo": "true"},
        )
        assert response.status_code == 200
        data = response.json()
        evidence = data["evidence_classification"]

        assert "ground_evidence" in evidence
        assert "satellite_evidence" in evidence
        assert "regulatory_caveat" in evidence
        # Verify regulatory caveat explicitly warns that photos alone do not prove illegal activity
        assert "do not independently prove" in evidence["regulatory_caveat"].lower()

