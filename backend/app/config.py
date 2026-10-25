"""
GeoVision AI — Configuration
Settings, paths, environment variables, and thresholds.
"""

import os
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

# Load .env from backend/ or project root
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent

if (_BACKEND_DIR / ".env").exists():
    load_dotenv(_BACKEND_DIR / ".env", override=True)
elif (_PROJECT_ROOT / ".env").exists():
    load_dotenv(_PROJECT_ROOT / ".env", override=True)
else:
    load_dotenv(override=True)


class Settings:
    """Application settings resolved from environment and project structure."""

    # ── Paths ──────────────────────────────────────────────────────────
    PROJECT_ROOT: Path = _PROJECT_ROOT
    BACKEND_DIR: Path = _BACKEND_DIR
    ML_DIR: Path = PROJECT_ROOT / "ml"
    DATA_CSV: Path = PROJECT_ROOT / "geovision_ml_dataset_2023_2026.csv"
    MODEL_PATH: Path = ML_DIR / "geovision_rf_model.joblib"
    FEATURE_IMPORTANCE_PATH: Path = ML_DIR / "feature_importance.csv"
    EXPERIMENT_COMPARISON_PATH: Path = ML_DIR / "experiment_comparison.csv"

    # ── Application ────────────────────────────────────────────────────
    APP_NAME: str = "GeoVision AI"
    API_VERSION: str = "1.1.0-live"
    # Operational mode is default
    DEMO_MODE: bool = os.getenv("DEMO_MODE", "false").lower() in ("true", "1", "yes")

    # ── Google Earth Engine Authentication ─────────────────────────────
    # Method 1 (Preferred for local dev): Earth Engine user account via local credentials
    EE_PROJECT_ID: Optional[str] = os.getenv("EE_PROJECT_ID") or None

    # Method 2 (Optional for service accounts)
    EE_SERVICE_ACCOUNT: Optional[str] = os.getenv("EE_SERVICE_ACCOUNT") or None
    EE_PRIVATE_KEY_FILE: Optional[str] = os.getenv("EE_PRIVATE_KEY_FILE") or None

    # ── CORS ───────────────────────────────────────────────────────────
    _DEFAULT_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """
        Resolved allowed origins. Supports comma-separated CORS_ORIGINS environment variable.
        Preserves local-development defaults and rejects wildcard '*' because allow_credentials=True.
        """
        raw_env = os.getenv("CORS_ORIGINS", "")
        origins = list(self._DEFAULT_CORS_ORIGINS)
        if raw_env.strip():
            for orig in raw_env.split(","):
                cleaned = orig.strip().rstrip("/")
                if cleaned and cleaned != "*" and cleaned not in origins:
                    origins.append(cleaned)
        return origins

    # ── Risk thresholds ────────────────────────────────────────────────
    RISK_LOW_MAX: int = 39
    RISK_MEDIUM_MAX: int = 69
    # 70–100 = High

    # ── Pilot area metadata ───────────────────────────────────────────
    PILOT_AREA: str = "Pune, Maharashtra, India"
    ANALYSIS_PERIOD: str = "January–March, 2023–2026"
    SATELLITE_SOURCE: str = "Sentinel-2 Surface Reflectance (via Google Earth Engine)"

    # ── ML model expected features (Experiment 2, leakage-controlled) ─
    MODEL_FEATURES: List[str] = [
        "B11_2026", "B12_2026", "B2_2026", "B3_2026", "B4_2026", "B8_2026",
        "NDBI_2023", "NDBI_2026", "NDBI_Change",
        "NDVI_2024", "NDVI_2025", "NDVI_2026",
        "NDWI_2023", "NDWI_2026", "NDWI_Change",
    ]


settings = Settings()
