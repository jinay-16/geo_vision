# GeoVision AI — System Architecture

## 1. System Overview

GeoVision AI is an explainable, multi-temporal geospatial intelligence platform for
detecting, quantifying, and estimating environmental change risk. It monitors three
domains using Sentinel-2 satellite-derived indicators:

1. **Deforestation / Vegetation Loss** — via NDVI analysis
2. **Potential Mining-Related Land Disturbance** — via NDBI + NDVI analysis
3. **Flood / Water-Extent Change** — via NDWI analysis

All outputs are **risk estimates** requiring field verification. The platform does not
produce official government classifications or confirmed predictions.

---

## 2. Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                   React + Vite Frontend                      │
│                                                              │
│  Sidebar ─── Pages ─── Components                            │
│  ├─ Overview         ├─ MapView (Leaflet + OpenStreetMap)    │
│  ├─ Deforestation    ├─ TrendChart (Recharts)                │
│  ├─ Illegal Mining   ├─ RiskDistributionChart                │
│  ├─ Flood Risk       ├─ StatCard / RiskBadge                 │
│  ├─ Common Map       ├─ HotspotTable                         │
│  ├─ Reports          ├─ DemoModeBanner                       │
│  └─ Methodology      └─ LoadingState / ErrorState            │
│                                                              │
│                    REST API (fetch)                           │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────────┐
│                  FastAPI Backend (Python)                     │
│                                                              │
│  Routes ─── Services ─── Models                              │
│  ├─ /api/health          ├─ demo_data.py                     │
│  ├─ /api/overview        ├─ risk_engine.py                   │
│  ├─ /api/deforestation   ├─ ml_service.py                    │
│  ├─ /api/mining          └─ report_service.py                │
│  ├─ /api/flood                                               │
│  ├─ /api/hotspots      Data Sources                          │
│  ├─ /api/trends        ├─ CSV Dataset (5000 points, Pune)    │
│  ├─ /api/reports/*     ├─ RF Model (.joblib)                 │
│  └─ /api/predict       └─ SQLite (future)                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Folder Structure

```
geovision-ai/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app, CORS, lifespan
│   │   ├── config.py                # Settings, paths, thresholds
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── responses.py         # Pydantic response models
│   │   ├── routes/
│   │   │   ├── __init__.py
│   │   │   ├── health.py
│   │   │   ├── overview.py
│   │   │   ├── deforestation.py
│   │   │   ├── mining.py
│   │   │   ├── flood.py
│   │   │   ├── hotspots.py
│   │   │   ├── trends.py
│   │   │   ├── reports.py
│   │   │   └── predict.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── demo_data.py         # CSV loading, demo record generation
│   │   │   ├── risk_engine.py       # Multi-domain risk scoring
│   │   │   └── ml_service.py        # RF model loading & inference
│   │   └── utils/
│   │       └── __init__.py
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api/
│       │   └── client.js            # API fetch wrapper
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   ├── StatCard.jsx
│       │   ├── RiskBadge.jsx
│       │   ├── ModuleCard.jsx
│       │   ├── MapView.jsx
│       │   ├── TrendChart.jsx
│       │   ├── RiskDistributionChart.jsx
│       │   ├── HotspotTable.jsx
│       │   ├── LoadingState.jsx
│       │   ├── ErrorState.jsx
│       │   └── DemoModeBanner.jsx
│       └── pages/
│           ├── Overview.jsx
│           ├── Deforestation.jsx
│           ├── Mining.jsx
│           ├── Flood.jsx
│           ├── CommonMap.jsx
│           ├── Reports.jsx
│           └── Methodology.jsx
├── data/
│   └── README.md                    # (existing)
├── docs/
│   ├── system-architecture.md       # (existing)
│   └── ARCHITECTURE.md              # (this file)
├── gee/
│   ├── README.md                    # (existing)
│   └── geovision_analysis.js        # (existing — reference)
├── ml/
│   ├── random_forest.py             # (existing — training script)
│   ├── geovision_rf_model.joblib    # (existing — trained model)
│   ├── feature_importance.csv       # (existing)
│   └── ...                          # (existing artifacts)
├── geovision_ml_dataset_2023_2026.csv  # (existing — 5000 samples)
└── requirements.txt
```

---

## 4. Data Flow

```
Demo Mode:
  CSV (5000 Sentinel-2 samples from Pune)
    → Parse coordinates from .geo column
    → Assign to 9 sub-regions
    → Compute per-module risk scores (rule-based)
    → Serve via API as clearly-labelled demo data

Live Mode (future):
  User draws AOI on map
    → POST /api/analyze with GeoJSON polygon
    → Backend calls Google Earth Engine (earthengine-api)
    → Fetches Sentinel-2 composites (Jan–Mar, 2023–2026)
    → Computes NDVI, NDWI, NDBI per year
    → Computes change features
    → Runs trained RF model for inference
    → Returns risk results
```

---

## 5. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System status, mode, model status |
| GET | `/api/overview` | Dashboard summary across all modules |
| GET | `/api/deforestation` | Vegetation-loss module data |
| GET | `/api/mining` | Land-disturbance module data |
| GET | `/api/flood` | Water-extent module data |
| GET | `/api/hotspots?module=X` | Filtered hotspot list |
| GET | `/api/trends` | Multi-year trend data |
| GET | `/api/reports/summary` | JSON report summary |
| GET | `/api/reports/pdf` | Downloadable PDF report |
| POST | `/api/predict` | Single-point ML prediction |

All responses include: `source`, `is_demo`, `last_updated`, `methodology`, `limitations`.

---

## 6. ML Pipeline

### Existing Model
- **Algorithm:** Random Forest (200 trees, balanced class weights)
- **Training data:** 5,000 Sentinel-2 samples from Pune (2023–2026)
- **Target:** Rule-based pseudo-label (NDVI_2023 ≥ 0.4 AND NDVI_Change ≤ −0.2)
- **Leakage-controlled features (15):** B2–B12_2026, NDWI_2023/2026/Change, NDBI_2023/2026/Change, NDVI_2024/2025/2026
- **Performance:** 98.1% test accuracy, F1=0.981, ROC-AUC=0.998

### Limitations (must be shown to users)
1. Labels are rule-generated, not independently verified ground truth
2. Accuracy may be inflated due to label–feature correlation
3. Model was trained on a single pilot area (Pune) for a single season (Jan–Mar)
4. Not validated as a real-world forecasting model
5. Predictions are risk estimates, not confirmed observations

### Inference Flow
```
Input features (dict) → Validate 15 required features
  → Load geovision_rf_model.joblib
  → model.predict_proba() → probability
  → Map to risk_score (0–100) and risk_level
  → Return with model metadata and limitations
```

---

## 7. Risk Scoring Logic

### Deforestation Risk
```
score = clip(0, 100, -ndvi_change × 200 + vegetation_baseline_bonus)
  - NDVI decline ≤ -0.2 and baseline ≥ 0.4 → High risk (70–100)
  - NDVI decline between -0.1 and -0.2 → Medium risk (40–69)
  - NDVI decline > -0.1 or low baseline → Low risk (0–39)
```

### Mining Disturbance Risk
```
score = clip(0, 100, ndbi_increase × 150 + vegetation_loss_factor × 100)
  - NDBI increase ≥ 0.15 AND NDVI decline → High risk
  - NDBI increase ≥ 0.08 → Medium risk
  - Otherwise → Low risk
```

### Flood / Water-Extent Risk
```
score = clip(0, 100, ndwi_increase × 200 + water_expansion_factor)
  - NDWI increase ≥ 0.15 → High risk
  - NDWI increase between 0.05 and 0.15 → Medium risk
  - Otherwise → Low risk
```

All risk levels: **Low (0–39)**, **Medium (40–69)**, **High (70–100)**.
Clearly labelled as model/demo risk categories, not official government classifications.

---

## 8. Database Plan

### Current (MVP)
- In-memory data from CSV (no database required for demo)
- File-based artifacts (model, CSVs, PNGs)

### Future
- SQLite for: analysis history, saved AOIs, alert logs, user sessions
- Tables: `analyses`, `hotspots`, `alerts`, `aoi_bookmarks`

---

## 9. Demo Mode Plan

### Activation
```python
DEMO_MODE = os.getenv("DEMO_MODE", "true")
```
Auto-enabled when GEE credentials are not configured.

### Demo Data Source
- Existing `geovision_ml_dataset_2023_2026.csv` (5,000 real Sentinel-2 samples)
- Real coordinates from Pune pilot area
- Real spectral and index values from GEE processing
- Risk scores computed using the rule-based risk engine

### Labelling Requirements
- Every API response includes `"is_demo": true`
- Every API response includes `"source": "Demo — Sentinel-2 sample data from Pune pilot area"`
- Frontend shows persistent "DEMO MODE" banner
- Map shows "DEMO DATA" watermark
- No data is presented as real-time or live satellite analysis

---

## 10. Validation & Limitations

1. **Pseudo-labels:** Training labels are rule-based (NDVI thresholds), not field-verified
2. **Single pilot area:** Model trained only on Pune; generalization is untested
3. **Seasonal window:** Analysis covers Jan–Mar only
4. **No ground truth:** No field verification data is included
5. **Mining detection:** Satellite data cannot confirm legality of mining
6. **Flood risk:** Not a replacement for meteorological early-warning systems
7. **Temporal coverage:** 4 years (2023–2026); long-term trends require more data

---

## 11. Future Improvements

1. **Live GEE integration** — User-drawn AOI → real-time satellite analysis
2. **SHAP explainability** — Per-prediction feature contribution explanations
3. **Spatial block cross-validation** — Address spatial autocorrelation
4. **Additional data sources** — Sentinel-1 SAR, DEM, rainfall, land-cover
5. **Multi-region support** — Beyond Pune pilot area
6. **Alert system** — Automated threshold-based notifications
7. **User authentication** — Role-based access for government users
8. **Historical analysis** — Extended temporal baselines
