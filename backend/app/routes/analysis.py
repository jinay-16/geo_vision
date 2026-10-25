"""
GeoVision AI — Multi-Temporal Analysis Route
Year-to-Year and Month-Wise environmental change analysis powered by Google Earth Engine.
"""

from datetime import datetime, timezone
from pathlib import Path
import json
import math
from typing import Optional, Dict, Any, List
import logging
from fastapi import APIRouter, Query, HTTPException
from ..schemas.responses import (
    TemporalAnalysisResponse,
    TemporalSummary,
    YearStat,
    MonthStat,
    DataPoint,
    AOIAnalysisRequest,
    AOIAnalysisResponse,
    AOIMLResult,
    FeatureContribution,
    MultiSensorAnalysisRequest,
    AblationStudyResponse,
    ValidationBenchmarkResponse,
    ReferenceCaseItem,
    ReferenceCaseCreate,
    BhuvanAssessmentResponse,
    LandsatReferenceAnalysisResponse,
    CrossSensorComparisonResponse,
)

from ..services.gee_service import gee_service
from ..services.ml_service import ml_service
from ..services.risk_engine import risk_level, calculate_composite_aoi_risk
from ..services.demo_data import demo_data, ANALYSIS_DATE

logger = logging.getLogger("geovision.analysis")
router = APIRouter()

METHODOLOGY = (
    "Multi-temporal satellite change analysis using Copernicus Sentinel-2 Level-2A Surface Reflectance. "
    "Cloud Score+ filtering screens haze and cloud shadows. Annual and monthly median composites "
    "are compared across the user-selected temporal window to detect long-term trends versus seasonal cycles. "
    "Vegetation index (NDVI), water index (NDWI), and built-up index (NDBI) differentials quantify surface shifts."
)

LIMITATIONS = (
    "Analysis reflects optical surface reflectance changes. Atmospheric conditions, agricultural harvest cycles, "
    "and seasonal drought may influence spectral indicators. All flagged change zones represent experimental "
    "risk indicators and require field verification."
)


@router.get("/analysis/temporal", response_model=TemporalAnalysisResponse)
async def get_temporal_analysis(
    start_year: int = Query(default=2023, ge=2018, le=2026, description="Baseline starting year"),
    end_year: int = Query(default=2026, ge=2018, le=2026, description="Comparison ending year"),
    start_month: int = Query(default=1, ge=1, le=12, description="Starting month (1=Jan)"),
    end_month: int = Query(default=4, ge=1, le=12, description="Ending month (12=Dec)"),
    lat: Optional[float] = Query(default=None, ge=-90.0, le=90.0, description="Optional center latitude"),
    lng: Optional[float] = Query(default=None, ge=-180.0, le=180.0, description="Optional center longitude"),
    radius_km: Optional[float] = Query(default=None, ge=0.01, le=50.0, description="Optional radius in km"),
    module: str = Query(default="all", description="Filter by module (all, deforestation, mining, flood)"),
    demo: bool = Query(default=False, description="Force demo mode"),
):
    """
    Run multi-temporal satellite analysis from a starting year to an ending year,
    including year-over-year progression and month-wise seasonal breakdown.
    """
    # Enforce chronological ordering
    if start_year > end_year:
        start_year, end_year = end_year, start_year
    if start_month > end_month:
        start_month, end_month = end_month, start_month

    is_live = False
    source = demo_data.get_source()

    # Build custom geometry if coordinates provided
    lat_val = lat if isinstance(lat, (int, float)) else 18.5204
    lng_val = lng if isinstance(lng, (int, float)) else 73.8567
    radius_val = radius_km if isinstance(radius_km, (int, float)) else 5.0
    is_custom_location = (lat is not None and lng is not None) or (radius_km is not None and radius_km != 5.0)

    custom_geom = None
    if gee_service.is_connected:
        try:
            import ee
            r_meters = radius_val * 1000.0
            custom_geom = ee.Geometry.Point([lng_val, lat_val]).buffer(r_meters)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid geometry parameters: {e}")

    # Attempt live Earth Engine analysis
    if not demo and gee_service.is_connected:
        try:
            live_data = gee_service.analyze_temporal_window(
                start_year=start_year,
                end_year=end_year,
                start_month=start_month,
                end_month=end_month,
                geometry=custom_geom,
                radius_km=radius_val,
                center_lat=lat_val,
                center_lng=lng_val,
            )
            is_live = True
            source = "Copernicus Sentinel-2 Level-2A via Google Earth Engine"
            summary_dict = dict(live_data["summary"])
            if is_custom_location:
                summary_dict["region"] = f"Custom Location ({lat_val:.4f}°N, {lng_val:.4f}°E, r={radius_val}km)"
                summary_dict["target_coordinates"] = {"lat": lat_val, "lng": lng_val}
                summary_dict["radius_km"] = radius_val
                summary_dict["is_default_location"] = False
            else:
                summary_dict["region"] = "Pune Pilot Study Area (Default Regional Baseline, r=5km)"
                summary_dict["target_coordinates"] = {"lat": 18.5204, "lng": 73.8567}
                summary_dict["radius_km"] = 5.0
                summary_dict["is_default_location"] = True

            yearly_progression = [YearStat(**y) for y in live_data["yearly_progression"]]
            monthly_breakdown = [MonthStat(**m) for m in live_data["monthly_breakdown"]]
        except Exception as e:
            # Raise explicit HTTP error for live request failures rather than silently faking data
            logger.error(f"[Analysis] GEE live analysis error: {e}")
            raise HTTPException(
                status_code=422 if isinstance(e, ValueError) else 502,
                detail=f"Live Earth Engine analysis failed: {str(e)}. Use demo=true for offline demonstration mode."
            )

    if not is_live:
        source = "GeoVision Synthetic Demonstration Engine (Pune Reference Pilot)"
        # Structured deterministic calculation based on selected years and months
        num_years = max(1, end_year - start_year)
        years = list(range(start_year, end_year + 1))
        yearly_progression = []
        for i, yr in enumerate(years):
            ratio = i / max(1, len(years) - 1)
            ndvi_val = round(0.42 - (ratio * 0.12), 4)
            ndwi_val = round(-0.16 + (ratio * 0.08), 4)
            ndbi_val = round(0.11 + (ratio * 0.09), 4)
            health = "Dense Vegetation" if ndvi_val >= 0.4 else ("Moderate Canopy" if ndvi_val >= 0.25 else "Sparse / Disturbed")
            yearly_progression.append(
                YearStat(
                    year=yr,
                    ndvi_mean=ndvi_val,
                    ndwi_mean=ndwi_val,
                    ndbi_mean=ndbi_val,
                    vegetation_health=health,
                    scenes_count=6 + (yr % 4),
                )
            )

        month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        monthly_breakdown = []
        for m in range(start_month, end_month + 1):
            m_name = month_names[m - 1]
            base_v = 0.38 - (m * 0.02)
            end_v = base_v - (0.04 * (num_years / 3.0))
            delta = round(end_v - base_v, 4)
            monthly_breakdown.append(
                MonthStat(
                    month_num=m,
                    month_name=m_name,
                    start_year_val=round(base_v, 4),
                    end_year_val=round(end_v, 4),
                    change_val=delta,
                    indicator_type="NDVI (Vegetation Index)",
                )
            )

        net_ndvi = round(yearly_progression[-1].ndvi_mean - yearly_progression[0].ndvi_mean, 4)
        net_ndwi = round(yearly_progression[-1].ndwi_mean - yearly_progression[0].ndwi_mean, 4)
        net_ndbi = round(yearly_progression[-1].ndbi_mean - yearly_progression[0].ndbi_mean, 4)

        is_default = not is_custom_location
        region_label = (
            "Pune Pilot Area, Maharashtra (Default Baseline, r=5km)"
            if is_default
            else f"Custom Demonstration Zone ({lat_val:.4f}°N, {lng_val:.4f}°E, r={radius_val}km)"
        )

        calc_area = round(math.pi * (radius_val ** 2), 2)
        summary_dict = {
            "start_year": start_year,
            "end_year": end_year,
            "start_month": start_month,
            "end_month": end_month,
            "region": region_label,
            "total_area_km2": calc_area,
            "geometry_area_km2": calc_area,
            "vegetation_loss_km2": round(abs(min(0.0, net_ndvi)) * (calc_area * 0.5), 2),
            "disturbance_km2": round(max(0.0, net_ndbi) * (calc_area * 0.4), 2),
            "water_expansion_km2": round(max(0.0, net_ndwi) * (calc_area * 0.3), 2),
            "net_ndvi_change": net_ndvi,
            "net_ndwi_change": net_ndwi,
            "net_ndbi_change": net_ndbi,
            "dominant_risk": "Vegetation Loss" if abs(net_ndvi) >= abs(net_ndbi) else "Land Disturbance",
            "risk_level": "High" if abs(net_ndvi) >= 0.10 else "Medium",
            "risk_score": min(100, int(abs(net_ndvi) * 350 + max(0, net_ndbi) * 200)),
            "target_coordinates": {"lat": lat_val, "lng": lng_val},
            "radius_km": radius_val,
            "is_default_location": is_default,
            "metadata": {
                "target_coordinates": {"lat": lat_val, "lng": lng_val},
                "radius_km": radius_val,
                "geometry_area_km2": calc_area,
                "is_real_observation": False,
                "execution_mode": "synthetic_demonstration",
            },
        }

    # Fetch corresponding hotspots
    hotspot_records = demo_data.get_hotspots(module=module if module != "all" else None, limit=100)
    hotspots = [DataPoint(**h) for h in hotspot_records]

    return TemporalAnalysisResponse(
        summary=TemporalSummary(**summary_dict),
        yearly_progression=yearly_progression,
        monthly_breakdown=monthly_breakdown,
        hotspots=hotspots,
        is_live=is_live,
        is_demo=not is_live,
        source=source,
        last_updated=ANALYSIS_DATE,
        methodology=METHODOLOGY,
        limitations=LIMITATIONS,
    )


@router.post("/analysis/aoi", response_model=AOIAnalysisResponse)
async def analyze_aoi(request: AOIAnalysisRequest):
    """
    End-to-End AOI Analysis:
    1. Parse user GeoJSON geometry and calculate geodesic area.
    2. Extract multi-temporal Sentinel-2 spectral bands and indices via Google Earth Engine.
    3. Run Random Forest ML inference on extracted 15-feature vector.
    4. Generate satellite raster tiles clipped to the AOI.
    5. Return comprehensive risk analysis, yearly progression, and feature breakdown.
    """
    geojson_dict = (
        request.geometry.model_dump()
        if hasattr(request.geometry, "model_dump")
        else request.geometry.dict()
    )

    # 1. Parse & validate geometry in GEE
    geom, area_km2, centroid, err = gee_service.geojson_to_ee_geometry(geojson_dict)
    if err:
        raise HTTPException(status_code=400, detail=err)

    is_live = False
    is_demo = bool(request.demo)
    source = "Copernicus Sentinel-2 Level-2A via Google Earth Engine"

    # 2. Extract satellite features via GEE
    if not request.demo and gee_service.is_connected:
        try:
            extraction = gee_service.extract_aoi_ml_features(
                geometry=geom,
                area_km2=area_km2,
                start_year=request.start_year,
                end_year=request.end_year,
                start_month=request.start_month,
                end_month=request.end_month,
            )
            is_live = True
            is_demo = False
        except Exception as e:
            logger.error(f"[AOI] GEE extraction error: {e}")
            raise HTTPException(
                status_code=422 if isinstance(e, ValueError) else 502,
                detail=f"Live Earth Engine feature extraction failed: {str(e)}. Use demo=true for offline demonstration mode."
            )
    else:
        is_live = False
        is_demo = True
        source = "GeoVision Demonstration Engine (Synthetic Calibration Sample)"
        features = {
            "B2_2026": 1050.0, "B3_2026": 1280.0, "B4_2026": 1420.0,
            "B8_2026": 2100.0, "B11_2026": 2050.0, "B12_2026": 1650.0,
            "NDWI_2023": -0.24, "NDWI_2026": -0.19, "NDWI_Change": 0.05,
            "NDBI_2023": 0.01, "NDBI_2026": 0.06, "NDBI_Change": 0.05,
            "NDVI_2024": 0.35, "NDVI_2025": 0.31, "NDVI_2026": 0.27,
        }
        extraction = {
            "features": features,
            "ndvi_2023": 0.40,
            "net_ndvi": -0.13,
            "net_ndwi": 0.05,
            "net_ndbi": 0.05,
            "veg_loss_km2": round(area_km2 * 0.18, 2),
            "disturb_km2": round(area_km2 * 0.12, 2),
            "water_exp_km2": round(area_km2 * 0.06, 2),
            "dominant_driver": "Vegetation Loss / Canopy Decline",
            "yearly_progression": [
                {"year": 2023, "ndvi_mean": 0.40, "ndwi_mean": -0.24, "ndbi_mean": 0.01, "vegetation_health": "Dense Vegetation", "scenes_count": 8},
                {"year": 2024, "ndvi_mean": 0.35, "ndwi_mean": -0.22, "ndbi_mean": 0.03, "vegetation_health": "Moderate Canopy", "scenes_count": 8},
                {"year": 2025, "ndvi_mean": 0.31, "ndwi_mean": -0.20, "ndbi_mean": 0.04, "vegetation_health": "Moderate Canopy", "scenes_count": 8},
                {"year": 2026, "ndvi_mean": 0.27, "ndwi_mean": -0.19, "ndbi_mean": 0.06, "vegetation_health": "Sparse / Disturbed", "scenes_count": 7},
            ],
            "monthly_breakdown": [],
        }

    # 3. Machine Learning & Multi-Hazard Hybrid Inference
    ml_output = ml_service.predict(extraction["features"])
    raw_ml_prob = ml_output.get("probability", 0.0)
    raw_ml_pred = ml_output.get("prediction", 0)

    # Compute composite multi-hazard risk fusing ML inference + Physical Area Footprint + Sentinel-2 Index shifts
    composite_res = calculate_composite_aoi_risk(
        features=extraction["features"],
        area_km2=area_km2,
        veg_loss_km2=extraction.get("veg_loss_km2", 0.0),
        disturb_km2=extraction.get("disturb_km2", 0.0),
        water_exp_km2=extraction.get("water_exp_km2", 0.0),
        ml_probability=raw_ml_prob,
        ml_prediction=raw_ml_pred,
    )

    pred_class = composite_res["prediction"]
    pred_prob = composite_res["probability"]
    risk_score = composite_res["risk_score"]
    risk_lvl = composite_res["risk_level"]
    label_str = composite_res["label"]

    # Feature importances & contributions
    importances_raw = ml_service.get_feature_importance()
    imp_map = {item.get("Feature"): float(item.get("Importance", 0.0)) for item in importances_raw}
    feature_desc_map = {
        "NDWI_Change": "Shift in surface moisture/water index",
        "NDWI_2023": "Baseline water/moisture index (2023)",
        "NDBI_Change": "Expansion of bare soil, paved, or built-up reflectance",
        "NDBI_2023": "Baseline bare soil / built-up index (2023)",
        "NDVI_2024": "First-year follow-up vegetation vigor",
        "NDVI_2026": "Current comparison year vegetation vigor",
        "NDWI_2026": "Current comparison year moisture index",
        "NDVI_2025": "Second-year follow-up vegetation vigor",
        "NDBI_2026": "Current comparison year bare soil index",
        "B2_2026": "Sentinel-2 Blue band reflectance (B2)",
        "B4_2026": "Sentinel-2 Red band reflectance (B4)",
        "B3_2026": "Sentinel-2 Green band reflectance (B3)",
        "B12_2026": "Sentinel-2 Short-wave Infrared band 2 (B12)",
        "B11_2026": "Sentinel-2 Short-wave Infrared band 1 (B11)",
        "B8_2026": "Sentinel-2 Near-Infrared band (B8)",
    }

    top_features = []
    for feat_name, feat_val in sorted(extraction["features"].items(), key=lambda x: imp_map.get(x[0], 0.0), reverse=True):
        top_features.append(
            FeatureContribution(
                feature=feat_name,
                value=round(float(feat_val), 4),
                importance=round(float(imp_map.get(feat_name, 0.0)), 4),
                description=feature_desc_map.get(feat_name, "Spectral feature"),
            )
        )

    ml_methodology = (
        f"Hybrid Multi-Hazard Risk Model: Random Forest ML inference ({ml_output.get('methodology', '200 trees')}) "
        f"coupled with Sentinel-2 multi-spectral disturbance physics (deforestation, quarrying, flood extent)."
    )

    ml_result = AOIMLResult(
        prediction=pred_class,
        probability=pred_prob,
        risk_score=risk_score,
        risk_level=risk_lvl,
        label=label_str,
        top_features=top_features,
        methodology=ml_methodology,
        limitations=ml_output.get("limitations", "Rule-derived pseudo-label targets require field verification."),
    )

    # 4. Generate clipped satellite map tiles
    tile_layers = {}
    if geom is not None and gee_service.is_connected:
        try:
            tile_resp = gee_service.get_map_tile_layers(
                start_year=request.start_year,
                end_year=request.end_year,
                start_month=request.start_month,
                end_month=request.end_month,
                geometry=geom,
            )
            tile_layers = tile_resp.get("layers", {})
        except Exception as e:
            print(f"[AOI] Tile generation skipped: {e}")
            tile_layers = {}

    # 5. Build summary
    summary = TemporalSummary(
        start_year=request.start_year,
        end_year=request.end_year,
        start_month=request.start_month,
        end_month=request.end_month,
        region=request.region_name or "User-Defined AOI",
        total_area_km2=area_km2,
        geometry_area_km2=area_km2,
        raster_pixel_area_km2=extraction.get("raster_pixel_area_km2", area_km2),
        valid_observed_area_km2=extraction.get("valid_observed_area_km2", area_km2),
        area_calculation_method="geodesic_vector_wgs84",
        vegetation_loss_km2=extraction["veg_loss_km2"],
        disturbance_km2=extraction["disturb_km2"],
        water_expansion_km2=extraction["water_exp_km2"],
        net_ndvi_change=extraction["net_ndvi"],
        net_ndwi_change=extraction["net_ndwi"],
        net_ndbi_change=extraction["net_ndbi"],
        dominant_risk=extraction["dominant_driver"],
        risk_level=risk_lvl,
        risk_score=risk_score,
        metadata=extraction.get("metadata"),
    )

    return AOIAnalysisResponse(
        region_name=request.region_name or "User-Defined AOI",
        area_km2=area_km2,
        ml_result=ml_result,
        summary=summary,
        yearly_progression=[YearStat(**y) for y in extraction["yearly_progression"]],
        monthly_breakdown=[MonthStat(**m) for m in extraction["monthly_breakdown"]],
        features_extracted=extraction["features"],
        tile_layers=tile_layers,
        source=source,
        is_live=is_live,
        is_demo=is_demo,
        raster_pixel_area_km2=extraction.get("area_metrics", {}).get("raster_pixel_area_km2") if isinstance(extraction.get("area_metrics"), dict) else None,
        methodology=METHODOLOGY,
        limitations=LIMITATIONS,
    )


@router.post("/analysis/ablation", response_model=AblationStudyResponse)
async def run_ablation_study(request: MultiSensorAnalysisRequest):
    """
    Research Evaluation & Ablation Endpoint:
    Compares Sentinel-2 optical alone, Sentinel-1 SAR alone, and Dual-Sensor Fusion.
    Evaluates cloud resilience, documents ground-truth validation gaps, and provides evidence comparison.
    """
    geojson_dict = (
        request.geometry.model_dump()
        if hasattr(request.geometry, "model_dump")
        else request.geometry.dict()
    )

    geom, area_km2, centroid, err = gee_service.geojson_to_ee_geometry(geojson_dict)
    if err:
        raise HTTPException(status_code=400, detail=err)

    if not request.demo and gee_service.is_connected:
        try:
            ablation_res = gee_service.evaluate_sensor_ablation(
                geometry=geom,
                area_km2=area_km2,
                start_year=request.start_year,
                end_year=request.end_year,
                start_month=request.start_month,
                end_month=request.end_month,
            )
            return AblationStudyResponse(**ablation_res)
        except Exception as ex:
            logger.error(f"[Ablation Live Study Error]: {ex}")
            raise HTTPException(
                status_code=422 if isinstance(ex, ValueError) else 502,
                detail=f"Live sensor ablation study failed: {str(ex)}. Set demo=true for offline demonstration mode.",
            )

    ablation_res = gee_service.evaluate_sensor_ablation(
        geometry=geom,
        area_km2=area_km2,
        start_year=request.start_year,
        end_year=request.end_year,
        start_month=request.start_month,
        end_month=request.end_month,
        demo=True,
    )
    return AblationStudyResponse(**ablation_res)


_CACHED_BENCHMARK_EVAL: Optional[Dict[str, Any]] = None
_USER_REFERENCE_CASES_PATH = Path(__file__).resolve().parent.parent.parent.parent / "data" / "user_reference_cases.json"


def _load_user_reference_cases() -> List[Dict[str, Any]]:
    if _USER_REFERENCE_CASES_PATH.exists():
        try:
            with open(_USER_REFERENCE_CASES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read user reference cases: {e}")
    return []


def _save_user_reference_cases(cases: List[Dict[str, Any]]) -> None:
    try:
        _USER_REFERENCE_CASES_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_USER_REFERENCE_CASES_PATH, "w", encoding="utf-8") as f:
            json.dump(cases, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to save user reference cases: {e}")


@router.get("/analysis/validation-benchmark", response_model=ValidationBenchmarkResponse)
def get_validation_benchmark(
    mode: str = Query(default="cached_empirical", description="Evaluation mode: cached_empirical, live, or simulation"),
    use_live_gee: Optional[bool] = Query(default=None, description="Legacy flag: if True, maps to mode='live'"),
):
    """
    Validation Benchmark Endpoint (Synchronous threadpool execution):
    Provides scientific evaluation comparing:
      A. Empirical Benchmark (real GEE observations under 'cached_empirical' or 'live' mode)
      B. Simulation Fixture Benchmark (controlled synthetic noise test fixture, explicitly labeled as simulated)
    Includes Wilson score 95% confidence intervals and empirical cloud-resilience measurements.
    """
    global _CACHED_BENCHMARK_EVAL
    from pathlib import Path
    from fastapi import HTTPException
    from ml.real_observation_benchmark import RealObservationBenchmarkEngine, EvaluationMode

    target_mode = mode.lower()
    if use_live_gee is True and target_mode == "cached_empirical":
        target_mode = "live"

    try:
        eval_mode = EvaluationMode(target_mode)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid evaluation mode '{mode}'. Must be one of: cached_empirical, live, simulation.",
        )

    # Fast in-memory cache for cached_empirical mode
    if eval_mode == EvaluationMode.CACHED_EMPIRICAL and _CACHED_BENCHMARK_EVAL is not None:
        return ValidationBenchmarkResponse(**_CACHED_BENCHMARK_EVAL)

    if eval_mode == EvaluationMode.LIVE and (gee_service is None or not getattr(gee_service, "is_connected", False)):
        raise HTTPException(
            status_code=503,
            detail="Earth Engine service is not connected for live evaluation.",
        )

    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    dataset_path = root_dir / "data" / "real_observation_validation_dataset.json"
    artifacts_dir = root_dir / "data" / "gee_observation_artifacts"
    engine = RealObservationBenchmarkEngine(dataset_path, artifacts_dir=artifacts_dir)

    benchmark_data = engine.run_comprehensive_evaluation(
        mode=eval_mode,
        gee_service=gee_service if (gee_service and gee_service.is_connected) else None,
    )

    if eval_mode == EvaluationMode.CACHED_EMPIRICAL:
        _CACHED_BENCHMARK_EVAL = benchmark_data

    return ValidationBenchmarkResponse(**benchmark_data)


@router.get("/analysis/landsat-reference", response_model=LandsatReferenceAnalysisResponse)
async def get_landsat_reference(
    baseline_start: str = Query(default="2023-01-01", description="Baseline start date (YYYY-MM-DD)"),
    baseline_end: str = Query(default="2023-04-30", description="Baseline end date (YYYY-MM-DD)"),
    comparison_start: str = Query(default="2024-01-01", description="Comparison start date (YYYY-MM-DD)"),
    comparison_end: str = Query(default="2024-04-30", description="Comparison end date (YYYY-MM-DD)"),
    module: str = Query(default="deforestation", description="deforestation, mining, water, flood"),
    lat: float = Query(default=18.5204, ge=-90.0, le=90.0, description="Center latitude"),
    lng: float = Query(default=73.8567, ge=-180.0, le=180.0, description="Center longitude"),
    buffer_meters: int = Query(default=1500, ge=100, le=50000, description="AOI radius buffer in meters"),
    aoi_name: Optional[str] = Query(default=None, description="AOI site name"),
):
    """
    USGS Landsat Collection 2 Level-2 Surface Reflectance Reference Validation:
    Retrieves baseline and comparison Landsat 8/9 composites with official QA masking
    (dilated cloud, cirrus, cloud, cloud shadow) and scale factors (0.0000275 * raw - 0.2).
    Generates reference signal metrics, true-color tiles, and differential change layers.
    """
    if not gee_service.is_connected:
        raise HTTPException(
            status_code=503,
            detail="Google Earth Engine service is not connected. Authenticate to run Landsat reference analysis.",
        )

    try:
        import ee
        aoi_geom = ee.Geometry.Point([lng, lat]).buffer(buffer_meters)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid AOI geometry parameters: {ex}")

    try:
        res = gee_service.analyze_landsat_reference(
            geometry=aoi_geom,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
            comparison_start=comparison_start,
            comparison_end=comparison_end,
            module=module,
            aoi_name=aoi_name or f"AOI ({lat:.4f}°N, {lng:.4f}°E, r={buffer_meters}m)",
        )
        return LandsatReferenceAnalysisResponse(**res)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as ex:
        logger.error(f"Error in Landsat reference analysis: {ex}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Landsat reference analysis failed: {str(ex)}")


@router.get("/analysis/landsat-comparison", response_model=CrossSensorComparisonResponse)
async def get_landsat_sentinel_cross_comparison(
    baseline_start: str = Query(default="2023-01-01", description="Baseline start date (YYYY-MM-DD)"),
    baseline_end: str = Query(default="2023-04-30", description="Baseline end date (YYYY-MM-DD)"),
    comparison_start: str = Query(default="2024-01-01", description="Comparison start date (YYYY-MM-DD)"),
    comparison_end: str = Query(default="2024-04-30", description="Comparison end date (YYYY-MM-DD)"),
    module: str = Query(default="deforestation", description="deforestation, mining, water, flood"),
    lat: float = Query(default=18.5204, ge=-90.0, le=90.0, description="Center latitude"),
    lng: float = Query(default=73.8567, ge=-180.0, le=180.0, description="Center longitude"),
    buffer_meters: int = Query(default=1500, ge=100, le=50000, description="AOI radius buffer in meters"),
    aoi_name: Optional[str] = Query(default=None, description="AOI site name"),
):
    """
    Cross-Sensor Comparison: Independent USGS Landsat 8/9 (30m) Reference vs Copernicus Sentinel-2 (10m).
    Evaluates sensor agreement, resolution mismatch effects, and documented caveats.
    """
    if not gee_service.is_connected:
        raise HTTPException(
            status_code=503,
            detail="Google Earth Engine service is not connected. Authenticate to run cross-sensor validation.",
        )

    try:
        import ee
        aoi_geom = ee.Geometry.Point([lng, lat]).buffer(buffer_meters)
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Invalid AOI geometry parameters: {ex}")

    try:
        res = gee_service.cross_compare_sentinel_landsat(
            geometry=aoi_geom,
            baseline_start=baseline_start,
            baseline_end=baseline_end,
            comparison_start=comparison_start,
            comparison_end=comparison_end,
            module=module,
            aoi_name=aoi_name or f"AOI ({lat:.4f}°N, {lng:.4f}°E, r={buffer_meters}m)",
        )
        return CrossSensorComparisonResponse(**res)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as ex:
        logger.error(f"Error in Landsat-Sentinel cross-sensor comparison: {ex}", exc_info=True)
        raise HTTPException(status_code=502, detail=f"Cross-sensor comparison failed: {str(ex)}")


@router.get("/analysis/bhuvan-assessment", response_model=BhuvanAssessmentResponse, deprecated=True)
def get_bhuvan_assessment():
    """
    [DEPRECATED] Legacy Bhuvan/NRSC (ISRO) assessment endpoint retained for backward compatibility.
    GeoVision AI utilizes USGS Landsat Collection 2 Level-2 Surface Reflectance as the sole
    orbital reference validation source.
    """
    return BhuvanAssessmentResponse(
        platform_name="Bhuvan / Bhoonidhi Geospatial Portal",
        agency="National Remote Sensing Centre (NRSC) / Indian Space Research Organisation (ISRO)",
        official_portal_url="https://bhuvan.nrsc.gov.in",
        api_feasibility_verdict="RESTRICTED_MANUAL_WORKFLOW_ONLY",
        summary=(
            "Programmatic, automated REST tile-scraping or unauthenticated on-demand temporal diffing "
            "against NRSC Bhuvan is strictly restricted by official terms of service and security policy. "
            "GeoVision AI implements a fully permitted, compliant manual evidence-import workflow allowing "
            "analysts to import verified Bhuvan/Bhoonidhi reference cases with complete attribution and provenance."
        ),
        terms_of_service_analysis=[
            "Section 4 of NRSC Terms of Service strictly prohibits automated scraping, crawlers, unauthorized tile caching, or token reverse-engineering.",
            "Bhuvan OGC WMS/WMTS services provide standardized static thematic overlays (e.g., LULC 1:50,000, Flood Hazard Atlases), but do NOT expose open APIs for arbitrary multispectral raster difference calculations.",
            "High-resolution sensors (Resourcesat-2A LISS-IV 5.8m, Cartosat-2/3 sub-meter) require authenticated user credentials via Bhoonidhi, subject to End-User Licensing Agreements (EULA) that prohibit automated redistribution.",
            "No public REST API exists for bearer-token programmatic satellite pipeline querying without specific government clearances.",
        ],
        technical_limitations=[
            "Lack of open, machine-readable API for automated polygon-level temporal change queries.",
            "Resourcesat and Cartosat pass frequencies are lower than Sentinel-1/2 5-day constellations, limiting dense multi-temporal dry-season composites.",
            "Scraping or harvesting Bhuvan Web Map views creates brittle dependencies that violate cybersecurity guidelines.",
        ],
        permitted_integration_workflow=(
            "Evaluators and officers examine authorized satellite imagery within official Bhuvan/Bhoonidhi portals, "
            "export the verified observation or inspection sheet, and import the reference case into GeoVision AI "
            "with Scene ID, acquisition dates, coordinates, ground-truth label, and attribution."
        ),
        recommendations=[
            "Maintain strict separation between imported Bhuvan/NRSC reference cases and automated live Sentinel-1/2 GEE pipelines.",
            "Use Bhuvan as authoritative third-party ground-truth corroboration for field-verification dossiers.",
            "Never invent simulated Bhuvan endpoints or bypass NRSC authentication mechanisms.",
        ],
    )


@router.get("/analysis/reference-cases", response_model=List[ReferenceCaseItem])
def get_reference_cases(
    module: Optional[str] = Query(default=None, description="Filter by module: flood, deforestation, mining"),
    inclusion_status: Optional[str] = Query(default=None, description="Filter: included, pending, excluded"),
):
    """
    Retrieve all verified reference cases, including curated real-observation samples
    and any user-imported reference cases.
    """
    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    dataset_path = root_dir / "data" / "real_observation_validation_dataset.json"
    artifacts_dir = root_dir / "data" / "gee_observation_artifacts"

    cases: List[ReferenceCaseItem] = []

    # 1. Curated real observation samples
    if dataset_path.exists():
        try:
            with open(dataset_path, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
            for s in raw_data.get("samples", []):
                mod = s.get("module")
                inc = s.get("inclusion_status", "included")
                if module and mod != module:
                    continue
                if inclusion_status and inc != inclusion_status:
                    continue

                sample_id = s.get("sample_id", "")
                art_file = artifacts_dir / f"{sample_id}.json"
                pred_data = None
                if art_file.exists():
                    try:
                        with open(art_file, "r", encoding="utf-8") as af:
                            art_json = json.load(af)
                            pred_data = art_json.get("independent_sensor_predictions")
                    except Exception:
                        pass

                obs = s.get("observation_period", {})
                start_yr = obs.get("start_year", 2023)
                end_yr = obs.get("end_year", 2024)
                start_mo = obs.get("start_month", 1)
                end_mo = obs.get("end_month", 4)

                cases.append(ReferenceCaseItem(
                    sample_id=sample_id,
                    event_id=s.get("event_id", ""),
                    module=mod,
                    aoi_name=s.get("aoi_name", ""),
                    coordinates=s.get("coordinates", {}),
                    reference_date=s.get("reference_date", ""),
                    observation_period=obs,
                    reference_source=s.get("reference_source", ""),
                    evidence_identifier=s.get("evidence_identifier", ""),
                    evidence_url=s.get("evidence_url", ""),
                    reference_label=s.get("reference_label", "pending"),
                    interpretation_method=s.get("reference_interpretation_method", ""),
                    reviewer_notes=s.get("reviewer_notes", ""),
                    evidence_quality_rating=s.get("evidence_quality_rating", "provisional"),
                    inclusion_status=inc,
                    reference_platform="Copernicus Sentinel via GEE",
                    attribution="European Space Agency / Copernicus / GEE",
                    earlier_date=f"{start_yr}-{start_mo:02d}-01",
                    later_date=f"{end_yr}-{end_mo:02d}-01",
                    geovision_prediction=pred_data,
                    imagery_evidence={
                        "baseline_period": f"{start_yr} Jan–Apr Composite",
                        "evaluation_period": f"{end_yr} Jan–Apr Composite",
                        "optical_sensor": "Sentinel-2 MSI Level-2A",
                        "radar_sensor": "Sentinel-1 C-Band SAR (IW)",
                    },
                ))
        except Exception as e:
            logger.error(f"Error loading reference dataset samples: {e}")

    # 2. User-imported reference cases
    user_cases = _load_user_reference_cases()
    for uc in user_cases:
        mod = uc.get("module")
        inc = uc.get("inclusion_status", "included")
        if module and mod != module:
            continue
        if inclusion_status and inc != inclusion_status:
            continue
        try:
            cases.append(ReferenceCaseItem(**uc))
        except Exception as e:
            logger.warning(f"Failed to parse user reference case: {e}")

    return cases


@router.post("/analysis/reference-cases", response_model=ReferenceCaseItem)
def create_user_reference_case(payload: ReferenceCaseCreate):
    """
    Import a manual reference case from USGS Landsat Reference Validation, field GPS survey, or gauge records.
    Persists evidence independently from automated Sentinel-1/2 pipelines.
    """
    import uuid
    sample_id = f"REF-USER-{uuid.uuid4().hex[:6].upper()}"
    event_id = f"EVT-{payload.module.upper()}-{uuid.uuid4().hex[:4].upper()}"

    item_dict = {
        "sample_id": sample_id,
        "event_id": event_id,
        "module": payload.module,
        "aoi_name": payload.aoi_name,
        "coordinates": {
            "lat": payload.lat,
            "lng": payload.lng,
            "buffer_meters": payload.buffer_meters,
        },
        "reference_date": payload.later_date,
        "observation_period": {
            "start_year": int(payload.earlier_date.split("-")[0]) if "-" in payload.earlier_date else 2023,
            "end_year": int(payload.later_date.split("-")[0]) if "-" in payload.later_date else 2024,
            "start_month": int(payload.earlier_date.split("-")[1]) if "-" in payload.earlier_date else 1,
            "end_month": int(payload.later_date.split("-")[1]) if "-" in payload.later_date else 4,
        },
        "reference_source": f"{payload.reference_platform} — {payload.sensor_product}",
        "evidence_identifier": payload.evidence_identifier or f"DOC-{sample_id}",
        "evidence_url": payload.evidence_url or "",
        "reference_label": payload.reference_label,
        "interpretation_method": "Visual manual interpretation by authorized reviewer against multi-date reference scenes.",
        "reviewer_notes": f"Reviewer: {payload.reviewer}. Rationale: {payload.label_rationale}. Notes: {payload.evidence_limitations or 'None'}",
        "evidence_quality_rating": payload.confidence_level,
        "inclusion_status": payload.field_verification_status,
        "reference_platform": payload.reference_platform,
        "attribution": payload.attribution,
        "earlier_date": payload.earlier_date,
        "later_date": payload.later_date,
        "geovision_prediction": None,
        "imagery_evidence": {
            "baseline_date": payload.earlier_date,
            "evaluation_date": payload.later_date,
            "sensor": payload.sensor_product,
            "image_url": payload.reference_image_url or "",
        },
    }

    current = _load_user_reference_cases()
    current.append(item_dict)
    _save_user_reference_cases(current)

    return ReferenceCaseItem(**item_dict)


