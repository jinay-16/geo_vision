"""
GeoVision AI — FastAPI Application
Explainable multi-temporal geospatial intelligence platform.

Run:  uvicorn backend.app.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .services.demo_data import demo_data
from .services.ml_service import ml_service
from .services.gee_service import gee_service

# ── Route imports ──────────────────────────────────────────────────────
from .routes import health, overview, deforestation, mining, flood
from .routes import hotspots, trends, reports, predict, gee_routes, analysis, export, user_data, photo_analysis, satellite_comparison


# ── Lifespan ───────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: load demo data, ML model, and initialize Google Earth Engine."""
    print("=" * 60)
    print("  GEOVISION AI — Starting up")
    print(f"  Mode    : {'DEMO' if settings.DEMO_MODE else 'LIVE'}")
    print(f"  Version : {settings.API_VERSION}")
    print("=" * 60)

    # Load demo data (parses CSV, builds risk records)
    demo_data.load()

    # Load ML model
    ml_service.load_model()

    # Initialize Google Earth Engine
    gee_success, gee_status, gee_msg = gee_service.initialize_gee()

    print("=" * 60)
    print("  GEOVISION AI — Component Status")
    print(f"  Dataset      : {'OK' if demo_data.loaded else 'NOT LOADED'}")
    print(f"  ML Model     : {'OK' if ml_service.model_loaded else 'NOT LOADED'}")
    print(f"  Earth Engine : {gee_status} ({gee_msg})")
    print("=" * 60)

    yield  # app runs

    print("[GeoVision AI] Shutting down")


# ── App creation ───────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.API_VERSION,
    description=(
        "Explainable geospatial intelligence platform for environmental risk estimation. "
        "All results are risk estimates requiring field verification."
    ),
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register routes ────────────────────────────────────────────────────

app.include_router(health.router, prefix="/api", tags=["Health"])
app.include_router(overview.router, prefix="/api", tags=["Overview"])
app.include_router(deforestation.router, prefix="/api", tags=["Deforestation"])
app.include_router(mining.router, prefix="/api", tags=["Mining"])
app.include_router(flood.router, prefix="/api", tags=["Flood"])
app.include_router(hotspots.router, prefix="/api", tags=["Hotspots"])
app.include_router(trends.router, prefix="/api", tags=["Trends"])
app.include_router(reports.router, prefix="/api", tags=["Reports"])
app.include_router(predict.router, prefix="/api", tags=["Prediction"])
app.include_router(gee_routes.router, prefix="/api", tags=["Earth Engine"])
app.include_router(analysis.router, prefix="/api", tags=["Analysis"])
app.include_router(export.router, prefix="/api", tags=["Export"])
app.include_router(user_data.router, prefix="/api", tags=["User Data"])
app.include_router(photo_analysis.router, prefix="/api", tags=["Photo Analysis"])
app.include_router(satellite_comparison.router, prefix="/api", tags=["Satellite Comparison"])


# ── Root redirect ──────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.API_VERSION,
        "mode": "demo" if settings.DEMO_MODE else "live",
        "docs": "/docs",
        "api_health": "/api/health",
    }
