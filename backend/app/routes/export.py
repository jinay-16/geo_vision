"""
GeoVision AI — Data Export Routes
Endpoints for downloading CSV hotspot records and GeoJSON geospatial feature collections.
"""

import io
import csv
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Query, Response, HTTPException
from fastapi.responses import StreamingResponse
from ..services.demo_data import demo_data

router = APIRouter()


@router.get("/export/csv")
async def export_csv(
    module: Optional[str] = Query(None, description="Filter by module: deforestation, mining, flood"),
    risk_level: Optional[str] = Query(None, description="Filter by risk level: High, Medium, Low"),
    limit: int = Query(5000, ge=1, le=5000, description="Max rows to export"),
):
    """
    Export monitored locations and environmental risk hotspots as a CSV file.
    """
    hotspots = demo_data.get_hotspots(module=module, limit=limit)
    if risk_level and risk_level.lower() != "all":
        hotspots = [h for h in hotspots if h["risk_level"].lower() == risk_level.lower()]

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    writer.writerow([
        "Record ID",
        "Region",
        "Module",
        "Latitude",
        "Longitude",
        "Analysis Date",
        "Current Value",
        "Previous Value",
        "Change Delta",
        "Risk Score (0-100)",
        "Risk Level",
        "Confidence",
        "Diagnostic Status",
        "Field Verification Required",
    ])

    for h in hotspots:
        writer.writerow([
            h.get("id", ""),
            h.get("region", ""),
            h.get("module", ""),
            h.get("latitude", ""),
            h.get("longitude", ""),
            h.get("date", ""),
            h.get("current_value", ""),
            h.get("previous_value", ""),
            h.get("change_value", ""),
            h.get("risk_score", ""),
            h.get("risk_level", ""),
            h.get("confidence", ""),
            h.get("status", ""),
            "Yes" if h.get("requires_field_verification") else "No",
        ])

    output.seek(0)
    filename = f"geovision_hotspots_{module or 'all'}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/geojson")
async def export_geojson(
    module: Optional[str] = Query(None, description="Filter by module: deforestation, mining, flood"),
    limit: int = Query(2000, ge=1, le=5000, description="Max features to export"),
):
    """
    Export hotspots as a GeoJSON FeatureCollection for import into GIS tools (QGIS, ArcGIS, Mapbox).
    """
    hotspots = demo_data.get_hotspots(module=module, limit=limit)

    features = []
    for h in hotspots:
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [h["longitude"], h["latitude"]],
            },
            "properties": {
                "id": h.get("id"),
                "region": h.get("region"),
                "module": h.get("module"),
                "risk_score": h.get("risk_score"),
                "risk_level": h.get("risk_level"),
                "change_value": h.get("change_value"),
                "confidence": h.get("confidence"),
                "status": h.get("status"),
                "requires_field_verification": h.get("requires_field_verification", True),
                "date": h.get("date"),
            },
        })

    # Include monitored study area boundary polygon
    features.append({
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [73.70, 18.40],
                [74.00, 18.40],
                [74.00, 18.65],
                [73.70, 18.65],
                [73.70, 18.40],
            ]],
        },
        "properties": {
            "name": "Pune Pilot Study Area Boundary",
            "type": "AOI_Boundary",
        },
    })

    geojson_doc = {
        "type": "FeatureCollection",
        "name": "GeoVision_AI_Export",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }

    filename = f"geovision_features_{module or 'all'}_{datetime.now().strftime('%Y%m%d')}.geojson"
    return Response(
        content=json.dumps(geojson_doc).encode("utf-8"),
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/aoi-csv")
async def export_aoi_csv(payload: dict = None):
    """
    Export custom AOI analysis findings, biophysical metrics, and yearly trajectory as a CSV file.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Payload is required for custom AOI CSV export.")

    data = dict(payload)
    while "analysis_results" in data and isinstance(data["analysis_results"], dict):
        ar = dict(data["analysis_results"])
        for k, v in data.items():
            if k != "analysis_results" and k not in ar:
                ar[k] = v
        data = ar

    if "aoi_name" in data and not data.get("region_name"):
        data["region_name"] = data["aoi_name"]

    summary = data.get("summary")
    ml_result = data.get("ml_result")
    valid_summary = isinstance(summary, dict) and len(summary) > 0
    valid_ml = isinstance(ml_result, dict) and len(ml_result) > 0

    if not valid_summary and not valid_ml:
        raise HTTPException(status_code=400, detail="Missing required AOI analysis findings ('summary' or 'ml_result'). Regional baseline data cannot be substituted for custom AOI reports.")

    region_name = data.get("region_name") or "Custom_AOI"
    summary = data.get("summary") or {}
    ml_result = data.get("ml_result") or {}
    area_km2 = float(
        data.get("area_km2")
        or (summary.get("total_area_km2") if isinstance(summary, dict) else None)
        or (ml_result.get("total_area_km2") if isinstance(ml_result, dict) else None)
        or 0.0
    )
    yearly = data.get("yearly_progression") or []
    geometry = data.get("geometry") or {}
    start_year = data.get("start_year", 2023)
    end_year = data.get("end_year", 2026)
    source = data.get("source") or "Copernicus Sentinel-2 Level-2A via Google Earth Engine"
    is_live = bool(data.get("is_live"))
    evidence_status = "Live Satellite Observation" if is_live else "Demonstration Mode"

    output = io.StringIO()
    writer = csv.writer(output)

    # 1. AOI Metadata Section
    writer.writerow(["# GeoVision AI — Custom AOI Analysis Audit Report"])
    writer.writerow(["Report Title", f"Environmental Intelligence Audit — {region_name}"])
    writer.writerow(["Area of Interest", region_name])
    writer.writerow(["Surveyed Footprint (km²)", f"{area_km2:.2f}"])
    writer.writerow(["Observation Period", f"{start_year} – {end_year}"])
    writer.writerow(["Data Source", source])
    writer.writerow(["Evidence Status", evidence_status])
    writer.writerow(["Generated Timestamp", datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")])
    writer.writerow([])

    # 2. Overall Risk & ML Assessment
    writer.writerow(["# Machine Learning & Multi-Hazard Screening Assessment"])
    writer.writerow(["Composite Risk Score (0-100)", ml_result.get("risk_score", summary.get("risk_score", 0))])
    writer.writerow(["Risk Level Category", ml_result.get("risk_level", summary.get("risk_level", "Low"))])
    writer.writerow(["Disturbance Probability", f"{ml_result.get('probability', 0.0) * 100:.1f}%"])
    writer.writerow(["Primary Environmental Driver", summary.get("dominant_risk", "Environmental Shift")])
    writer.writerow([])

    # 3. Quantitative Biophysical Metrics Table
    writer.writerow(["# Quantitative Spectral Indices & Surface Footprint Impact"])
    writer.writerow(["Hazard / Module", "Change Indicator", "Net Delta", "Affected Surface Area (km²)", "Footprint %", "Status"])
    veg_loss = float(summary.get("vegetation_loss_km2") or 0.0)
    disturb = float(summary.get("disturbance_km2") or 0.0)
    water_exp = float(summary.get("water_expansion_km2") or 0.0)
    veg_pct = round((veg_loss / area_km2 * 100), 1) if area_km2 > 0 else 0.0
    disturb_pct = round((disturb / area_km2 * 100), 1) if area_km2 > 0 else 0.0
    water_pct = round((water_exp / area_km2 * 100), 1) if area_km2 > 0 else 0.0

    writer.writerow(["Deforestation & Canopy Loss", "ΔNDVI", f"{float(summary.get('net_ndvi_change') or 0.0):+.4f}", f"{veg_loss:.2f}", f"{veg_pct}%", "Active Decline" if veg_loss > 0 else "Stable"])
    writer.writerow(["Mining & Land Disturbance", "ΔNDBI", f"{float(summary.get('net_ndbi_change') or 0.0):+.4f}", f"{disturb:.2f}", f"{disturb_pct}%", "Active Excavation / Bare Soil" if disturb > 0 else "Stable"])
    writer.writerow(["Flood & Water Extent", "ΔNDWI", f"{float(summary.get('net_ndwi_change') or 0.0):+.4f}", f"{water_exp:.2f}", f"{water_pct}%", "Active Moisture Delta" if water_exp > 0 else "Stable"])
    writer.writerow([])

    # 4. Multi-Year Progression History
    if yearly:
        writer.writerow(["# Historical Multi-Year Spectral Index Progression"])
        writer.writerow(["Year", "NDVI Median (Canopy)", "NDBI Median (Bare Soil)", "NDWI Median (Moisture)", "Vegetation Classification"])
        for y in yearly:
            writer.writerow([
                y.get("year", ""),
                f"{float(y.get('ndvi_mean', 0.0)):.4f}",
                f"{float(y.get('ndbi_mean', 0.0)):.4f}",
                f"{float(y.get('ndwi_mean', 0.0)):.4f}",
                y.get("vegetation_health", "Nominal"),
            ])
        writer.writerow([])

    # 5. Polygon Coordinates
    if geometry and geometry.get("coordinates") and len(geometry["coordinates"]) > 0:
        writer.writerow(["# Boundary Polygon Vertices (WGS84 EPSG:4326)"])
        writer.writerow(["Vertex #", "Longitude (°E)", "Latitude (°N)"])
        for idx, pt in enumerate(geometry["coordinates"][0]):
            writer.writerow([idx + 1, pt[0], pt[1]])

    output.seek(0)
    safe_name = "".join(c for c in region_name if c.isalnum() or c in ("-", "_")).strip() or "aoi"
    filename = f"geovision_aoi_{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/export/aoi-geojson")
async def export_aoi_geojson(payload: dict = None):
    """
    Export custom AOI polygon boundary and analysis feature properties as GIS GeoJSON.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Payload is required for custom AOI GeoJSON export.")

    data = dict(payload)
    while "analysis_results" in data and isinstance(data["analysis_results"], dict):
        ar = dict(data["analysis_results"])
        for k, v in data.items():
            if k != "analysis_results" and k not in ar:
                ar[k] = v
        data = ar

    if "aoi_name" in data and not data.get("region_name"):
        data["region_name"] = data["aoi_name"]

    geometry = data.get("geometry")
    if not geometry or not isinstance(geometry, dict) or not geometry.get("coordinates") or len(geometry["coordinates"]) == 0:
        raise HTTPException(
            status_code=400,
            detail="Missing required valid polygon geometry in custom AOI GeoJSON export. Regional boundaries cannot be substituted.",
        )

    region_name = data.get("region_name") or "Custom_AOI"
    summary = data.get("summary") or {}
    ml_result = data.get("ml_result") or {}
    area_km2 = float(
        data.get("area_km2")
        or (summary.get("total_area_km2") if isinstance(summary, dict) else None)
        or (ml_result.get("total_area_km2") if isinstance(ml_result, dict) else None)
        or 0.0
    )
    start_year = data.get("start_year", 2023)
    end_year = data.get("end_year", 2026)
    source = data.get("source") or "Copernicus Sentinel-2 Level-2A via Google Earth Engine"
    is_live = bool(data.get("is_live"))

    # Compute centroid
    poly_coords = geometry["coordinates"][0]
    lngs = [p[0] for p in poly_coords]
    lats = [p[1] for p in poly_coords]
    centroid_lng = sum(lngs) / len(lngs) if lngs else 73.85
    centroid_lat = sum(lats) / len(lats) if lats else 18.52

    features = [
        # Feature 1: The exact custom AOI boundary polygon
        {
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "name": region_name,
                "type": "Custom_AOI_Boundary",
                "area_km2": area_km2,
                "observation_period": f"{start_year}-{end_year}",
                "risk_score": ml_result.get("risk_score", summary.get("risk_score", 0)),
                "risk_level": ml_result.get("risk_level", summary.get("risk_level", "Low")),
                "disturbance_probability": round(float(ml_result.get("probability", 0.0)), 4),
                "dominant_hazard": summary.get("dominant_risk", "Environmental Shift"),
                "net_ndvi_change": summary.get("net_ndvi_change"),
                "net_ndbi_change": summary.get("net_ndbi_change"),
                "net_ndwi_change": summary.get("net_ndwi_change"),
                "vegetation_loss_km2": summary.get("vegetation_loss_km2"),
                "disturbance_km2": summary.get("disturbance_km2"),
                "water_expansion_km2": summary.get("water_expansion_km2"),
                "data_source": source,
                "evidence_status": "Live Earth Engine Observation" if is_live else "Demonstration Mode",
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            },
        },
        # Feature 2: Centroid marker point
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [centroid_lng, centroid_lat],
            },
            "properties": {
                "name": f"{region_name} (Centroid)",
                "type": "AOI_Centroid",
                "risk_score": ml_result.get("risk_score", summary.get("risk_score", 0)),
                "risk_level": ml_result.get("risk_level", summary.get("risk_level", "Low")),
            },
        },
    ]

    geojson_doc = {
        "type": "FeatureCollection",
        "name": f"GeoVision_AOI_{region_name.replace(' ', '_')}",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"},
        },
        "features": features,
    }

    safe_name = "".join(c for c in region_name if c.isalnum() or c in ("-", "_")).strip() or "aoi"
    filename = f"geovision_aoi_{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M')}.geojson"
    return Response(
        content=json.dumps(geojson_doc).encode("utf-8"),
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

