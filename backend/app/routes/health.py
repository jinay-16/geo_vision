"""Health check endpoint."""

from fastapi import APIRouter
from ..schemas.responses import HealthResponse
from ..config import settings
from ..services.ml_service import ml_service
from ..services.demo_data import demo_data
from ..services.gee_service import gee_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="ok",
        mode="demo" if settings.DEMO_MODE else "live",
        version=settings.API_VERSION,
        model_loaded=ml_service.model_loaded,
        dataset_loaded=demo_data.loaded,
        gee_available=gee_service.is_connected,
    )
