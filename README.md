# GeoVision AI

> **Explainable multi-temporal geospatial intelligence platform for environmental risk estimation.**
> Integrates Google Earth Engine (Sentinel-2 Harmonized) with leakage-controlled Random Forest machine learning to detect vegetation loss, potential mining disturbance, and water-extent change.

---

## 🌍 Core Modules

1. **Deforestation / Vegetation Loss**: Multi-temporal NDVI decline tracking with baseline vegetation density weighting.
2. **Potential Mining-Related Land Disturbance**: NDBI bare-soil/built-up expansion coupled with vegetation reduction.
3. **Flood / Water-Extent Change**: Multi-year NDWI delta mapping for experimental flood risk estimation.

*Disclaimer: All outputs are trend-based risk estimates requiring field verification. These are not official government classifications or legal confirmations.*

---

## 🚀 Quick Start

### 1. Backend Setup (FastAPI & Earth Engine)

```bash
# Activate virtual environment
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Linux/macOS

# Install dependencies
pip install -r requirements.txt

# Authenticate Earth Engine
earthengine authenticate

# Copy environment template and configure EE_PROJECT_ID
cp .env.example .env

# Run FastAPI backend
uvicorn backend.app.main:app --reload --port 8000
```

Backend endpoints:
- API Documentation: `http://localhost:8000/docs`
- GEE Status: `http://localhost:8000/api/gee/status`
- Health Check: `http://localhost:8000/api/health`

### 2. Frontend Setup (React & Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend dashboard: `http://localhost:5173`

---

## 🔒 Security & Credentials

- Never commit `.env` or credentials to version control (configured in `.gitignore`).
- Earth Engine user authentication uses local OAuth tokens stored at `~/.config/earthengine/credentials`.
- Tokens, API secrets, and private keys are never exposed in frontend code or console logs.
