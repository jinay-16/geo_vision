"""
GeoVision AI — Pydantic Response Schemas
Consistent data structures for all API responses.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict


# ── Common structures ──────────────────────────────────────────────────


class DataPoint(BaseModel):
    """A single monitored location with risk assessment."""
    id: str
    latitude: float
    longitude: float
    region: str
    date: str
    module: str                                     # deforestation | mining | flood
    current_value: float
    previous_value: float
    change_value: float
    risk_score: int = Field(ge=0, le=100)
    risk_level: str                                 # Low | Medium | High
    confidence: float = Field(ge=0.0, le=1.0)
    status: str
    requires_field_verification: bool = True
    provenance: Optional[str] = None
    is_demo: Optional[bool] = None


class RiskDistribution(BaseModel):
    low: int
    medium: int
    high: int


class TrendPoint(BaseModel):
    year: int
    value: float
    label: str = ""


# ── Health ─────────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    mode: str
    version: str
    model_loaded: bool
    dataset_loaded: bool
    gee_available: bool


class GEEStatusResponse(BaseModel):
    status: str
    message: str
    project: Optional[str] = None
    timestamp: str
    is_live: bool


# ── Overview ───────────────────────────────────────────────────────────


class OverviewResponse(BaseModel):
    total_monitored_regions: int
    total_points: int
    high_risk_zones: int
    vegetation_loss_areas: int
    land_disturbance_areas: int
    flood_risk_areas: int
    last_analysis_date: str
    risk_distribution: RiskDistribution
    module_stats: Optional[dict] = None
    module_changes: Optional[dict] = None
    recent_hotspots: List[DataPoint]
    source: str
    is_demo: bool
    is_live: bool = False
    methodology: str
    limitations: str


# ── Module responses ───────────────────────────────────────────────────


class ModuleSummary(BaseModel):
    module: str
    description: str
    total_points: int
    monitored_area_km2: float
    affected_area_km2: float
    high_risk_zones: int
    medium_risk_zones: int
    low_risk_zones: int
    avg_change: float
    avg_risk_score: float
    risk_distribution: RiskDistribution


class ModuleResponse(BaseModel):
    summary: ModuleSummary
    hotspots: List[DataPoint]
    trends: List[TrendPoint]
    risk_distribution: RiskDistribution
    source: str
    is_demo: bool
    is_live: bool = False
    last_updated: str
    methodology: str
    limitations: str


# ── Hotspots ───────────────────────────────────────────────────────────


class HotspotsResponse(BaseModel):
    hotspots: List[DataPoint]
    total: int
    source: str
    is_demo: bool


# ── Trends ─────────────────────────────────────────────────────────────


class TrendsResponse(BaseModel):
    deforestation: List[TrendPoint]
    mining: List[TrendPoint]
    flood: List[TrendPoint]
    source: str
    is_demo: bool


# ── Prediction ─────────────────────────────────────────────────────────


class PredictionRequest(BaseModel):
    features: dict


class PredictionResponse(BaseModel):
    prediction: int
    probability: float
    risk_score: int
    risk_level: str
    model_version: str
    feature_names: List[str]
    is_demo: bool
    methodology: str
    limitations: str


# ── Reports ────────────────────────────────────────────────────────────


class ReportSummaryResponse(BaseModel):
    title: str
    generated_at: str
    pilot_area: str
    analysis_period: str
    overview: dict
    deforestation: dict
    mining: dict
    flood: dict
    source: str
    is_demo: bool
    disclaimer: str


# ── Temporal Analysis (Year-to-Year and Month-Wise) ───────────────────


class YearStat(BaseModel):
    year: int
    ndvi_mean: Optional[float] = None
    ndwi_mean: Optional[float] = None
    ndbi_mean: Optional[float] = None
    vegetation_health: str
    scenes_count: int = 0
    observation_dates: Optional[List[str]] = None
    is_observed: bool = True


class MonthStat(BaseModel):
    month_num: int
    month_name: str
    start_year_val: Optional[float] = None
    end_year_val: Optional[float] = None
    change_val: Optional[float] = None
    indicator_type: str
    is_observed: bool = True


class TemporalSummary(BaseModel):
    start_year: int
    end_year: int
    start_month: int
    end_month: int
    region: str
    total_area_km2: float
    vegetation_loss_km2: float
    disturbance_km2: float
    water_expansion_km2: float
    net_ndvi_change: float
    net_ndwi_change: float
    net_ndbi_change: float
    dominant_risk: str
    risk_level: str
    risk_score: int
    geometry_area_km2: Optional[float] = None
    raster_pixel_area_km2: Optional[float] = None
    valid_observed_area_km2: Optional[float] = None
    area_calculation_method: Optional[str] = None
    target_coordinates: Optional[Dict[str, float]] = None
    radius_km: Optional[float] = None
    is_default_location: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


class TemporalAnalysisResponse(BaseModel):
    summary: TemporalSummary
    yearly_progression: List[YearStat]
    monthly_breakdown: List[MonthStat]
    hotspots: List[DataPoint]
    is_live: bool
    is_demo: bool = False
    source: str
    last_updated: str
    methodology: str
    limitations: str


# ── AOI Analysis (User-Defined Custom Area) ──────────────────────────


class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: List[Any]
    radius_meters: Optional[float] = None
    radius_km: Optional[float] = None
    center: Optional[List[float]] = None


class AOIAnalysisRequest(BaseModel):
    geometry: GeoJSONGeometry
    start_year: int = Field(default=2023, ge=2018, le=2026)
    end_year: int = Field(default=2026, ge=2018, le=2026)
    start_month: int = Field(default=1, ge=1, le=12)
    end_month: int = Field(default=4, ge=1, le=12)
    region_name: Optional[str] = "User-Defined AOI"
    demo: bool = False


class FeatureContribution(BaseModel):
    feature: str
    value: float
    importance: float
    description: str


class AOIMLResult(BaseModel):
    prediction: int
    probability: float
    risk_score: int
    risk_level: str
    label: str
    top_features: List[FeatureContribution]
    methodology: str
    limitations: str


class AOIAnalysisResponse(BaseModel):
    region_name: str
    area_km2: float
    ml_result: AOIMLResult
    summary: TemporalSummary
    yearly_progression: List[YearStat]
    monthly_breakdown: List[MonthStat]
    features_extracted: Dict[str, float]
    tile_layers: Dict[str, str]
    source: str
    is_live: bool
    is_demo: bool = False
    raster_pixel_area_km2: Optional[float] = None
    methodology: str
    limitations: str


# ── Dual-Sensor Multi-Temporal Fusion (Sentinel-1 SAR + Sentinel-2) ────


class MultiSensorAnalysisRequest(BaseModel):
    geometry: GeoJSONGeometry
    start_year: int = Field(default=2023, ge=2016, le=2026)
    end_year: int = Field(default=2026, ge=2016, le=2026)
    start_month: int = Field(default=1, ge=1, le=12)
    end_month: int = Field(default=4, ge=1, le=12)
    region_name: Optional[str] = "User Selected AOI"
    orbit_pass: Optional[str] = "DESCENDING"
    demo: bool = False


class SensorStatus(BaseModel):
    s1_available: bool
    s2_available: bool
    fusion_status: str
    fusion_method: str
    orbit_pass: Optional[str] = None
    s1_scene_count_base: int = 0
    s1_scene_count_eval: int = 0
    s2_scene_count_base: int = 0
    s2_scene_count_eval: int = 0
    s1_dates_base: List[str] = []
    s1_dates_eval: List[str] = []
    s2_dates_base: List[str] = []
    s2_dates_eval: List[str] = []
    s1_error: Optional[str] = None
    s2_error: Optional[str] = None


class MultiSensorAnalysisResponse(BaseModel):
    module: str
    region_name: str
    geometry_area_km2: float
    raster_pixel_area_km2: Optional[float] = None
    valid_observed_area_km2: float
    coverage_percentage: float
    base_year: int
    eval_year: int
    start_month: int
    end_month: int
    dominant_driver: str
    affected_area_km2: float
    risk_score: int
    risk_level: str
    sensor_status: SensorStatus
    s2_metrics: Optional[Dict[str, Any]] = None
    s1_metrics: Optional[Dict[str, Any]] = None
    fusion_metrics: Optional[Dict[str, Any]] = None
    tile_layers: Dict[str, str] = {}
    source: str
    is_live: bool
    is_demo: bool = False
    reduction_scale_meters: Optional[int] = 50
    methodology: str
    limitations: str


class AblationStudyResponse(BaseModel):
    aoi_area_km2: float
    comparison_period: str
    ablation_configurations: List[Dict[str, Any]]
    fusion_metrics: Dict[str, Any]
    cloud_resilience_gain: Dict[str, Any]
    validation_gap_statement: str


class ValidationBenchmarkResponse(BaseModel):
    title: str
    pipeline_version: str
    selected_mode: Optional[str] = "cached_empirical"
    benchmarks: Dict[str, Any]
    scientific_qualification: str


class ReferenceCaseItem(BaseModel):
    sample_id: str
    event_id: str
    module: str
    aoi_name: str
    coordinates: Dict[str, Any]
    reference_date: str
    observation_period: Dict[str, Any]
    reference_source: str
    evidence_identifier: str
    evidence_url: Optional[str] = ""
    reference_label: str
    interpretation_method: Optional[str] = ""
    reviewer_notes: Optional[str] = ""
    evidence_quality_rating: str = "provisional"
    inclusion_status: str = "included"
    reference_platform: str = "Copernicus / GEE"
    attribution: Optional[str] = None
    earlier_date: Optional[str] = None
    later_date: Optional[str] = None
    geovision_prediction: Optional[Dict[str, Any]] = None
    imagery_evidence: Optional[Dict[str, Any]] = None


class ReferenceCaseCreate(BaseModel):
    aoi_name: str
    module: str
    lat: float
    lng: float
    buffer_meters: int = 500
    earlier_date: str
    later_date: str
    reference_platform: str = "USGS Landsat Collection 2 Level-2"
    sensor_product: Optional[str] = "Landsat 8/9 OLI-2 / TIRS-2 (30m)"
    evidence_identifier: Optional[str] = ""
    evidence_url: Optional[str] = ""
    reference_label: str = "change_observed"  # "change_observed" | "no_change_observed" | "uncertain" | "insufficient_imagery"
    label_rationale: str
    reviewer: str = "Field Analyst / Remote Sensing Reviewer"
    confidence_level: str = "corroborated"  # "authoritative" | "corroborated" | "provisional"
    evidence_limitations: Optional[str] = ""
    field_verification_status: str = "pending"  # "included" | "pending" | "excluded"
    attribution: str = "USGS / NASA Landsat Collection 2 via Google Earth Engine"
    reference_image_url: Optional[str] = ""


class LandsatObservationMetadata(BaseModel):
    sensor: str
    spatial_resolution_meters: float = 30.0
    start_date: str
    end_date: str
    scenes_count: int
    acquisition_dates: List[str]
    qa_masking_applied: List[str]
    surface_reflectance_scale_factor: str
    collections_used: List[str]


class LandsatReferenceAnalysisResponse(BaseModel):
    status: str
    is_live: bool
    module: str
    aoi_name: Optional[str] = None
    coordinates: Dict[str, Any]
    baseline_metadata: LandsatObservationMetadata
    comparison_metadata: LandsatObservationMetadata
    indicator_name: str
    reference_signal_label: str  # "change_observed" | "no_change_observed" | "uncertain" | "insufficient_imagery"
    signal_summary: Dict[str, Any]
    tile_layers: Dict[str, str]
    disclaimer: str
    scientific_qualification: str


class CrossSensorComparisonResponse(BaseModel):
    status: str
    is_live: bool
    module: str
    aoi: Dict[str, Any]
    time_windows: Dict[str, Any]
    landsat_reference: Dict[str, Any]
    sentinel_geovision: Dict[str, Any]
    sensor_agreement_status: str  # "AGREE_CHANGE" | "AGREE_NO_CHANGE" | "DISCORDANT_SENSOR_SIGNAL" | "INCONCLUSIVE"
    resolution_mismatch_analysis: Dict[str, Any]
    independent_sensor_comparison_statement: str
    disclaimer: str


class BhuvanAssessmentResponse(BaseModel):
    platform_name: str
    agency: str
    official_portal_url: str
    api_feasibility_verdict: str  # e.g., "RESTRICTED_MANUAL_WORKFLOW_ONLY"
    summary: str
    terms_of_service_analysis: List[str]
    technical_limitations: List[str]
    permitted_integration_workflow: str
    recommendations: List[str]


# ── Satellite Comparison Models ───────────────────────────────────────


class SatelliteComparisonRequest(BaseModel):
    """Payload for comparing two temporal periods over an AOI."""
    geometry: Dict[str, Any]
    region_name: Optional[str] = None
    before_start_date: str = Field(description="Before-period start date (YYYY-MM-DD)")
    before_end_date: str = Field(description="Before-period end date (YYYY-MM-DD)")
    after_start_date: str = Field(description="After-period start date (YYYY-MM-DD)")
    after_end_date: str = Field(description="After-period end date (YYYY-MM-DD)")
    cloud_threshold: int = Field(default=60, ge=5, le=100, description="Max scene cloudy percentage")
    demo: Optional[bool] = Field(default=False, description="Force demonstration fallback")


class PeriodMetadata(BaseModel):
    requested_interval: str
    effective_interval: Optional[str] = None
    scene_count: int
    usable_scenes: int
    acquisition_dates: List[str] = []
    cloud_filter_percent: int
    masking_method: str


class ComparisonTileLayers(BaseModel):
    before_rgb: str = ""
    after_rgb: str = ""
    before_cir: Optional[str] = ""
    after_cir: Optional[str] = ""
    delta_ndvi: Optional[str] = ""
    delta_ndwi: Optional[str] = ""


class ComparisonIndexMetrics(BaseModel):
    before_mean: float
    after_mean: float
    delta_mean: float
    decline_area_km2: Optional[float] = None
    growth_area_km2: Optional[float] = None
    expansion_area_km2: Optional[float] = None
    water_like_before_km2: Optional[float] = None
    water_like_after_km2: Optional[float] = None
    threshold_decline: Optional[float] = None
    threshold_recovery: Optional[float] = None
    threshold_expansion: Optional[float] = None
    threshold_water: Optional[float] = None
    indicator: str


class SatelliteComparisonResponse(BaseModel):
    status: str  # "success" | "unavailable_imagery" | "error"
    is_live: bool
    is_demo: bool
    source: str
    region_name: str
    geometry_area_km2: float
    common_valid_area_km2: Optional[float] = None
    before_valid_area_km2: Optional[float] = None
    after_valid_area_km2: Optional[float] = None
    coverage_percentage: Optional[float] = None
    calculation_scale_meters: Optional[int] = None
    message: Optional[str] = None
    suggestion: Optional[str] = None
    failed_period: Optional[str] = None
    before_metadata: PeriodMetadata
    after_metadata: PeriodMetadata
    imagery_layers: Optional[ComparisonTileLayers] = None
    ndvi_metrics: Optional[ComparisonIndexMetrics] = None
    ndwi_metrics: Optional[ComparisonIndexMetrics] = None
    threshold_areas: Optional[Dict[str, float]] = None
    methodology: Optional[str] = None
    limitations: Optional[str] = None
    warnings: List[str] = []





