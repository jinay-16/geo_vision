"""
GeoVision AI — User Dataset Ingestion Routes
Endpoints for uploading custom CSV / GeoJSON datasets, querying dataset status, and resetting to baseline.
"""

import io
import json
import pandas as pd
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Response
from fastapi.responses import PlainTextResponse
from ..services.demo_data import demo_data

router = APIRouter()


@router.get("/user-data/status")
async def get_user_data_status():
    """Get the current operational or user-uploaded dataset metadata."""
    overview = demo_data.get_overview()
    return {
        "dataset_type": demo_data.dataset_type,
        "is_user_dataset": demo_data.dataset_type == "user",
        "filename": demo_data.user_filename or "Copernicus Sentinel-2 Operational (Pune Basin)",
        "source": demo_data.get_source(),
        "total_points": overview["total_points"],
        "high_risk_zones": overview["high_risk_zones"],
        "risk_distribution": overview["risk_distribution"],
        "last_updated": demo_data.upload_timestamp or overview["last_analysis_date"],
    }


@router.post("/user-data/upload")
async def upload_user_dataset(file: UploadFile = File(...)):
    """
    Upload a custom CSV or GeoJSON dataset containing geospatial coordinates
    and optional spectral indicators. The platform will dynamically calculate
    environmental risks and update the entire dashboard.
    """
    filename = file.filename or "uploaded_data.csv"
    contents = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if filename.lower().endswith((".json", ".geojson")):
            data = json.loads(contents.decode("utf-8", errors="ignore"))
            # Check GeoJSON FeatureCollection
            if isinstance(data, dict) and "features" in data:
                rows = []
                for feat in data["features"]:
                    props = feat.get("properties", {})
                    geom = feat.get("geometry", {})
                    if geom and geom.get("type") == "Point":
                        coords = geom.get("coordinates", [])
                        if len(coords) >= 2:
                            props["longitude"] = coords[0]
                            props["latitude"] = coords[1]
                    rows.append(props)
                df = pd.DataFrame(rows)
            elif isinstance(data, list):
                df = pd.DataFrame(data)
            else:
                raise ValueError("Unrecognized JSON/GeoJSON format. Provide a FeatureCollection or array of objects.")
        else:
            # CSV parsing
            df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")

    try:
        result = demo_data.load_user_dataframe(df, filename)
        return result
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/user-data/reset")
async def reset_user_dataset():
    """Reset the platform back to the default operational Copernicus Sentinel-2 dataset."""
    result = demo_data.reset_to_default()
    return result


@router.get("/user-data/template", response_class=PlainTextResponse)
async def get_csv_template():
    """Download a CSV format template with sample rows for user data ingestion."""
    template_content = (
        "latitude,longitude,region,NDVI_2023,NDVI_2026,NDWI_2023,NDWI_2026,NDBI_2023,NDBI_2026\n"
        "18.5204,73.8567,Pune Central,0.48,0.25,-0.18,-0.10,0.08,0.22\n"
        "18.5912,73.7389,Hinjewadi-Pashan,0.62,0.31,-0.22,-0.15,0.02,0.18\n"
        "18.4521,73.7654,Khadakwasla Basin,0.55,0.52,-0.05,0.25,0.01,-0.02\n"
        "18.6521,73.8124,PCMC North Corridor,0.38,0.19,-0.20,-0.18,0.12,0.35\n"
        "18.5089,73.9256,Hadapsar-Mundhwa,0.42,0.39,-0.19,-0.21,0.09,0.11\n"
    )
    return Response(
        content=template_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=geovision_user_dataset_template.csv"},
    )
