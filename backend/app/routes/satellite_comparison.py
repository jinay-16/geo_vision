"""
GeoVision AI — Satellite Comparison Route
Provides interactive before/after Sentinel-2 satellite comparison with verified
environmental change metrics (NDVI, NDWI, common-valid-pixel policy) powered by
Google Earth Engine.
"""

import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, status

from ..schemas.responses import (
    SatelliteComparisonRequest,
    SatelliteComparisonResponse,
)
from ..services.gee_service import gee_service
from ..services.comparison_service import (
    satellite_comparison_service,
    validate_date_intervals,
)

logger = logging.getLogger("geovision.routes.comparison")
router = APIRouter()


@router.post("/satellite-comparison/analyze", response_model=SatelliteComparisonResponse)
async def analyze_satellite_comparison(request: SatelliteComparisonRequest):
    """
    Run multi-temporal satellite comparison over an AOI:
      1. Validate geometry structure, coordinate limits, and closure.
      2. Validate chronological order and interval limits of before and after dates.
      3. Extract cloud-masked Sentinel-2 Surface Reflectance composites via Google Earth Engine.
      4. Apply common-valid-pixel policy to ensure strictly matched observation populations.
      5. Calculate real NDVI and NDWI metrics, differences, and physical surface areas.
      6. Return natural color and index differential map tile URLs for interactive swipe comparison.
    """
    # 1. Date Interval Validation
    is_valid_dates, date_err = validate_date_intervals(
        before_start=request.before_start_date,
        before_end=request.before_end_date,
        after_start=request.after_start_date,
        after_end=request.after_end_date,
    )
    if not is_valid_dates:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=date_err,
        )

    # 2. AOI Geometry Validation
    geom, area_km2, centroid, geom_err = gee_service.geojson_to_ee_geometry(request.geometry)
    if geom_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"AOI geometry error: {geom_err}",
        )

    region_title = request.region_name or f"Custom AOI ({area_km2:.2f} km²)"

    # 3. Execute Satellite Comparison
    try:
        comparison_result = satellite_comparison_service.analyze_comparison(
            geometry=geom,
            area_km2=area_km2,
            before_start=request.before_start_date,
            before_end=request.before_end_date,
            after_start=request.after_start_date,
            after_end=request.after_end_date,
            region_name=region_title,
            cloud_threshold=request.cloud_threshold,
            demo=bool(request.demo),
        )
    except Exception as ex:
        logger.error(f"Satellite comparison processing failure: {ex}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Earth Engine satellite comparison calculation failed: {str(ex)}",
        )

    return SatelliteComparisonResponse(**comparison_result)
