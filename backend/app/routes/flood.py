"""Flood / water-extent change module endpoint."""

import logging
from fastapi import APIRouter, HTTPException
from ..schemas.responses import (
    ModuleResponse,
    MultiSensorAnalysisRequest,
    MultiSensorAnalysisResponse,
    SensorStatus,
)
from ..services.demo_data import demo_data, DEMO_SOURCE, ANALYSIS_DATE
from ..services.gee_service import gee_service

logger = logging.getLogger("geovision.flood")
router = APIRouter()

METHODOLOGY = (
    "Water-extent change monitoring using dual-sensor fusion: Sentinel-1 Synthetic Aperture Radar (SAR) "
    "combined with Sentinel-2 NDWI (Normalized Difference Water Index). Multi-temporal composites are "
    "compared across reference and target windows. Specular reflection in radar backscatter provides "
    "all-weather cloud penetration, while optical NDWI confirms open water spectral absorption."
)
LIMITATIONS = (
    "Distinguish three concepts: (1) Observed water extent (detected water surface); (2) Potential flood-related "
    "expansion (relative increase from reference period); (3) Flood prediction or forward-looking risk, which is "
    "NOT claimed here as this requires validated hydrological and rainfall modeling. Optical imagery is affected "
    "by cloud cover; radar backscatter can be influenced by wind-induced wave roughness or canopy layover. "
    "All findings require field and meteorological corroboration."
)


@router.get("/flood", response_model=ModuleResponse)
async def get_flood():
    """Retrieve reference pilot flood dataset (Pune study area)."""
    data = demo_data.get_module_data("flood")
    return ModuleResponse(
        summary=data["summary"],
        hotspots=data["hotspots"][:200],
        trends=data["trends"],
        risk_distribution=data["risk_distribution"],
        source=demo_data.get_source(),
        is_demo=demo_data.is_demo,
        last_updated=demo_data.upload_timestamp or ANALYSIS_DATE,
        methodology=METHODOLOGY,
        limitations=LIMITATIONS,
    )


@router.post("/flood/analyze", response_model=MultiSensorAnalysisResponse)
async def analyze_flood_aoi(request: MultiSensorAnalysisRequest):
    """
    Live AOI Flood & Water-Extent Analysis using Dual-Sensor Fusion (Sentinel-1 SAR + Sentinel-2).
    Penetrates clouds using radar specular backscatter drop while corroborating with optical NDWI.
    """
    geojson_dict = (
        request.geometry.model_dump()
        if hasattr(request.geometry, "model_dump")
        else request.geometry.dict()
    )

    geom, area_km2, centroid, err = gee_service.geojson_to_ee_geometry(geojson_dict)
    if err:
        raise HTTPException(status_code=400, detail=err)

    if not request.demo and gee_service.is_connected:
        try:
            analysis = gee_service.analyze_dual_sensor_aoi(
                geometry=geom,
                area_km2=area_km2,
                start_year=request.start_year,
                end_year=request.end_year,
                start_month=request.start_month,
                end_month=request.end_month,
                module="flood",
                orbit_pass=request.orbit_pass or "DESCENDING",
            )

            # Generate map tile layers clipped to AOI
            tile_layers = {}
            try:
                tiles = gee_service.get_map_tile_layers(
                    start_year=request.start_year,
                    end_year=request.end_year,
                    start_month=request.start_month,
                    end_month=request.end_month,
                    geometry=geom,
                )
                tile_layers = tiles.get("layers", {})
            except Exception as e:
                logger.debug(f"Flood tile layer generation warning: {e}")

            return MultiSensorAnalysisResponse(
                module="flood",
                region_name=request.region_name or f"AOI ({area_km2} km²)",
                geometry_area_km2=analysis["geometry_area_km2"],
                raster_pixel_area_km2=analysis.get("raster_pixel_area_km2"),
                valid_observed_area_km2=analysis["valid_observed_area_km2"],
                coverage_percentage=analysis["coverage_percentage"],
                base_year=analysis["base_year"],
                eval_year=analysis["eval_year"],
                start_month=analysis["start_month"],
                end_month=analysis["end_month"],
                dominant_driver=analysis["dominant_driver"],
                affected_area_km2=analysis["affected_area_km2"],
                risk_score=analysis["risk_score"],
                risk_level=analysis["risk_level"],
                sensor_status=SensorStatus(**analysis["sensor_status"]),
                s2_metrics=analysis.get("s2_metrics"),
                s1_metrics=analysis.get("s1_metrics"),
                fusion_metrics=analysis.get("fusion_metrics"),
                tile_layers=tile_layers,
                source=analysis["source"],
                is_live=True,
                is_demo=False,
                reduction_scale_meters=analysis.get("reduction_scale_meters", 50),
                methodology=METHODOLOGY,
                limitations=LIMITATIONS,
            )
        except Exception as ex:
            logger.error(f"[Flood Live Analysis Error]: {ex}")
            raise HTTPException(
                status_code=422 if isinstance(ex, ValueError) else 502,
                detail=f"Live dual-sensor flood analysis failed: {str(ex)}. Set demo=true for offline demonstration mode.",
            )

    # Demo fallback when explicitly requested
    if request.demo or not gee_service.is_connected:
        sim_water = round(area_km2 * 0.08, 3)
        sim_exp = round(area_km2 * 0.04, 3)
        return MultiSensorAnalysisResponse(
            module="flood",
            region_name=request.region_name or "Demonstration AOI",
            geometry_area_km2=area_km2,
            raster_pixel_area_km2=area_km2,
            valid_observed_area_km2=round(area_km2 * 0.95, 2),
            coverage_percentage=95.0,
            base_year=request.start_year,
            eval_year=request.end_year,
            start_month=request.start_month,
            end_month=request.end_month,
            dominant_driver="Surface Water / Inundation Extent",
            affected_area_km2=sim_exp,
            risk_score=45,
            risk_level="Medium",
            sensor_status=SensorStatus(
                s1_available=True,
                s2_available=True,
                fusion_status="both_available",
                fusion_method="Simulated Dual-Sensor Coincident Demonstration",
                s1_scene_count_base=4,
                s1_scene_count_eval=4,
                s2_scene_count_base=6,
                s2_scene_count_eval=6,
            ),
            s2_metrics={
                "optical_water_extent_km2": sim_water,
                "optical_water_expansion_km2": sim_exp,
                "ndwi_change": 0.06,
            },
            s1_metrics={
                "sar_water_extent_km2": sim_water,
                "sar_water_expansion_km2": sim_exp,
                "vv_change_db": -2.8,
            },
            fusion_metrics={
                "fusion_status": "both_available",
                "flood": {
                    "combined_water_extent_km2": sim_water,
                    "coincident_water_extent_km2": round(sim_water * 0.85, 3),
                    "potential_flood_expansion_km2": sim_exp,
                },
            },
            tile_layers={},
            source="GeoVision synthetic demonstration fallback (CSV unavailable)",
            is_live=False,
            is_demo=True,
            methodology=METHODOLOGY,
            limitations=LIMITATIONS,
        )
