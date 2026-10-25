"""ML prediction endpoint — single-point inference."""

from fastapi import APIRouter, HTTPException
from ..schemas.responses import PredictionRequest, PredictionResponse
from ..services.ml_service import ml_service

router = APIRouter()


@router.post("/predict")
async def predict(request: PredictionRequest):
    result = ml_service.predict(request.features)

    if "error" in result:
        raise HTTPException(status_code=422, detail=result["error"])

    return result
