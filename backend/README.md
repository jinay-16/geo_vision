# GeoVision AI — Backend

FastAPI backend for the GeoVision AI environmental intelligence platform. Integrates Google Earth Engine (Sentinel-2 Surface Reflectance Harmonized) for live multi-temporal environmental change analysis and risk estimation.

---

## 🔐 Google Earth Engine Authentication

GeoVision AI connects to your authorized Google Earth Engine account using the official Earth Engine Python API (`earthengine-api`).

### Method 1: Local User Account (Recommended for Development)

1. **Authenticate your Google account** in your terminal:
   ```bash
   earthengine authenticate
   ```
   This will open your browser to grant Earth Engine access. It stores your refresh token securely at `~/.config/earthengine/credentials`.

2. **Configure your Google Cloud Project ID**:
   Copy `.env.example` to `.env` in the project root (or `backend/.env`):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and provide your Google Cloud Project ID registered with Earth Engine:
   ```env
   EE_PROJECT_ID=your-google-cloud-project-id
   DEMO_MODE=false
   ```
   *(Alternatively, run `earthengine set_project <your-project-id>`)*.

### Method 2: Service Account (Optional / Production)

Set the following environment variables in `.env`:
```env
EE_SERVICE_ACCOUNT=your-service-account@your-project.iam.gserviceaccount.com
EE_PRIVATE_KEY_FILE=/path/to/private-key.json
EE_PROJECT_ID=your-google-cloud-project-id
```

### Security Guarantees
- **No hardcoded secrets**: Credentials, tokens, and private keys are never stored in source code or Git.
- `.env` and `*credentials*.json` are strictly excluded in `.gitignore`.
- Tokens or private keys are never exposed to the frontend or logged in console logs.

---

## Quick Start

```bash
# From the project root directory:

# 1. Activate virtual environment
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Linux/macOS

# 2. Install dependencies
pip install -r backend/requirements.txt

# 3. Run the server
uvicorn backend.app.main:app --reload --port 8000

# 4. Open API docs
# http://127.0.0.1:8000/docs
```

---

## Architecture

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app, CORS, lifespan, route registration
│   ├── config.py            # Settings: paths, thresholds, GEE settings, DEMO_MODE
│   ├── schemas/
│   │   └── responses.py     # Pydantic response models (GEEStatusResponse, DataPoint, etc.)
│   ├── routes/
│   │   ├── gee_routes.py    # GET /api/gee/status
│   │   ├── health.py        # GET /api/health
│   │   ├── overview.py      # GET /api/overview
│   │   ├── deforestation.py # GET /api/deforestation
│   │   ├── mining.py        # GET /api/mining
│   │   ├── flood.py         # GET /api/flood
│   │   ├── hotspots.py      # GET /api/hotspots
│   │   ├── trends.py        # GET /api/trends
│   │   ├── reports.py       # GET /api/reports/summary, GET /api/reports/pdf
│   │   └── predict.py       # POST /api/predict
│   ├── services/
│   │   ├── gee_service.py   # Earth Engine initialization, verification, collection loader
│   │   ├── demo_data.py     # CSV loading, region assignment, risk record generation
│   │   ├── risk_engine.py   # Rule-based risk scoring (NDVI, NDBI, NDWI)
│   │   └── ml_service.py    # Random Forest model loading & inference
│   └── utils/
│       ├── __init__.py
│       └── pdf_generator.py # ReportLab PDF generator
├── .env.example
└── requirements.txt
```

---

## API Endpoints

| Method | Endpoint               | Description                           | Status Codes |
|--------|------------------------|---------------------------------------|--------------|
| GET    | `/api/gee/status`      | Live Google Earth Engine status check | 200          |
| GET    | `/api/health`          | System health and `gee_available` flag| 200          |
| GET    | `/api/overview`        | Dashboard summary across all modules  | 200          |
| GET    | `/api/deforestation`   | Vegetation-loss module data           | 200          |
| GET    | `/api/mining`          | Land-disturbance module data          | 200          |
| GET    | `/api/flood`           | Water-extent module data              | 200          |
| GET    | `/api/hotspots`        | Filtered hotspot list (`?module=X`)   | 200          |
| GET    | `/api/trends`          | Multi-year trend data                 | 200          |
| GET    | `/api/reports/summary` | JSON report summary                   | 200          |
| GET    | `/api/reports/pdf`     | Downloadable PDF report               | 200          |
| POST   | `/api/predict`         | Single-point ML prediction            | 200          |

### GEE Status Codes (`GET /api/gee/status`)

- `CONNECTED`: Successfully authenticated and verified via live Sentinel-2 query.
- `NOT_AUTHENTICATED`: No user credentials found (`~/.config/earthengine/credentials`).
- `INVALID_PROJECT`: Google Cloud project not found or permission denied.
- `REQUEST_FAILED`: Earth Engine initialization or test query failed.
- `CONFIGURATION_ERROR`: `EE_PROJECT_ID` is missing from environment.

---

## Risk Levels

| Level  | Score Range | Description                  |
|--------|-------------|------------------------------|
| Low    | 0–39        | Within normal variation      |
| Medium | 40–69       | Moderate change detected     |
| High   | 70–100      | Significant change detected  |

> **Disclaimer**: All outputs are trend-based risk estimates requiring field verification. These are not official government classifications or legal confirmations.
