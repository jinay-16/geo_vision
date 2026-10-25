"""Trends endpoint — multi-year environmental indicator trends."""

from fastapi import APIRouter
from ..schemas.responses import TrendsResponse
from ..services.demo_data import demo_data, DEMO_SOURCE

router = APIRouter()


@router.get("/trends", response_model=TrendsResponse)
async def get_trends():
    trends = demo_data.get_trends()
    return TrendsResponse(
        deforestation=trends.get("deforestation", []),
        mining=trends.get("mining", []),
        flood=trends.get("flood", []),
        source=demo_data.get_source(),
        is_demo=demo_data.is_demo,
    )
