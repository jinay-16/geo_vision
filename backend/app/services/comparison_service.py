"""
GeoVision AI — Satellite Comparison Service
Calculates verified environmental change metrics and generates interactive
before/after satellite imagery composites directly from Google Earth Engine.

Core Data Source:
  - COPERNICUS/S2_SR_HARMONIZED (Sentinel-2 Surface Reflectance Harmonized)
  - GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED (Cloud Score+ QA masking)

Scientific Controls:
  - Common-valid-pixel policy: differences are evaluated strictly where both
    periods have valid, unmasked observations.
  - Zero-denominator protection on spectral indices (NDVI, NDWI).
  - Explicit physical area estimation using Earth Engine pixelArea().
  - Transparent data provenance and cloud coverage disclosure.
  - Honest status: never claims live when imagery is unavailable or offline.
"""

from datetime import datetime, date, timedelta, timezone
import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import ee
from .gee_service import (
    gee_service,
    S2_COLLECTION_ID,
    CS_COLLECTION_ID,
    CLEAR_THRESHOLD,
    CLOUD_FILTER_PERCENT,
)

logger = logging.getLogger("geovision.comparison")

# Scientific Thresholds for Environmental Change Indicators
# All thresholds represent heuristic indicators requiring contextual/field corroboration
NDVI_DECLINE_THRESHOLD = -0.15   # ΔNDVI <= -0.15 indicates substantial vegetation loss / stress
NDVI_RECOVERY_THRESHOLD = 0.15   # ΔNDVI >= +0.15 indicates substantial vegetation regrowth / greening
NDWI_EXPANSION_THRESHOLD = 0.15  # ΔNDWI >= +0.15 indicates surface water expansion / flood inundation
NDWI_WATER_BODY_THRESHOLD = 0.0  # NDWI >= 0.0 defines water-like surface reflectance (McFeeters)

METHODOLOGY_NOTE = (
    "Before/After satellite comparison using Copernicus Sentinel-2 Level-2A Surface Reflectance "
    "(COPERNICUS/S2_SR_HARMONIZED). Pixel-level cloud/haze screening is performed via Cloud Score+ "
    "(GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED) with clear-confidence threshold cs_cdf >= 0.60. "
    "Environmental indices: NDVI = (B8 - B4) / (B8 + B4); NDWI = (B3 - B8) / (B3 + B8). "
    "Change statistics are computed strictly on the intersection of valid, unmasked pixels observed "
    "in both temporal periods (common-valid-pixel policy). Surface areas are calculated in real square "
    "kilometers using geodesic pixelArea() integration."
)

LIMITATIONS_NOTE = (
    "Spectral index shifts indicate surface optical reflectance variations, not definitive legal or "
    "operational proof of deforestation, mining, or flood damage. Vegetation index decreases can stem "
    "from seasonal crop harvesting, agricultural phenology, drought, or cloud shadows. Water index increases "
    "can reflect seasonal reservoir management, irrigation ponds, or soil moisture surges. All flagged "
    "areas are screening indicators requiring domain review and ground-truth verification."
)


def advance_date_inclusive(date_str: str) -> str:
    """
    Earth Engine's filterDate(start, end) treats the end date as exclusive.
    To ensure the user's selected end date is fully included in the query window,
    advance the end date by exactly one calendar day.
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d").date()
    return (dt + timedelta(days=1)).strftime("%Y-%m-%d")


def validate_date_intervals(
    before_start: str,
    before_end: str,
    after_start: str,
    after_end: str,
) -> Tuple[bool, Optional[str]]:
    """
    Validate chronological order and logical consistency of comparison date ranges.
    Returns: (is_valid: bool, error_message: Optional[str])
    """
    try:
        b_start = datetime.strptime(before_start, "%Y-%m-%d").date()
        b_end = datetime.strptime(before_end, "%Y-%m-%d").date()
        a_start = datetime.strptime(after_start, "%Y-%m-%d").date()
        a_end = datetime.strptime(after_end, "%Y-%m-%d").date()
    except ValueError as e:
        return False, f"Invalid date format (must be YYYY-MM-DD): {e}"

    today = date.today()
    if b_start > today or b_end > today or a_start > today or a_end > today:
        return False, "Comparison dates cannot be in the future."

    if b_start >= b_end:
        return False, f"Before-period start date ({before_start}) must be strictly earlier than end date ({before_end})."

    if a_start >= a_end:
        return False, f"After-period start date ({after_start}) must be strictly earlier than end date ({after_end})."

    if b_start >= a_start:
        return False, (
            f"Before-period start date ({before_start}) must precede the after-period start date ({after_start}) "
            "for chronological comparison."
        )

    # Prevent excessively wide date windows (e.g. > 24 months per window) that cause GEE timeouts
    max_days = 730
    if (b_end - b_start).days > max_days or (a_end - a_start).days > max_days:
        return False, f"Individual observation periods cannot exceed 24 months ({max_days} days) to prevent server timeouts."

    return True, None


class SatelliteComparisonService:
    """Manages multi-temporal satellite comparison, tile generation, and metrics."""

    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def get_period_composite(
        self,
        geometry: ee.Geometry,
        start_date: str,
        end_date: str,
        cloud_threshold: int = CLOUD_FILTER_PERCENT,
    ) -> Tuple[ee.Image, int, List[str], str]:
        """
        Query Sentinel-2 Level-2A imagery, apply Cloud Score+ masking, and build
        a median composite clipped to the AOI.

        Returns:
            (composite_image, scene_count, observation_dates, masking_method)
        """
        # Inclusive end date conversion for Earth Engine
        ee_end_date = advance_date_inclusive(end_date)

        # 1. Filter Sentinel-2 collection
        s2_collection = (
            ee.ImageCollection(S2_COLLECTION_ID)
            .filterBounds(geometry)
            .filterDate(start_date, ee_end_date)
            .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", cloud_threshold))
        )

        # 2. Retrieve scene acquisition dates
        try:
            dates = s2_collection.aggregate_array("system:time_start").map(
                lambda t: ee.Date(t).format("YYYY-MM-dd")
            ).getInfo() or []
            # Deduplicate dates
            unique_dates = sorted(list(set(dates)))
            scene_count = len(dates)
        except Exception as ex:
            logger.warning(f"Failed to query scene dates for window {start_date} to {end_date}: {ex}")
            dates = []
            unique_dates = []
            scene_count = 0

        if scene_count == 0:
            return None, 0, [], "none"

        # 3. Apply Cloud Score+ Masking
        masking_method = "Cloud Score+ (cs_cdf >= 0.60)"
        cs_col = ee.ImageCollection(CS_COLLECTION_ID)
        linked = s2_collection.linkCollection(cs_col, ["cs_cdf"])

        def mask_clouds_safe(img):
            has_cs = img.bandNames().contains("cs_cdf")
            # Clear pixels have cs_cdf >= CLEAR_THRESHOLD; if band is missing, mask pixel to 0 to prevent bypass
            mask = ee.Algorithms.If(
                has_cs,
                img.select("cs_cdf").gte(CLEAR_THRESHOLD),
                ee.Image(0),
            )
            return img.updateMask(ee.Image(mask))

        masked_col = linked.map(mask_clouds_safe)
        composite = masked_col.median().clip(geometry)

        return composite, scene_count, unique_dates, masking_method

    def analyze_comparison(
        self,
        geometry: ee.Geometry,
        area_km2: float,
        before_start: str,
        before_end: str,
        after_start: str,
        after_end: str,
        region_name: str = "User-Defined AOI",
        cloud_threshold: int = CLOUD_FILTER_PERCENT,
        demo: bool = False,
    ) -> Dict[str, Any]:
        """
        Run end-to-end satellite comparison:
          - Extract before and after composites from live GEE
          - Apply common-valid-pixel policy
          - Calculate NDVI & NDWI before, after, and delta on common pixels
          - Derive surface area estimates using pixelArea()
          - Generate interactive map tile URLs for Leaflet/MapLibre
        """
        # Ensure Earth Engine is initialized
        if not gee_service.is_connected:
            gee_service.initialize_gee()

        # If offline or demo mode requested, return demo fallback
        if demo or not gee_service.is_connected:
            return self._build_demo_comparison_response(
                region_name=region_name,
                area_km2=area_km2,
                before_start=before_start,
                before_end=before_end,
                after_start=after_start,
                after_end=after_end,
                cloud_threshold=cloud_threshold,
                offline_reason=gee_service._last_message if not gee_service.is_connected else "Demo mode explicitly requested",
            )

        # 1. Retrieve Before Period Composite
        before_comp, before_count, before_dates, before_mask_method = self.get_period_composite(
            geometry=geometry,
            start_date=before_start,
            end_date=before_end,
            cloud_threshold=cloud_threshold,
        )

        if before_count == 0 or before_comp is None:
            return {
                "status": "unavailable_imagery",
                "is_live": False,
                "is_demo": False,
                "region_name": region_name,
                "geometry_area_km2": area_km2,
                "message": (
                    f"No usable Sentinel-2 Level-2A scenes found for the BEFORE period "
                    f"({before_start} to {before_end}) with scene cloud filter < {cloud_threshold}%."
                ),
                "suggestion": "Please widen the before-period date interval or increase the cloud-cover threshold.",
                "failed_period": "before",
                "warnings": [f"Before period: 0 usable scenes in {before_start} to {before_end}"],
                "before_metadata": {
                    "requested_interval": f"{before_start} to {before_end}",
                    "scene_count": 0,
                    "usable_scenes": 0,
                    "acquisition_dates": [],
                    "cloud_filter_percent": cloud_threshold,
                    "masking_method": "none",
                },
                "after_metadata": {
                    "requested_interval": f"{after_start} to {after_end}",
                    "scene_count": 0,
                    "usable_scenes": 0,
                    "acquisition_dates": [],
                    "cloud_filter_percent": cloud_threshold,
                    "masking_method": "none",
                },
            }

        # 2. Retrieve After Period Composite
        after_comp, after_count, after_dates, after_mask_method = self.get_period_composite(
            geometry=geometry,
            start_date=after_start,
            end_date=after_end,
            cloud_threshold=cloud_threshold,
        )

        if after_count == 0 or after_comp is None:
            return {
                "status": "unavailable_imagery",
                "is_live": False,
                "is_demo": False,
                "region_name": region_name,
                "geometry_area_km2": area_km2,
                "message": (
                    f"No usable Sentinel-2 Level-2A scenes found for the AFTER period "
                    f"({after_start} to {after_end}) with scene cloud filter < {cloud_threshold}%."
                ),
                "suggestion": "Please widen the after-period date interval or increase the cloud-cover threshold.",
                "failed_period": "after",
                "warnings": [f"After period: 0 usable scenes in {after_start} to {after_end}"],
                "before_metadata": {
                    "requested_interval": f"{before_start} to {before_end}",
                    "scene_count": before_count,
                    "usable_scenes": len(before_dates),
                    "acquisition_dates": before_dates,
                    "cloud_filter_percent": cloud_threshold,
                    "masking_method": before_mask_method,
                },
                "after_metadata": {
                    "requested_interval": f"{after_start} to {after_end}",
                    "scene_count": 0,
                    "usable_scenes": 0,
                    "acquisition_dates": [],
                    "cloud_filter_percent": cloud_threshold,
                    "masking_method": "none",
                },
            }

        # 3. Compute Spectral Indices for Each Period
        # Normalized Difference handles zero denominators automatically by masking
        ndvi_before = before_comp.normalizedDifference(["B8", "B4"]).rename("ndvi_before")
        ndvi_after = after_comp.normalizedDifference(["B8", "B4"]).rename("ndvi_after")

        ndwi_before = before_comp.normalizedDifference(["B3", "B8"]).rename("ndwi_before")
        ndwi_after = after_comp.normalizedDifference(["B3", "B8"]).rename("ndwi_after")

        # 4. Enforce Common-Valid-Pixel Policy
        # Valid pixels must be unmasked in both Before and After periods
        mask_before = ndvi_before.mask()
        mask_after = ndvi_after.mask()
        common_mask = mask_before.And(mask_after)

        # 5. Pixel Differences Computed strictly on Common Pixels
        delta_ndvi = ndvi_after.subtract(ndvi_before).updateMask(common_mask).rename("delta_ndvi")
        delta_ndwi = ndwi_after.subtract(ndwi_before).updateMask(common_mask).rename("delta_ndwi")

        # 6. Physical Area Calculations using ee.Image.pixelArea()
        pixel_area_img = ee.Image.pixelArea()

        common_area_img = pixel_area_img.updateMask(common_mask).rename("common_area")
        before_area_img = pixel_area_img.updateMask(mask_before).rename("before_area")
        after_area_img = pixel_area_img.updateMask(mask_after).rename("after_area")

        # Heuristic Threshold Areas
        # Canopy Decline: Common pixels with delta_ndvi <= NDVI_DECLINE_THRESHOLD (-0.15)
        canopy_decline_mask = common_mask.And(delta_ndvi.lte(NDVI_DECLINE_THRESHOLD))
        canopy_decline_img = pixel_area_img.updateMask(canopy_decline_mask).rename("canopy_decline")

        # Canopy Growth / Regrowth: Common pixels with delta_ndvi >= NDVI_RECOVERY_THRESHOLD (+0.15)
        canopy_growth_mask = common_mask.And(delta_ndvi.gte(NDVI_RECOVERY_THRESHOLD))
        canopy_growth_img = pixel_area_img.updateMask(canopy_growth_mask).rename("canopy_growth")

        # Water Inundation / Expansion: Common pixels with delta_ndwi >= NDWI_EXPANSION_THRESHOLD (+0.15)
        water_expansion_mask = common_mask.And(delta_ndwi.gte(NDWI_EXPANSION_THRESHOLD))
        water_expansion_img = pixel_area_img.updateMask(water_expansion_mask).rename("water_expansion")

        # Water-like surface extent in each period (NDWI >= 0.0)
        water_like_before_mask = mask_before.And(ndwi_before.gte(NDWI_WATER_BODY_THRESHOLD))
        water_like_before_img = pixel_area_img.updateMask(water_like_before_mask).rename("water_like_before")

        water_like_after_mask = mask_after.And(ndwi_after.gte(NDWI_WATER_BODY_THRESHOLD))
        water_like_after_img = pixel_area_img.updateMask(water_like_after_mask).rename("water_like_after")

        # 7. Stack all metric images for a single consolidated reduceRegion call
        # Scale: 20m for areas <= 25 km², 40m for areas <= 200 km², 60m for larger
        calc_scale = 20 if area_km2 <= 25.0 else (40 if area_km2 <= 200.0 else 60)

        metrics_stack = (
            ndvi_before.updateMask(common_mask)
            .addBands(ndvi_after.updateMask(common_mask))
            .addBands(delta_ndvi)
            .addBands(ndwi_before.updateMask(common_mask))
            .addBands(ndwi_after.updateMask(common_mask))
            .addBands(delta_ndwi)
            .addBands(common_area_img)
            .addBands(before_area_img)
            .addBands(after_area_img)
            .addBands(canopy_decline_img)
            .addBands(canopy_growth_img)
            .addBands(water_expansion_img)
            .addBands(water_like_before_img)
            .addBands(water_like_after_img)
        )

        # Statistical Reducer: Mean for indices, Sum for pixel areas
        mean_reducer = ee.Reducer.mean().forEachBand(
            metrics_stack.select([
                "ndvi_before", "ndvi_after", "delta_ndvi",
                "ndwi_before", "ndwi_after", "delta_ndwi",
            ])
        )

        sum_reducer = ee.Reducer.sum().forEachBand(
            metrics_stack.select([
                "common_area", "before_area", "after_area",
                "canopy_decline", "canopy_growth", "water_expansion",
                "water_like_before", "water_like_after",
            ])
        )

        combined_reducer = mean_reducer.combine(sum_reducer, sharedInputs=False)

        try:
            stats = metrics_stack.reduceRegion(
                reducer=combined_reducer,
                geometry=geometry,
                scale=calc_scale,
                maxPixels=1e9,
                tileScale=4,
            ).getInfo() or {}
        except Exception as e:
            logger.error(f"GEE reduction error during satellite comparison: {e}")
            raise RuntimeError(f"Earth Engine statistical reduction failed: {str(e)}")

        # Extract area values (converted from m² to km²)
        common_area_km2 = round(float(stats.get("common_area") or 0.0) / 1e6, 3)
        before_valid_km2 = round(float(stats.get("before_area") or 0.0) / 1e6, 3)
        after_valid_km2 = round(float(stats.get("after_area") or 0.0) / 1e6, 3)

        canopy_decline_km2 = round(float(stats.get("canopy_decline") or 0.0) / 1e6, 3)
        canopy_growth_km2 = round(float(stats.get("canopy_growth") or 0.0) / 1e6, 3)
        water_expansion_km2 = round(float(stats.get("water_expansion") or 0.0) / 1e6, 3)

        water_before_km2 = round(float(stats.get("water_like_before") or 0.0) / 1e6, 3)
        water_after_km2 = round(float(stats.get("water_like_after") or 0.0) / 1e6, 3)

        # Coverage percentage relative to total vector geometry area
        coverage_pct = round((common_area_km2 / max(0.001, area_km2)) * 100.0, 1) if area_km2 > 0 else 0.0
        coverage_pct = min(100.0, max(0.0, coverage_pct))

        # Extract mean index values
        mean_ndvi_before = round(float(stats.get("ndvi_before") or 0.0), 4)
        mean_ndvi_after = round(float(stats.get("ndvi_after") or 0.0), 4)
        mean_delta_ndvi = round(float(stats.get("delta_ndvi") or (mean_ndvi_after - mean_ndvi_before)), 4)

        mean_ndwi_before = round(float(stats.get("ndwi_before") or 0.0), 4)
        mean_ndwi_after = round(float(stats.get("ndwi_after") or 0.0), 4)
        mean_delta_ndwi = round(float(stats.get("delta_ndwi") or (mean_ndwi_after - mean_ndwi_before)), 4)

        # 8. Generate Map Tile URL Templates
        # Natural color RGB (B4, B3, B2) with uniform visualization parameters
        rgb_vis_params = {"bands": ["B4", "B3", "B2"], "min": 0, "max": 2500, "gamma": 1.2}

        try:
            before_rgb_tile = before_comp.visualize(**rgb_vis_params).getMapId()["tile_fetcher"].url_format
        except Exception as ex:
            logger.warning(f"Could not generate before RGB tile: {ex}")
            before_rgb_tile = ""

        try:
            after_rgb_tile = after_comp.visualize(**rgb_vis_params).getMapId()["tile_fetcher"].url_format
        except Exception as ex:
            logger.warning(f"Could not generate after RGB tile: {ex}")
            after_rgb_tile = ""

        # False Color Infrared (B8, B4, B3)
        cir_vis_params = {"bands": ["B8", "B4", "B3"], "min": 0, "max": 3000}
        try:
            before_cir_tile = before_comp.visualize(**cir_vis_params).getMapId()["tile_fetcher"].url_format
            after_cir_tile = after_comp.visualize(**cir_vis_params).getMapId()["tile_fetcher"].url_format
        except Exception:
            before_cir_tile = ""
            after_cir_tile = ""

        # Delta NDVI Tile (Diverging Red to Blue)
        try:
            delta_ndvi_tile = delta_ndvi.visualize(
                min=-0.35,
                max=0.35,
                palette=["#b2182b", "#ef8a62", "#fddbc7", "#ffffff", "#d1e5f0", "#67a9cf", "#2166ac"]
            ).getMapId()["tile_fetcher"].url_format
        except Exception:
            delta_ndvi_tile = ""

        # Delta NDWI Tile (Diverging Brown to Teal)
        try:
            delta_ndwi_tile = delta_ndwi.visualize(
                min=-0.25,
                max=0.25,
                palette=["#8c510a", "#dfc27d", "#f6e8c3", "#c7eae5", "#5ab4ac", "#01665e"]
            ).getMapId()["tile_fetcher"].url_format
        except Exception:
            delta_ndwi_tile = ""

        # Assemble Warnings
        warnings = []
        if coverage_pct < 60.0:
            warnings.append(
                f"Common valid pixel coverage is limited ({coverage_pct}%). "
                "Persistent clouds or shadows between the two periods restricted comparable surface area."
            )
        if before_count <= 2:
            warnings.append(f"Low observation density for before period ({before_count} scene).")
        if after_count <= 2:
            warnings.append(f"Low observation density for after period ({after_count} scene).")

        return {
            "status": "success",
            "is_live": True,
            "is_demo": False,
            "source": "Copernicus Sentinel-2 Level-2A via Google Earth Engine",
            "region_name": region_name,
            "geometry_area_km2": area_km2,
            "common_valid_area_km2": common_area_km2,
            "before_valid_area_km2": before_valid_km2,
            "after_valid_area_km2": after_valid_km2,
            "coverage_percentage": coverage_pct,
            "calculation_scale_meters": calc_scale,
            "before_metadata": {
                "requested_interval": f"{before_start} to {before_end}",
                "effective_interval": f"{before_dates[0]} to {before_dates[-1]}" if before_dates else f"{before_start} to {before_end}",
                "scene_count": before_count,
                "usable_scenes": len(before_dates),
                "acquisition_dates": before_dates,
                "cloud_filter_percent": cloud_threshold,
                "masking_method": before_mask_method,
            },
            "after_metadata": {
                "requested_interval": f"{after_start} to {after_end}",
                "effective_interval": f"{after_dates[0]} to {after_dates[-1]}" if after_dates else f"{after_start} to {after_end}",
                "scene_count": after_count,
                "usable_scenes": len(after_dates),
                "acquisition_dates": after_dates,
                "cloud_filter_percent": cloud_threshold,
                "masking_method": after_mask_method,
            },
            "imagery_layers": {
                "before_rgb": before_rgb_tile,
                "after_rgb": after_rgb_tile,
                "before_cir": before_cir_tile,
                "after_cir": after_cir_tile,
                "delta_ndvi": delta_ndvi_tile,
                "delta_ndwi": delta_ndwi_tile,
            },
            "ndvi_metrics": {
                "before_mean": mean_ndvi_before,
                "after_mean": mean_ndvi_after,
                "delta_mean": mean_delta_ndvi,
                "decline_area_km2": canopy_decline_km2,
                "growth_area_km2": canopy_growth_km2,
                "threshold_decline": NDVI_DECLINE_THRESHOLD,
                "threshold_recovery": NDVI_RECOVERY_THRESHOLD,
                "indicator": "NDVI = (B8 - B4) / (B8 + B4)",
            },
            "ndwi_metrics": {
                "before_mean": mean_ndwi_before,
                "after_mean": mean_ndwi_after,
                "delta_mean": mean_delta_ndwi,
                "expansion_area_km2": water_expansion_km2,
                "water_like_before_km2": water_before_km2,
                "water_like_after_km2": water_after_km2,
                "threshold_expansion": NDWI_EXPANSION_THRESHOLD,
                "threshold_water": NDWI_WATER_BODY_THRESHOLD,
                "indicator": "NDWI = (B3 - B8) / (B3 + B8) (McFeeters)",
            },
            "threshold_areas": {
                "canopy_decline_km2": canopy_decline_km2,
                "canopy_growth_km2": canopy_growth_km2,
                "water_expansion_km2": water_expansion_km2,
                "water_like_before_km2": water_before_km2,
                "water_like_after_km2": water_after_km2,
            },
            "methodology": METHODOLOGY_NOTE,
            "limitations": LIMITATIONS_NOTE,
            "warnings": warnings,
        }

    def _build_demo_comparison_response(
        self,
        region_name: str,
        area_km2: float,
        before_start: str,
        before_end: str,
        after_start: str,
        after_end: str,
        cloud_threshold: int,
        offline_reason: str,
    ) -> Dict[str, Any]:
        """
        Build an explicit demonstration / offline calibration response when GEE is
        unauthenticated or demo mode is selected.
        """
        # Realistic calibration values scaled to AOI area
        common_area_km2 = round(area_km2 * 0.94, 3)
        canopy_decline_km2 = round(common_area_km2 * 0.12, 3)
        canopy_growth_km2 = round(common_area_km2 * 0.05, 3)
        water_expansion_km2 = round(common_area_km2 * 0.03, 3)
        water_before_km2 = round(common_area_km2 * 0.08, 3)
        water_after_km2 = round(common_area_km2 * 0.11, 3)

        return {
            "status": "success",
            "is_live": False,
            "is_demo": True,
            "source": f"GeoVision Demonstration Fallback ({offline_reason})",
            "region_name": region_name,
            "geometry_area_km2": area_km2,
            "common_valid_area_km2": common_area_km2,
            "before_valid_area_km2": common_area_km2,
            "after_valid_area_km2": common_area_km2,
            "coverage_percentage": 94.0,
            "calculation_scale_meters": 20,
            "before_metadata": {
                "requested_interval": f"{before_start} to {before_end}",
                "effective_interval": f"{before_start} to {before_end}",
                "scene_count": 8,
                "usable_scenes": 6,
                "acquisition_dates": [f"{before_start[:4]}-01-15", f"{before_start[:4]}-02-20", f"{before_start[:4]}-03-25"],
                "cloud_filter_percent": cloud_threshold,
                "masking_method": "Synthetic Demonstration Calibration",
            },
            "after_metadata": {
                "requested_interval": f"{after_start} to {after_end}",
                "effective_interval": f"{after_start} to {after_end}",
                "scene_count": 8,
                "usable_scenes": 7,
                "acquisition_dates": [f"{after_start[:4]}-01-14", f"{after_start[:4]}-02-18", f"{after_start[:4]}-03-22"],
                "cloud_filter_percent": cloud_threshold,
                "masking_method": "Synthetic Demonstration Calibration",
            },
            "imagery_layers": {
                "before_rgb": "",
                "after_rgb": "",
                "before_cir": "",
                "after_cir": "",
                "delta_ndvi": "",
                "delta_ndwi": "",
            },
            "ndvi_metrics": {
                "before_mean": 0.4420,
                "after_mean": 0.3615,
                "delta_mean": -0.0805,
                "decline_area_km2": canopy_decline_km2,
                "growth_area_km2": canopy_growth_km2,
                "threshold_decline": NDVI_DECLINE_THRESHOLD,
                "threshold_recovery": NDVI_RECOVERY_THRESHOLD,
                "indicator": "NDVI = (B8 - B4) / (B8 + B4)",
            },
            "ndwi_metrics": {
                "before_mean": -0.2150,
                "after_mean": -0.1730,
                "delta_mean": 0.0420,
                "expansion_area_km2": water_expansion_km2,
                "water_like_before_km2": water_before_km2,
                "water_like_after_km2": water_after_km2,
                "threshold_expansion": NDWI_EXPANSION_THRESHOLD,
                "threshold_water": NDWI_WATER_BODY_THRESHOLD,
                "indicator": "NDWI = (B3 - B8) / (B3 + B8) (McFeeters)",
            },
            "threshold_areas": {
                "canopy_decline_km2": canopy_decline_km2,
                "canopy_growth_km2": canopy_growth_km2,
                "water_expansion_km2": water_expansion_km2,
                "water_like_before_km2": water_before_km2,
                "water_like_after_km2": water_after_km2,
            },
            "methodology": METHODOLOGY_NOTE + " [DEMO CALIBRATION MODE: Metrics generated from calibrated reference model].",
            "limitations": LIMITATIONS_NOTE + " [DEMO NOTICE: Earth Engine connection is offline or demo mode was requested. Results are illustrative].",
            "warnings": [
                f"Demonstration mode active: {offline_reason}. Live satellite map tiles cannot be fetched without an authenticated Earth Engine connection."
            ],
        }


# Singleton instance
satellite_comparison_service = SatelliteComparisonService()
