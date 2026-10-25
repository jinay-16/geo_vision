"""Overview dashboard endpoint — aggregates data from all modules."""

from fastapi import APIRouter
from ..schemas.responses import OverviewResponse
from ..services.demo_data import demo_data, DEMO_SOURCE

router = APIRouter()

METHODOLOGY = (
    "Multi-temporal Sentinel-2 satellite analysis using NDVI, NDWI, and NDBI "
    "environmental indicators. Risk scores are computed using an explainable "
    "rule-based engine. All results are risk estimates, not confirmed observations."
)
LIMITATIONS = (
    "Data is from a single pilot area (Pune, India) for January–March composites. "
    "Risk scores are experimental and require field verification. This is not an "
    "official government classification system."
)


@router.get("/overview", response_model=OverviewResponse)
async def get_overview():
    overview = demo_data.get_overview()
    recent = demo_data.get_hotspots(limit=10)

    return OverviewResponse(
        total_monitored_regions=overview["total_monitored_regions"],
        total_points=overview["total_points"],
        high_risk_zones=overview["high_risk_zones"],
        vegetation_loss_areas=overview["vegetation_loss_areas"],
        land_disturbance_areas=overview["land_disturbance_areas"],
        flood_risk_areas=overview["flood_risk_areas"],
        last_analysis_date=overview["last_analysis_date"],
        risk_distribution=overview["risk_distribution"],
        module_stats=overview.get("module_stats"),
        module_changes=overview.get("module_changes"),
        recent_hotspots=recent,
        source=demo_data.get_source(),
        is_demo=demo_data.is_demo,
        methodology=METHODOLOGY,
        limitations=LIMITATIONS,
    )
