"""Hotspots endpoint — returns highest-risk locations across modules."""

from fastapi import APIRouter, Query
from typing import Optional
from ..schemas.responses import HotspotsResponse
from ..services.demo_data import demo_data, DEMO_SOURCE

router = APIRouter()


@router.get("/hotspots", response_model=HotspotsResponse)
async def get_hotspots(
    module: Optional[str] = Query(None, description="Filter by module: deforestation, mining, flood"),
    limit: int = Query(50, ge=1, le=5000, description="Number of hotspots to return"),
    region: Optional[str] = Query(None, description="Filter by region name"),
    min_lat: Optional[float] = Query(None, description="Minimum latitude"),
    max_lat: Optional[float] = Query(None, description="Maximum latitude"),
    min_lng: Optional[float] = Query(None, description="Minimum longitude"),
    max_lng: Optional[float] = Query(None, description="Maximum longitude"),
):
    hotspots = demo_data.get_hotspots(
        module=module,
        limit=limit,
        min_lat=min_lat,
        max_lat=max_lat,
        min_lng=min_lng,
        max_lng=max_lng,
        region=region,
    )
    return HotspotsResponse(
        hotspots=hotspots,
        total=len(hotspots),
        source=demo_data.get_source(),
        is_demo=demo_data.is_demo,
    )
