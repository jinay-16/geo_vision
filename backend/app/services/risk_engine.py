"""
GeoVision AI — Risk Scoring Engine
Explainable, rule-based risk scoring for three environmental domains.

Risk levels:
  Low    :  0–39
  Medium : 40–69
  High   : 70–100

All outputs are RISK ESTIMATES requiring field verification.
These are NOT official government classifications.
"""


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> int:
    """Clamp a value to [lo, hi] and return as integer."""
    return int(max(lo, min(hi, value)))


def risk_level(score: int) -> str:
    """Map a 0-100 score to a human-readable risk level."""
    if score <= 39:
        return "Low"
    if score <= 69:
        return "Medium"
    return "High"


# ── Deforestation / Vegetation Loss ────────────────────────────────────


def deforestation_risk(
    ndvi_change: float,
    ndvi_current: float = 0.0,
    ndvi_previous: float = 0.0,
) -> int:
    """
    Estimate vegetation-loss risk (0–100).

    Primary signal : magnitude of NDVI decline (ndvi_change is current − previous,
                     so a negative value means vegetation loss).
    Secondary bonus: higher baseline vegetation increases concern.

    Thresholds (approximate):
        NDVI decline ≤ −0.20 with baseline ≥ 0.4  → High  (70–100)
        NDVI decline between −0.10 and −0.20       → Medium (40–69)
        NDVI decline > −0.10 or low baseline       → Low   (0–39)
    """
    if ndvi_change >= 0:
        # No decline → minimal risk, small score from baseline density
        return clamp(max(0.0, ndvi_previous * 10.0))

    mag = abs(ndvi_change)
    if mag <= 0.10:
        score = (mag / 0.10) * 40.0
    elif mag <= 0.20:
        score = 40.0 + ((mag - 0.10) / 0.10) * 30.0
    elif mag <= 0.85:
        score = 70.0 + ((mag - 0.20) / 0.65) * 30.0
    else:
        score = 100.0

    # Baseline bonus: losing dense vegetation is more concerning
    if ndvi_previous >= 0.4:
        score += 3.0
    elif ndvi_previous >= 0.25:
        score += 1.0

    return clamp(score)


# ── Mining / Land-Surface Disturbance ──────────────────────────────────


def mining_risk(
    ndbi_change: float,
    ndvi_change: float = 0.0,
    ndbi_current: float = 0.0,
) -> int:
    """
    Estimate potential mining-related land disturbance risk (0–100).

    Primary signal   : increase in NDBI (built-up / bare-soil expansion).
    Secondary signal : simultaneous vegetation decline amplifies concern.

    Thresholds (approximate):
        NDBI increase ≥ 0.15 AND NDVI decline  → High  (70–100)
        NDBI increase ≥ 0.08                    → Medium (40–69)
        Otherwise                               → Low   (0–39)
    """
    if ndbi_change <= 0:
        return clamp(max(0.0, abs(ndbi_change) * 20.0))

    if ndbi_change <= 0.08:
        score = (ndbi_change / 0.08) * 40.0
    elif ndbi_change <= 0.15:
        score = 40.0 + ((ndbi_change - 0.08) / 0.07) * 30.0
    elif ndbi_change <= 0.75:
        score = 70.0 + ((ndbi_change - 0.15) / 0.60) * 30.0
    else:
        score = 100.0

    # Vegetation loss amplifier
    if ndvi_change < -0.10:
        score += min(5.0, abs(ndvi_change) * 10.0)

    # Already high built-up → urban area damping
    if ndbi_current > 0.15:
        score *= 0.85

    return clamp(score)


# ── Flood / Water-Extent Change ────────────────────────────────────────


def flood_risk(
    ndwi_change: float,
    ndwi_current: float = 0.0,
    ndwi_previous: float = 0.0,
) -> int:
    """
    Estimate flood / water-extent risk (0–100).

    Primary signal : increase in NDWI (water expansion).
    Secondary      : already-wet areas with further expansion.

    Thresholds (approximate):
        NDWI increase ≥ 0.15   → High  (70–100)
        NDWI increase 0.05–0.15 → Medium (40–69)
        Otherwise              → Low   (0–39)
    """
    if ndwi_change <= 0:
        return clamp(max(0.0, abs(ndwi_change) * 15.0))

    if ndwi_change <= 0.05:
        score = (ndwi_change / 0.05) * 40.0
    elif ndwi_change <= 0.15:
        score = 40.0 + ((ndwi_change - 0.05) / 0.10) * 30.0
    elif ndwi_change <= 0.85:
        score = 70.0 + ((ndwi_change - 0.15) / 0.70) * 30.0
    else:
        score = 100.0

    # Already wet → amplify slightly
    if ndwi_current > 0:
        score += 3.0

    return clamp(score)


# ── Confidence estimation ──────────────────────────────────────────────


def estimate_confidence(change_magnitude: float, data_quality: str = "demo") -> float:
    """
    Estimate confidence in the risk assessment (0.0–1.0).
    Demo data gets a baseline penalty.
    """
    base = min(1.0, abs(change_magnitude) * 3 + 0.3)
    if data_quality == "demo":
        base *= 0.75  # demo discount
    return round(min(1.0, max(0.0, base)), 2)


# ── Composite AOI Risk Engine ──────────────────────────────────────────


def calculate_composite_aoi_risk(
    features: dict,
    area_km2: float,
    veg_loss_km2: float,
    disturb_km2: float,
    water_exp_km2: float,
    ml_probability: float = 0.0,
    ml_prediction: int = 0,
) -> dict:
    """
    Calculate an explainable, multi-hazard composite risk score (0-100) for a user-defined AOI.

    Integrates:
      1. Machine Learning inference probability (Random Forest model)
      2. Deforestation & canopy health decline (Sentinel-2 NDVI dynamics + affected area)
      3. Mining, quarrying & land-surface disturbance (NDBI built-up/bare soil shift + SWIR reflectance)
      4. Surface water inundation / flood extent (NDWI water index dynamics)
      5. Spatial scale calibration (prevents localized high-impact disturbances from being diluted in large AOIs)
    """
    area_km2 = max(0.1, float(area_km2))
    veg_loss_km2 = max(0.0, float(veg_loss_km2))
    disturb_km2 = max(0.0, float(disturb_km2))
    water_exp_km2 = max(0.0, float(water_exp_km2))

    ndvi_2026 = float(features.get("NDVI_2026", 0.3))
    ndvi_2023 = float(features.get("NDVI_2023", 0.38))
    net_ndvi = float(features.get("NDVI_Change", ndvi_2026 - ndvi_2023))
    net_ndbi = float(features.get("NDBI_Change", 0.0))
    net_ndwi = float(features.get("NDWI_Change", 0.0))
    ndbi_cur = float(features.get("NDBI_2026", 0.0))
    ndwi_cur = float(features.get("NDWI_2026", -0.2))

    # 1. Deforestation / Canopy Loss Component
    s_veg_spectral = deforestation_risk(net_ndvi, ndvi_current=ndvi_2026, ndvi_previous=ndvi_2023)
    veg_loss_ratio = veg_loss_km2 / area_km2
    if veg_loss_km2 >= 0.5 or (veg_loss_ratio >= 0.012 and veg_loss_km2 >= 0.2):
        s_veg_area = min(85.0, (veg_loss_ratio * 400.0) + min(35.0, veg_loss_km2 * 14.0))
    else:
        s_veg_area = veg_loss_ratio * 100.0  # minimal background fluctuation
    s_veg = clamp(max(s_veg_spectral, s_veg_area))

    # 2. Mining / Quarry / Bare Soil Disturbance Component
    s_mine_spectral = mining_risk(net_ndbi, ndvi_change=net_ndvi, ndbi_current=ndbi_cur)
    disturb_ratio = disturb_km2 / area_km2

    # SWIR to NIR reflectance signature (Sentinel-2 B11, B12 vs B8)
    b11 = float(features.get("B11_2026", 1800.0))
    b12 = float(features.get("B12_2026", 1500.0))
    b8 = max(100.0, float(features.get("B8_2026", 2000.0)))
    swir_nir_ratio = (b11 + b12) / (2.0 * b8)

    if disturb_km2 >= 0.25 or (disturb_ratio >= 0.005 and disturb_km2 >= 0.15):
        s_mine_area = min(85.0, (disturb_ratio * 500.0) + min(40.0, disturb_km2 * 25.0))
        if swir_nir_ratio > 1.1:
            s_mine_area = min(90.0, s_mine_area + 15.0)  # Exposed mineral/bedrock boost
    else:
        s_mine_area = disturb_ratio * 120.0
    s_mine = clamp(max(s_mine_spectral, s_mine_area))

    # 3. Flood / Surface Water Inundation Component
    s_flood_spectral = flood_risk(net_ndwi, ndwi_current=ndwi_cur)
    water_ratio = water_exp_km2 / area_km2
    if water_exp_km2 >= 0.4 or (water_ratio >= 0.01 and water_exp_km2 >= 0.2):
        s_flood_area = min(85.0, (water_ratio * 400.0) + min(35.0, water_exp_km2 * 15.0))
    else:
        s_flood_area = water_ratio * 80.0
    s_flood = clamp(max(s_flood_spectral, s_flood_area))

    # 4. Multi-Hazard Composite Ranking
    hazards = [
        ("Vegetation Loss / Canopy Decline", s_veg),
        ("Land Disturbance / Mining Activity", s_mine),
        ("Water Inundation / Flood Extent", s_flood),
    ]
    hazards.sort(key=lambda x: x[1], reverse=True)
    primary_driver, primary_score = hazards[0]
    secondary_score = (hazards[1][1] + hazards[2][1]) / 2.0
    hazard_composite = clamp(primary_score + 0.15 * secondary_score)

    # 5. Hybrid Ensemble with Machine Learning Prediction
    ml_score = clamp(ml_probability * 100.0)

    # Final risk score is the maximum of the ML model confidence and physical multi-hazard evidence
    final_score = clamp(max(ml_score, hazard_composite))

    # Calibrate probability so probability and risk score align realistically
    calibrated_prob = round(max(ml_probability, final_score / 100.0), 4)

    # Calibrate prediction binary class (1 = disturbance, 0 = stable)
    final_prediction = 1 if final_score >= 40 else 0

    # Risk level classification
    r_level = risk_level(final_score)

    # Descriptive label reflecting real physical conditions
    if final_score >= 70:
        label_text = f"Severe Disturbance Detected: {primary_driver}"
    elif final_score >= 40:
        label_text = f"Active Disturbance: {primary_driver}"
    else:
        label_text = "Normal / Stable Ecological State"

    return {
        "risk_score": final_score,
        "risk_level": r_level,
        "probability": calibrated_prob,
        "prediction": final_prediction,
        "label": label_text,
        "dominant_driver": primary_driver,
        "sub_scores": {
            "vegetation_loss": s_veg,
            "land_disturbance": s_mine,
            "flood_risk": s_flood,
            "ml_model_score": ml_score,
        },
    }
