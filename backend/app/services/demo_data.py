"""
GeoVision AI — Demo Data Service
Loads the existing Sentinel-2 CSV dataset and generates structured demo records
for all three monitoring modules (deforestation, mining, flood).

Data source: geovision_ml_dataset_2023_2026.csv (5,000 samples, Pune pilot area)
All outputs are clearly labelled as DEMO DATA.
"""

import json
import hashlib
from typing import List, Dict, Optional

import pandas as pd
import numpy as np

from ..config import settings
from . import risk_engine

def get_data_source() -> str:
    return "GeoVision AI pilot dataset (Pune study area, 2023–2026; provenance not independently verified)"


DEMO_SOURCE = get_data_source()
ANALYSIS_DATE = "2026-03-15"


def _assign_region(lat: float, lng: float) -> str:
    """Assign a location to one of 9 named sub-regions within the study area."""
    if lat >= 18.53:
        if lng < 73.83:
            return "Hinjewadi-Pashan"
        elif lng < 73.90:
            return "Aundh-Baner"
        else:
            return "Wagholi"
    elif lat >= 18.48:
        if lng < 73.83:
            return "Kothrud-Bavdhan"
        elif lng < 73.90:
            return "Pune Central"
        else:
            return "Hadapsar-Mundhwa"
    else:
        if lng < 73.83:
            return "Sinhagad-Dhayari"
        elif lng < 73.90:
            return "Kondhwa-Wanowrie"
        else:
            return "Undri-Pisoli"


def _parse_geo(geo_str: str):
    """Extract (latitude, longitude) from a GEE .geo JSON string."""
    try:
        geo = json.loads(str(geo_str))
        coords = geo["coordinates"]
        return float(coords[1]), float(coords[0])  # lat, lng
    except Exception:
        return None, None


def _make_id(module: str, index: int) -> str:
    """Generate a deterministic short ID for a data point."""
    raw = f"{module}-{index}"
    return f"{module[:3].upper()}-{hashlib.md5(raw.encode()).hexdigest()[:8]}"


# ── Main data loader ──────────────────────────────────────────────────


class DemoDataService:
    """Loads operational dataset or user-uploaded dataset and provides structured records for all modules."""

    def __init__(self):
        self.loaded = False
        self.dataset_type = "operational"  # "operational" | "user"
        self.user_filename: Optional[str] = None
        self.upload_timestamp: Optional[str] = None
        self.df: Optional[pd.DataFrame] = None
        self.is_synthetic_fallback = False
        self._deforestation_cache: List[Dict] = []
        self._mining_cache: List[Dict] = []
        self._flood_cache: List[Dict] = []
        self._overview_cache: Dict = {}
        self._trends_cache: Dict = {}

    @property
    def is_demo(self) -> bool:
        """Returns True if serving demonstration/pilot reference data rather than live satellite queries."""
        return self.is_synthetic_fallback or self.dataset_type == "operational"

    def get_source(self) -> str:
        if self.dataset_type == "user" and self.user_filename:
            return f"User Ingested Dataset ({self.user_filename})"
        if self.is_synthetic_fallback:
            return "GeoVision synthetic demonstration fallback (CSV unavailable)"
        return "GeoVision AI pilot dataset (Pune study area, 2023–2026; provenance not independently verified)"

    def load(self, force: bool = False):
        """Load and process the operational Sentinel-2 dataset."""
        if self.loaded and not force:
            return

        self.dataset_type = "operational"
        self.user_filename = None
        self.upload_timestamp = None
        self.is_synthetic_fallback = False

        csv_path = settings.DATA_CSV
        if not csv_path.exists():
            print(f"[DataService] WARNING: Dataset not found at {csv_path}")
            self.is_synthetic_fallback = True
            self._generate_fallback()
            self.loaded = True
            return

        print(f"[DataService] Loading dataset from {csv_path}")
        self.df = pd.read_csv(csv_path)
        print(f"[DataService] Loaded {len(self.df)} samples")

        # Parse coordinates
        self.df["latitude"] = None
        self.df["longitude"] = None
        if ".geo" in self.df.columns:
            coords = self.df[".geo"].apply(_parse_geo)
            self.df["latitude"] = coords.apply(lambda x: x[0])
            self.df["longitude"] = coords.apply(lambda x: x[1])

        # Drop rows without valid coordinates
        self.df = self.df.dropna(subset=["latitude", "longitude"])

        # Assign regions
        self.df["region"] = self.df.apply(
            lambda r: _assign_region(r["latitude"], r["longitude"]), axis=1
        )

        # Build module caches
        self._build_deforestation()
        self._build_mining()
        self._build_flood()
        self._build_trends()
        self._build_overview()

        self.loaded = True
        print(f"[DataService] Operational data ready — {len(self._deforestation_cache)} deforestation, "
              f"{len(self._mining_cache)} mining, {len(self._flood_cache)} flood records")

    def load_user_dataframe(self, df: pd.DataFrame, filename: str) -> Dict:
        """
        Ingest user-provided dataset (CSV or GeoJSON features) and rebuild
        all operational caches, hotspots, risk distributions, and statistics.
        """
        col_map = {c.lower().strip(): c for c in df.columns}

        # 1. Resolve Latitude
        lat_candidates = ["latitude", "lat", "y"]
        lat_col = next((col_map[c] for c in lat_candidates if c in col_map), None)

        # 2. Resolve Longitude
        lng_candidates = ["longitude", "lng", "lon", "long", "x"]
        lng_col = next((col_map[c] for c in lng_candidates if c in col_map), None)

        user_df = df.copy()

        # Check for GeoJSON .geo column if direct lat/lon missing
        if (not lat_col or not lng_col) and ".geo" in user_df.columns:
            coords = user_df[".geo"].apply(_parse_geo)
            user_df["latitude"] = coords.apply(lambda x: x[0] if x else None)
            user_df["longitude"] = coords.apply(lambda x: x[1] if x else None)
        elif lat_col and lng_col:
            user_df["latitude"] = pd.to_numeric(user_df[lat_col], errors="coerce")
            user_df["longitude"] = pd.to_numeric(user_df[lng_col], errors="coerce")
        else:
            raise ValueError("Uploaded file must contain latitude/longitude or lat/lng columns.")

        # Drop rows without valid coordinates
        user_df = user_df.dropna(subset=["latitude", "longitude"])
        if len(user_df) == 0:
            raise ValueError("No valid coordinates found in the uploaded dataset.")

        # Resolve or assign Region
        reg_col = next((col_map[c] for c in ["region", "zone", "location", "name"] if c in col_map), None)
        if reg_col:
            user_df["region"] = user_df[reg_col].astype(str)
        else:
            user_df["region"] = user_df.apply(
                lambda r: _assign_region(r["latitude"], r["longitude"]), axis=1
            )

        # Normalize/impute spectral indices if missing
        # NDVI
        for yr in [2023, 2024, 2025, 2026]:
            col_target = f"NDVI_{yr}"
            match = next((col_map[c] for c in [col_target.lower(), f"ndvi{yr}", f"ndvi_{yr}"] if c in col_map), None)
            if match:
                user_df[col_target] = pd.to_numeric(user_df[match], errors="coerce").fillna(0.4)
            elif col_target not in user_df.columns:
                user_df[col_target] = 0.45

        if "NDVI_Change" not in user_df.columns:
            change_match = next((col_map[c] for c in ["ndvi_change", "ndvichange", "change_ndvi"] if c in col_map), None)
            if change_match:
                user_df["NDVI_Change"] = pd.to_numeric(user_df[change_match], errors="coerce").fillna(0.0)
            else:
                user_df["NDVI_Change"] = user_df["NDVI_2026"] - user_df["NDVI_2023"]

        # NDBI
        for yr in [2023, 2026]:
            col_target = f"NDBI_{yr}"
            match = next((col_map[c] for c in [col_target.lower(), f"ndbi{yr}", f"ndbi_{yr}"] if c in col_map), None)
            if match:
                user_df[col_target] = pd.to_numeric(user_df[match], errors="coerce").fillna(0.05)
            elif col_target not in user_df.columns:
                user_df[col_target] = 0.05

        if "NDBI_Change" not in user_df.columns:
            change_match = next((col_map[c] for c in ["ndbi_change", "ndbichange", "change_ndbi"] if c in col_map), None)
            if change_match:
                user_df["NDBI_Change"] = pd.to_numeric(user_df[change_match], errors="coerce").fillna(0.0)
            else:
                user_df["NDBI_Change"] = user_df["NDBI_2026"] - user_df["NDBI_2023"]

        # NDWI
        for yr in [2023, 2026]:
            col_target = f"NDWI_{yr}"
            match = next((col_map[c] for c in [col_target.lower(), f"ndwi{yr}", f"ndwi_{yr}"] if c in col_map), None)
            if match:
                user_df[col_target] = pd.to_numeric(user_df[match], errors="coerce").fillna(-0.2)
            elif col_target not in user_df.columns:
                user_df[col_target] = -0.2

        if "NDWI_Change" not in user_df.columns:
            change_match = next((col_map[c] for c in ["ndwi_change", "ndwichange", "change_ndwi"] if c in col_map), None)
            if change_match:
                user_df["NDWI_Change"] = pd.to_numeric(user_df[change_match], errors="coerce").fillna(0.0)
            else:
                user_df["NDWI_Change"] = user_df["NDWI_2026"] - user_df["NDWI_2023"]

        self.df = user_df
        self.dataset_type = "user"
        self.user_filename = filename
        import datetime
        self.upload_timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        # Rebuild caches
        self._build_deforestation()
        self._build_mining()
        self._build_flood()
        self._build_trends()
        self._build_overview()
        self.loaded = True

        return {
            "status": "success",
            "message": f"Successfully loaded {len(user_df)} locations from {filename}",
            "filename": filename,
            "total_points": len(user_df),
            "high_risk_zones": self._overview_cache["high_risk_zones"],
            "risk_distribution": self._overview_cache["risk_distribution"],
            "uploaded_at": self.upload_timestamp,
        }

    def reset_to_default(self) -> Dict:
        """Reset dataset back to the default Copernicus Sentinel-2 operational records."""
        self.load(force=True)
        return {
            "status": "success",
            "message": "Reset to default Copernicus Sentinel-2 operational dataset",
            "total_points": len(self._deforestation_cache),
            "dataset_type": "operational",
        }

    # ── Deforestation records ──────────────────────────────────────────

    def _build_deforestation(self):
        """Build deforestation risk records from NDVI data."""
        records = []
        for idx, row in self.df.iterrows():
            ndvi_change = row.get("NDVI_Change", 0)
            ndvi_current = row.get("NDVI_2026", 0)
            ndvi_previous = row.get("NDVI_2023", 0)

            score = risk_engine.deforestation_risk(ndvi_change, ndvi_current, ndvi_previous)
            level = risk_engine.risk_level(score)
            conf = risk_engine.estimate_confidence(ndvi_change)

            records.append({
                "id": _make_id("deforestation", idx),
                "latitude": round(row["latitude"], 6),
                "longitude": round(row["longitude"], 6),
                "region": row["region"],
                "date": ANALYSIS_DATE,
                "module": "deforestation",
                "current_value": round(float(ndvi_current), 4),
                "previous_value": round(float(ndvi_previous), 4),
                "change_value": round(float(ndvi_change), 4),
                "risk_score": score,
                "risk_level": level,
                "confidence": conf,
                "status": "Vegetation-index decline detected (field verification required)" if score >= 40 else "Vegetation index within normal baseline range",
                "requires_field_verification": True,
                "provenance": self.get_source(),
                "is_demo": self.is_demo,
            })

        self._deforestation_cache = records

    # ── Mining records ─────────────────────────────────────────────────

    def _build_mining(self):
        """Build mining disturbance risk records from NDBI + NDVI data."""
        records = []
        for idx, row in self.df.iterrows():
            ndbi_change = row.get("NDBI_Change", 0)
            ndvi_change = row.get("NDVI_Change", 0)
            ndbi_current = row.get("NDBI_2026", 0)
            ndbi_previous = row.get("NDBI_2023", 0)

            score = risk_engine.mining_risk(ndbi_change, ndvi_change, ndbi_current)
            level = risk_engine.risk_level(score)
            conf = risk_engine.estimate_confidence(ndbi_change)

            records.append({
                "id": _make_id("mining", idx),
                "latitude": round(row["latitude"], 6),
                "longitude": round(row["longitude"], 6),
                "region": row["region"],
                "date": ANALYSIS_DATE,
                "module": "mining",
                "current_value": round(float(ndbi_current), 4),
                "previous_value": round(float(ndbi_previous), 4),
                "change_value": round(float(ndbi_change), 4),
                "risk_score": score,
                "risk_level": level,
                "confidence": conf,
                "status": "Potential surface disturbance detected (field verification required)" if score >= 40 else "Surface reflectance within baseline range",
                "requires_field_verification": True,
                "provenance": self.get_source(),
                "is_demo": self.is_demo,
            })

        self._mining_cache = records

    # ── Flood records ──────────────────────────────────────────────────

    def _build_flood(self):
        """Build flood risk records from NDWI data."""
        records = []
        for idx, row in self.df.iterrows():
            ndwi_change = row.get("NDWI_Change", 0)
            ndwi_current = row.get("NDWI_2026", 0)
            ndwi_previous = row.get("NDWI_2023", 0)

            score = risk_engine.flood_risk(ndwi_change, ndwi_current, ndwi_previous)
            level = risk_engine.risk_level(score)
            conf = risk_engine.estimate_confidence(ndwi_change)

            records.append({
                "id": _make_id("flood", idx),
                "latitude": round(row["latitude"], 6),
                "longitude": round(row["longitude"], 6),
                "region": row["region"],
                "date": ANALYSIS_DATE,
                "module": "flood",
                "current_value": round(float(ndwi_current), 4),
                "previous_value": round(float(ndwi_previous), 4),
                "change_value": round(float(ndwi_change), 4),
                "risk_score": score,
                "risk_level": level,
                "confidence": conf,
                "status": "Water extent expansion detected (field verification required)" if score >= 40 else "Water extent within baseline range",
                "requires_field_verification": True,
                "provenance": self.get_source(),
                "is_demo": self.is_demo,
            })

        self._flood_cache = records

    # ── Trends ─────────────────────────────────────────────────────────

    def _build_trends(self):
        """Build multi-year trend data from NDVI/NDWI/NDBI columns."""
        df = self.df

        # NDVI trend (deforestation proxy)
        deforestation_trend = []
        for year in [2023, 2024, 2025, 2026]:
            col = f"NDVI_{year}"
            if col in df.columns:
                deforestation_trend.append({
                    "year": year,
                    "value": round(float(df[col].mean()), 4),
                    "label": f"Mean NDVI {year}",
                })

        # NDBI trend (mining proxy) — only 2023 and 2026 available
        mining_trend = []
        for year, col in [(2023, "NDBI_2023"), (2026, "NDBI_2026")]:
            if col in df.columns:
                mining_trend.append({
                    "year": year,
                    "value": round(float(df[col].mean()), 4),
                    "label": f"Mean NDBI {year}",
                })

        # NDWI trend (flood proxy)
        flood_trend = []
        for year, col in [(2023, "NDWI_2023"), (2026, "NDWI_2026")]:
            if col in df.columns:
                flood_trend.append({
                    "year": year,
                    "value": round(float(df[col].mean()), 4),
                    "label": f"Mean NDWI {year}",
                })

        self._trends_cache = {
            "deforestation": deforestation_trend,
            "mining": mining_trend,
            "flood": flood_trend,
        }

    # ── Overview ───────────────────────────────────────────────────────

    def _build_overview(self):
        """Build aggregate overview stats."""
        regions = set()
        for r in self._deforestation_cache + self._mining_cache + self._flood_cache:
            regions.add(r["region"])

        veg_high = sum(1 for r in self._deforestation_cache if r["risk_level"] == "High")
        mine_high = sum(1 for r in self._mining_cache if r["risk_level"] == "High")
        flood_high = sum(1 for r in self._flood_cache if r["risk_level"] == "High")

        all_records = self._deforestation_cache + self._mining_cache + self._flood_cache
        dist = _risk_distribution(all_records)

        dist_veg = _risk_distribution(self._deforestation_cache)
        dist_mine = _risk_distribution(self._mining_cache)
        dist_flood = _risk_distribution(self._flood_cache)

        avg_ndvi = round(sum(r["change_value"] for r in self._deforestation_cache) / max(1, len(self._deforestation_cache)), 4)
        avg_ndbi = round(sum(r["change_value"] for r in self._mining_cache) / max(1, len(self._mining_cache)), 4)
        avg_ndwi = round(sum(r["change_value"] for r in self._flood_cache) / max(1, len(self._flood_cache)), 4)

        self._overview_cache = {
            "total_monitored_regions": len(regions),
            "total_points": len(self._deforestation_cache),
            "high_risk_zones": veg_high + mine_high + flood_high,
            "vegetation_loss_areas": sum(1 for r in self._deforestation_cache if r["risk_score"] >= 40),
            "land_disturbance_areas": sum(1 for r in self._mining_cache if r["risk_score"] >= 40),
            "flood_risk_areas": sum(1 for r in self._flood_cache if r["risk_score"] >= 40),
            "last_analysis_date": ANALYSIS_DATE,
            "risk_distribution": dist,
            "module_stats": {
                "deforestation": dist_veg,
                "mining": dist_mine,
                "flood": dist_flood,
            },
            "module_changes": {
                "deforestation": avg_ndvi,
                "mining": avg_ndbi,
                "flood": avg_ndwi,
            },
        }

    # ── Fallback when CSV is not found ─────────────────────────────────

    def _generate_fallback(self):
        """Generate minimal synthetic fallback data when CSV is missing."""
        print("[DemoData] Generating minimal fallback data")
        np.random.seed(42)
        n = 50
        for i in range(n):
            lat = 18.45 + np.random.random() * 0.15
            lng = 73.78 + np.random.random() * 0.18
            region = _assign_region(lat, lng)

            for module, change_fn, val_range in [
                ("deforestation", risk_engine.deforestation_risk, (-0.4, 0.1)),
                ("mining", risk_engine.mining_risk, (-0.1, 0.3)),
                ("flood", risk_engine.flood_risk, (-0.1, 0.2)),
            ]:
                change = np.random.uniform(*val_range)
                current = np.random.uniform(0.0, 0.6)
                previous = current - change
                score = change_fn(change, current, previous)
                level = risk_engine.risk_level(score)

                record = {
                    "id": _make_id(module, i),
                    "latitude": round(lat, 6),
                    "longitude": round(lng, 6),
                    "region": region,
                    "date": ANALYSIS_DATE,
                    "module": module,
                    "current_value": round(current, 4),
                    "previous_value": round(previous, 4),
                    "change_value": round(change, 4),
                    "risk_score": score,
                    "risk_level": level,
                    "confidence": 0.5,
                    "status": "Synthetic fallback data",
                    "requires_field_verification": True,
                }
                if module == "deforestation":
                    self._deforestation_cache.append(record)
                elif module == "mining":
                    self._mining_cache.append(record)
                else:
                    self._flood_cache.append(record)

        self._trends_cache = {
            "deforestation": [
                {"year": 2023, "value": 0.42, "label": "Mean NDVI 2023"},
                {"year": 2024, "value": 0.39, "label": "Mean NDVI 2024"},
                {"year": 2025, "value": 0.36, "label": "Mean NDVI 2025"},
                {"year": 2026, "value": 0.33, "label": "Mean NDVI 2026"},
            ],
            "mining": [
                {"year": 2023, "value": 0.02, "label": "Mean NDBI 2023"},
                {"year": 2026, "value": 0.05, "label": "Mean NDBI 2026"},
            ],
            "flood": [
                {"year": 2023, "value": -0.18, "label": "Mean NDWI 2023"},
                {"year": 2026, "value": -0.14, "label": "Mean NDWI 2026"},
            ],
        }
        self._build_overview()

    # ── Public API ─────────────────────────────────────────────────────

    def _filter_records(
        self,
        records: List[Dict],
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lng: Optional[float] = None,
        max_lng: Optional[float] = None,
        region: Optional[str] = None,
    ) -> List[Dict]:
        """Filter a list of records by geographic bounding box and/or region."""
        filtered = records
        if region and region.lower() not in ("all", "all region", "entire study area"):
            filtered = [r for r in filtered if r.get("region", "").lower() == region.lower()]
        if min_lat is not None and max_lat is not None:
            # allow small tolerance
            filtered = [r for r in filtered if min_lat <= r["latitude"] <= max_lat]
        if min_lng is not None and max_lng is not None:
            filtered = [r for r in filtered if min_lng <= r["longitude"] <= max_lng]
        return filtered

    def get_overview(
        self,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lng: Optional[float] = None,
        max_lng: Optional[float] = None,
        region: Optional[str] = None,
    ) -> Dict:
        self.load()
        has_filter = any(v is not None for v in [min_lat, max_lat, min_lng, max_lng]) or (region and region.lower() != "all")
        if not has_filter:
            return self._overview_cache

        # Dynamically compute overview for the filtered AOI
        def_records = self._filter_records(self._deforestation_cache, min_lat, max_lat, min_lng, max_lng, region)
        min_records = self._filter_records(self._mining_cache, min_lat, max_lat, min_lng, max_lng, region)
        fld_records = self._filter_records(self._flood_cache, min_lat, max_lat, min_lng, max_lng, region)

        # Fallback to full cache if AOI contains no direct sample points (e.g. boundary edge)
        if not def_records and not min_records and not fld_records:
            def_records = self._deforestation_cache[:50]
            min_records = self._mining_cache[:50]
            fld_records = self._flood_cache[:50]

        regions = {r["region"] for r in def_records + min_records + fld_records if "region" in r}
        all_records = def_records + min_records + fld_records
        dist = _risk_distribution(all_records)
        dist_veg = _risk_distribution(def_records)
        dist_mine = _risk_distribution(min_records)
        dist_flood = _risk_distribution(fld_records)

        avg_ndvi = round(sum(r["change_value"] for r in def_records) / max(1, len(def_records)), 4)
        avg_ndbi = round(sum(r["change_value"] for r in min_records) / max(1, len(min_records)), 4)
        avg_ndwi = round(sum(r["change_value"] for r in fld_records) / max(1, len(fld_records)), 4)

        veg_high = sum(1 for r in def_records if r["risk_level"] == "High")
        mine_high = sum(1 for r in min_records if r["risk_level"] == "High")
        flood_high = sum(1 for r in fld_records if r["risk_level"] == "High")

        return {
            "total_monitored_regions": len(regions),
            "total_points": len(def_records),
            "high_risk_zones": veg_high + mine_high + flood_high,
            "vegetation_loss_areas": sum(1 for r in def_records if r["risk_score"] >= 40),
            "land_disturbance_areas": sum(1 for r in min_records if r["risk_score"] >= 40),
            "flood_risk_areas": sum(1 for r in fld_records if r["risk_score"] >= 40),
            "last_analysis_date": ANALYSIS_DATE,
            "risk_distribution": dist,
            "module_stats": {
                "deforestation": dist_veg,
                "mining": dist_mine,
                "flood": dist_flood,
            },
            "module_changes": {
                "deforestation": avg_ndvi,
                "mining": avg_ndbi,
                "flood": avg_ndwi,
            },
        }

    def get_module_data(
        self,
        module: str,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lng: Optional[float] = None,
        max_lng: Optional[float] = None,
        region: Optional[str] = None,
    ) -> Dict:
        """Get data for a specific module (deforestation, mining, flood) with optional AOI filter."""
        self.load()
        cache_map = {
            "deforestation": self._deforestation_cache,
            "mining": self._mining_cache,
            "flood": self._flood_cache,
        }
        all_records = cache_map.get(module, [])
        records = self._filter_records(all_records, min_lat, max_lat, min_lng, max_lng, region)

        # Fallback to top points if boundary filter is very restrictive
        if not records and all_records:
            records = all_records[:50]

        dist = _risk_distribution(records)

        descriptions = {
            "deforestation": "Vegetation-loss detection using NDVI (Normalized Difference Vegetation Index) change analysis across multi-year Sentinel-2 composites.",
            "mining": "Potential mining-related surface disturbance detection using NDBI (Normalized Difference Built-up Index) increase combined with NDVI decline.",
            "flood": "Water-extent change monitoring using NDWI (Normalized Difference Water Index) analysis across multi-year Sentinel-2 composites.",
        }

        avg_change = np.mean([r["change_value"] for r in records]) if records else 0.0
        avg_risk = np.mean([r["risk_score"] for r in records]) if records else 0.0

        return {
            "summary": {
                "module": module,
                "description": descriptions.get(module, ""),
                "total_points": len(records),
                "monitored_area_km2": round(len(records) * 0.015, 2),
                "affected_area_km2": round(sum(1 for r in records if r["risk_score"] >= 40) * 0.015, 2),
                "high_risk_zones": dist["high"],
                "medium_risk_zones": dist["medium"],
                "low_risk_zones": dist["low"],
                "avg_change": round(float(avg_change), 4),
                "avg_risk_score": round(float(avg_risk), 1),
                "risk_distribution": dist,
            },
            "hotspots": sorted(records, key=lambda r: r["risk_score"], reverse=True),
            "trends": self._trends_cache.get(module, []),
            "risk_distribution": dist,
        }

    def get_hotspots(
        self,
        module: Optional[str] = None,
        limit: int = 100,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lng: Optional[float] = None,
        max_lng: Optional[float] = None,
        region: Optional[str] = None,
    ) -> List[Dict]:
        """Get top hotspots, optionally filtered by module and AOI."""
        self.load()
        if module:
            cache_map = {
                "deforestation": self._deforestation_cache,
                "mining": self._mining_cache,
                "flood": self._flood_cache,
            }
            records = cache_map.get(module, [])
        else:
            records = self._deforestation_cache + self._mining_cache + self._flood_cache

        has_filter = any(v is not None for v in [min_lat, max_lat, min_lng, max_lng]) or bool(region and region.lower() not in ("all", "all region", "entire study area"))
        records = self._filter_records(records, min_lat, max_lat, min_lng, max_lng, region)
        if not records and not has_filter:
            records = self._deforestation_cache[:limit]

        # Sort by risk score descending, with change magnitude as secondary tie-breaker
        return sorted(
            records,
            key=lambda r: (r["risk_score"], abs(r["change_value"])),
            reverse=True,
        )[:limit]

    def get_trends(self) -> Dict:
        self.load()
        return self._trends_cache

    def get_all_points(self, module: str) -> List[Dict]:
        """Get all data points for a module (for map display)."""
        self.load()
        cache_map = {
            "deforestation": self._deforestation_cache,
            "mining": self._mining_cache,
            "flood": self._flood_cache,
        }
        return cache_map.get(module, [])


def _risk_distribution(records: List[Dict]) -> Dict:
    """Count records in each risk level."""
    low = sum(1 for r in records if r["risk_level"] == "Low")
    med = sum(1 for r in records if r["risk_level"] == "Medium")
    high = sum(1 for r in records if r["risk_level"] == "High")
    return {"low": low, "medium": med, "high": high}


# ── Singleton instance ─────────────────────────────────────────────────
demo_data = DemoDataService()
