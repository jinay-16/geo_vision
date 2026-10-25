import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api/client';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import StatCard from '../components/StatCard';
import RiskBadge from '../components/RiskBadge';
import HotspotTable from '../components/HotspotTable';
import MapView from '../components/MapView';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SEASON_PRESETS = [
  { label: 'Dry Season (Jan–Apr)', start: 1, end: 4 },
  { label: 'Monsoon (Jun–Sep)', start: 6, end: 9 },
  { label: 'Post-Monsoon (Oct–Dec)', start: 10, end: 12 },
  { label: 'Annual Window (Jan–Dec)', start: 1, end: 12 },
];

const LOCATION_PRESETS = [
  { label: 'Pune Pilot Study Area (Default Baseline Example)', lat: 18.5204, lng: 73.8567, radius: 5.0, isDefault: true },
  { label: 'Jim Corbett National Park Buffer (Uttarakhand)', lat: 29.5300, lng: 78.8000, radius: 5.0, isDefault: false },
  { label: 'Sundarbans Biosphere Fringe (West Bengal)', lat: 21.9400, lng: 88.8900, radius: 5.0, isDefault: false },
  { label: 'Western Ghats Anamalai Foothills (Tamil Nadu)', lat: 10.3300, lng: 76.9500, radius: 5.0, isDefault: false },
  { label: 'Custom Geographic Coordinates (User-Defined)', lat: 18.5204, lng: 73.8567, radius: 5.0, isDefault: false },
];

export default function TemporalAnalysis() {
  const [startYear, setStartYear] = useState(2023);
  const [endYear, setEndYear] = useState(2026);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(4);
  const [selectedModule, setSelectedModule] = useState('all');

  // Location & Spatial Radius Parameters
  const [locationPresetIdx, setLocationPresetIdx] = useState(0);
  const [lat, setLat] = useState(18.5204);
  const [lng, setLng] = useState(73.8567);
  const [radiusKm, setRadiusKm] = useState(5.0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // In-flight request cancellation and race condition prevention
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef(null);

  const fetchAnalysis = async (overrides = {}) => {
    // 1. Safely abort prior in-flight request so newer request takes precedence
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Track sequential request ID to guarantee stale responses never overwrite newer ones
    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);
    try {
      const qStartYear = overrides.startYear ?? startYear;
      const qEndYear = overrides.endYear ?? endYear;
      const qStartMonth = overrides.startMonth ?? startMonth;
      const qEndMonth = overrides.endMonth ?? endMonth;
      const qModule = overrides.module ?? selectedModule;
      const qLat = overrides.lat ?? lat;
      const qLng = overrides.lng ?? lng;
      const qRadius = overrides.radius ?? radiusKm;

      const query = `/analysis/temporal?start_year=${qStartYear}&end_year=${qEndYear}&start_month=${qStartMonth}&end_month=${qEndMonth}&module=${qModule}&lat=${qLat}&lng=${qLng}&radius_km=${qRadius}`;
      const { data: res, error: err, isAborted, isTimeout } = await apiFetch(query, {
        signal: controller.signal,
        timeout: 90000,
      });

      // If a newer request has started, discard this result silently
      if (currentRequestId !== requestIdRef.current) {
        return;
      }

      if (err) {
        // If aborted because a newer request superseded it, ignore
        if (isAborted && !isTimeout) {
          return;
        }
        setError(err);
        return;
      }
      setData(res);
    } catch (err) {
      if (currentRequestId === requestIdRef.current) {
        setError(err.message || 'Failed to complete temporal analysis');
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAnalysis();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handlePresetSelect = (preset) => {
    setStartMonth(preset.start);
    setEndMonth(preset.end);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    fetchAnalysis({ startMonth: preset.start, endMonth: preset.end });
  };

  const handleLocationPresetChange = (idx) => {
    setLocationPresetIdx(idx);
    const chosen = LOCATION_PRESETS[idx];
    if (chosen && idx !== LOCATION_PRESETS.length - 1) {
      setLat(chosen.lat);
      setLng(chosen.lng);
      setRadiusKm(chosen.radius);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      fetchAnalysis({ lat: chosen.lat, lng: chosen.lng, radius: chosen.radius });
    }
  };

  const handleMapLocationChange = ({ lat: newLat, lng: newLng }) => {
    setLat(newLat);
    setLng(newLng);
    setLocationPresetIdx(LOCATION_PRESETS.length - 1);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      fetchAnalysis({ lat: newLat, lng: newLng });
    }, 400);
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-surface-900">
              📈 Multi-Temporal Satellite Analysis
            </h1>
            {data?.is_live ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Live Earth Engine Data
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Demonstration Mode
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Analyze environmental shifts from a baseline year to comparison year, with year-over-year progression and monthly seasonal breakdowns across arbitrary locations in India.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-gray-100 font-mono text-gray-700">
              📍 Target: {data?.summary?.region || `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`} (Radius: {data?.summary?.radius_km ?? radiusKm} km)
            </span>
            {data?.summary?.is_default_location ? (
              <span className="text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                ℹ️ Default Pune Baseline Active (5.0 km) — Select Custom Coordinates or Radius to Analyze Other Sites
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                ✓ Custom AOI Active ({data?.summary?.target_coordinates?.lat?.toFixed(4) || lat.toFixed(4)}°N, {data?.summary?.target_coordinates?.lng?.toFixed(4) || lng.toFixed(4)}°E, r={data?.summary?.radius_km ?? radiusKm} km)
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          <span className="text-xs text-gray-400 block">Observation Window: {startYear} (M{String(startMonth).padStart(2, '0')}) → {endYear} (M{String(endMonth).padStart(2, '0')})</span>
          <span className="text-xs font-medium text-gray-600 block mt-0.5">
            Sensor: {data?.is_live ? 'Sentinel-2 Level-2A (ESA/Copernicus)' : 'GeoVision Pilot Reference Dataset'}
          </span>
        </div>
      </div>

      {/* Interactive Controls Card */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-4">
        {/* Section 1: Location & Coordinates */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              📍 Target Location & Spatial Radius
            </h2>
            <div className="text-xs text-brand-600 bg-brand-50 px-2.5 py-1 rounded-md border border-brand-200 flex items-center gap-1.5">
              <span>📍</span> Click anywhere on map or drag pin to choose coordinates interactively
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Location Preset (Optional Examples)</label>
              <select
                value={locationPresetIdx}
                onChange={(e) => handleLocationPresetChange(Number(e.target.value))}
                className="w-full bg-surface-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {LOCATION_PRESETS.map((p, idx) => (
                  <option key={idx} value={idx}>
                    {p.label}
                  </option>
                ))}
              </select>
              {locationPresetIdx === 0 ? (
                <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-1">
                  ℹ️ Optional Preset Active: Pune Pilot Baseline (Disclosed Default) — Enter coordinates or pick on map to analyze other regions across India.
                </p>
              ) : (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 mt-1">
                  ✓ Custom Region Active: {lat.toFixed(4)}°N, {lng.toFixed(4)}°E (Radius: {radiusKm} km)
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Center Latitude (°N)</label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => {
                  setLat(Number(e.target.value));
                  setLocationPresetIdx(LOCATION_PRESETS.length - 1);
                }}
                className="w-full bg-surface-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">India extent: 6.0°–38.0°N</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Center Longitude (°E)</label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => {
                  setLng(Number(e.target.value));
                  setLocationPresetIdx(LOCATION_PRESETS.length - 1);
                }}
                className="w-full bg-surface-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">India extent: 68.0°–98.0°E</p>
            </div>
          </div>
        </div>

        {/* Section 2: Temporal Parameters & Action */}
        <div className="pt-3 border-t border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            ⚙️ Temporal Window & Indicator Parameters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            {/* Year Range */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Baseline Year (Start)</label>
              <select
                value={startYear}
                onChange={(e) => setStartYear(Number(e.target.value))}
                className="w-full bg-surface-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {[2019, 2020, 2021, 2022, 2023, 2024, 2025].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === 2023 ? '(Baseline)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comparison Year (End)</label>
              <select
                value={endYear}
                onChange={(e) => setEndYear(Number(e.target.value))}
                className="w-full bg-surface-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr} {yr === 2026 ? '(Current State)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Month Window */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Seasonal Window</label>
              <div className="flex items-center gap-1">
                <select
                  value={startMonth}
                  onChange={(e) => setStartMonth(Number(e.target.value))}
                  className="w-1/2 bg-surface-50 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m.slice(0, 3)}
                    </option>
                  ))}
                </select>
                <span className="text-gray-400 text-xs font-bold">to</span>
                <select
                  value={endMonth}
                  onChange={(e) => setEndMonth(Number(e.target.value))}
                  className="w-1/2 bg-surface-50 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {MONTH_NAMES.map((m, idx) => (
                    <option key={m} value={idx + 1}>
                      {m.slice(0, 3)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Analysis Radius */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Analysis Radius</label>
              <select
                value={radiusKm}
                onChange={(e) => {
                  const newRadius = Number(e.target.value);
                  setRadiusKm(newRadius);
                  fetchAnalysis({ radius: newRadius });
                }}
                className="w-full bg-surface-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              >
                <option value={1.0}>1.0 km (Local Site ~3.1 km²)</option>
                <option value={3.0}>3.0 km (Sector ~28.3 km²)</option>
                <option value={5.0}>5.0 km (District ~78.5 km²)</option>
                <option value={10.0}>10.0 km (Regional ~314.2 km²)</option>
                <option value={15.0}>15.0 km (Watershed ~706.9 km²)</option>
                <option value={20.0}>20.0 km (Sub-basin ~1,256.6 km²)</option>
                <option value={25.0}>25.0 km (Landscape ~1,963.5 km²)</option>
              </select>
            </div>

            {/* Action Button */}
            <div>
              <button
                onClick={fetchAnalysis}
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <span>🛰️</span> Run Analysis
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Season Presets Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs text-gray-400 font-medium">Quick Seasonal Presets:</span>
          {SEASON_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetSelect(preset)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors border ${
                startMonth === preset.start && endMonth === preset.end
                  ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingState message="Processing multi-temporal Sentinel-2 satellite data..." />}
      {error && <ErrorState message={error} onRetry={fetchAnalysis} />}

      {!loading && !error && data && (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title={`Vegetation Shift (${data.summary.start_year}→${data.summary.end_year})`}
              value={data.summary.net_ndvi_change != null ? `${data.summary.net_ndvi_change > 0 ? '+' : ''}${data.summary.net_ndvi_change.toFixed(4)}` : 'N/A'}
              subtitle={`Est. Area: ${data.summary.vegetation_loss_km2 ?? 0} km² affected`}
              icon="🌳"
              color={(data.summary.net_ndvi_change ?? 0) < -0.05 ? 'red' : 'green'}
            />
            <StatCard
              title="Surface Disturbance"
              value={data.summary.net_ndbi_change != null ? `${data.summary.net_ndbi_change > 0 ? '+' : ''}${data.summary.net_ndbi_change.toFixed(4)}` : 'N/A'}
              subtitle={`Est. Disturbed: ${data.summary.disturbance_km2 ?? 0} km²`}
              icon="⛏️"
              color={(data.summary.net_ndbi_change ?? 0) > 0.05 ? 'yellow' : 'blue'}
            />
            <StatCard
              title="Water-Extent Delta"
              value={data.summary.net_ndwi_change != null ? `${data.summary.net_ndwi_change > 0 ? '+' : ''}${data.summary.net_ndwi_change.toFixed(4)}` : 'N/A'}
              subtitle={`Expansion Area: ${data.summary.water_expansion_km2 ?? 0} km²`}
              icon="🌊"
              color={(data.summary.net_ndwi_change ?? 0) > 0.05 ? 'blue' : 'gray'}
            />
            <div className="stat-card bg-white rounded-xl border-l-4 border-purple-500 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Period Risk Level</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xl font-bold text-surface-900">{data.summary.risk_score}</span>
                    <RiskBadge level={data.summary.risk_level} />
                  </div>
                  <p className="text-xs text-amber-600 font-medium mt-1">Field Verification Required</p>
                </div>
                <span className="text-2xl">⚠️</span>
              </div>
            </div>
          </div>

          {/* Live GEE Satellite Map View */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-lg font-bold text-surface-900 flex items-center gap-2">
                  <span>🛰️</span> Multi-Temporal Satellite Raster & Hotspots Map
                </h2>
                <p className="text-sm text-gray-500">
                  Direct Google Earth Engine Sentinel-2 composite overlays comparing {data.summary.start_year} against {data.summary.end_year} ({data.summary.region}).
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="px-2.5 py-1 rounded-md bg-gray-100 font-mono">
                  AOI: {data.summary.region} (AOI Footprint: {data.summary.geometry_area_km2 || data.summary.total_area_km2 || (Math.PI * (data.summary.radius_km || radiusKm) ** 2).toFixed(2)} km²)
                </span>
              </div>
            </div>

            <MapView
              hotspots={data.hotspots || []}
              startYear={startYear}
              endYear={endYear}
              startMonth={startMonth}
              endMonth={endMonth}
              defaultLayer={selectedModule === 'deforestation' ? 'ndvi_change' : selectedModule === 'mining' ? 'disturbance' : selectedModule === 'flood' ? 'water_change' : 'true_color'}
              height="500px"
              isDemo={!data.is_live}
              center={[lat, lng]}
              pinLocation={{ lat, lng, radiusKm: data.summary.radius_km || radiusKm }}
              onLocationChange={handleMapLocationChange}
            />

            {/* Actual Analysis Geometry and Scope Details */}
            <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-slate-700">
              <div>
                <span className="font-semibold block text-slate-900">📍 Center Coordinates:</span>
                <span className="font-mono">
                  {data.summary.target_coordinates?.lat != null
                    ? `${data.summary.target_coordinates.lat.toFixed(4)}°N, ${data.summary.target_coordinates.lng.toFixed(4)}°E`
                    : `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`}
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-900">📐 Radial Footprint:</span>
                <span>
                  {data.summary.radius_km ?? radiusKm} km radius (~{data.summary.geometry_area_km2 || data.summary.total_area_km2 || (Math.PI * (data.summary.radius_km ?? radiusKm) ** 2).toFixed(2)} km² AOI)
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-900">📅 Observation Dates:</span>
                <span>
                  {data.summary.start_year} (M{String(data.summary.start_month || startMonth).padStart(2, '0')}) &rarr; {data.summary.end_year} (M{String(data.summary.end_month || endMonth).padStart(2, '0')})
                </span>
              </div>
              <div>
                <span className="font-semibold block text-slate-900">🛰️ Data Provenance:</span>
                <span>
                  {data.source}
                  {data.summary.metadata?.cached ? ' (Cached Result)' : ''}
                </span>
              </div>
            </div>

            {/* Satellite Index Guide */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className="font-bold text-gray-900 flex items-center gap-1">🛰️ True Color</span>
                <p className="text-gray-500 text-[11px] mt-0.5">Sentinel-2 B4-B3-B2 natural RGB surface appearance.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className="font-bold text-gray-900 flex items-center gap-1">🌿 False Color</span>
                <p className="text-gray-500 text-[11px] mt-0.5">Near-Infrared (B8-B4-B3) highlights active photosynthetic canopy.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                <span className="font-bold text-gray-900 flex items-center gap-1">🌳 NDVI Health</span>
                <p className="text-gray-500 text-[11px] mt-0.5">Normalized Difference Vegetation Index (0.0 to 0.8 scale).</p>
              </div>
              <div className="p-2.5 rounded-lg bg-red-50/60 border border-red-100">
                <span className="font-bold text-red-900 flex items-center gap-1">🔴 Loss Delta</span>
                <p className="text-red-700 text-[11px] mt-0.5">NDVI decrease between {startYear} & {endYear}. Highlights canopy degradation.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-100">
                <span className="font-bold text-amber-900 flex items-center gap-1">⛏️ Disturbance</span>
                <p className="text-amber-700 text-[11px] mt-0.5">NDBI bare soil and excavation expansion between baseline & target.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50/60 border border-blue-100">
                <span className="font-bold text-blue-900 flex items-center gap-1">🌊 Water Delta</span>
                <p className="text-blue-700 text-[11px] mt-0.5">NDWI water expansion delta. Identifies inundation changes.</p>
              </div>
            </div>
          </div>

          {/* Section 1: Year-over-Year Trajectory */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-surface-900">
                  📅 Year-by-Year Multi-Temporal Trajectory
                </h2>
                <p className="text-sm text-gray-500">
                  Annual mean spectral index progression across the selected temporal window ({data.summary.start_year} to {data.summary.end_year}).
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded-full bg-brand-50 text-brand-700 font-medium border border-brand-200">
                {data.yearly_progression.length} Years Tracked
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {data.yearly_progression.map((yrStat) => (
                <div
                  key={yrStat.year}
                  className="bg-surface-50 rounded-xl p-4 border border-gray-200 hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-bold text-surface-900">Year {yrStat.year}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white text-gray-600 font-medium border border-gray-200">
                      {yrStat.scenes_count} scenes
                    </span>
                  </div>

                  <div className="space-y-2 text-sm mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">NDVI (Vegetation):</span>
                      <span className="font-mono font-semibold text-emerald-700">
                        {yrStat.ndvi_mean != null ? yrStat.ndvi_mean.toFixed(4) : <span className="text-gray-400 italic font-normal text-xs">No clear data</span>}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">NDWI (Water):</span>
                      <span className="font-mono font-semibold text-cyan-700">
                        {yrStat.ndwi_mean != null ? yrStat.ndwi_mean.toFixed(4) : <span className="text-gray-400 italic font-normal text-xs">No clear data</span>}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">NDBI (Disturbance):</span>
                      <span className="font-mono font-semibold text-amber-700">
                        {yrStat.ndbi_mean != null ? yrStat.ndbi_mean.toFixed(4) : <span className="text-gray-400 italic font-normal text-xs">No clear data</span>}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between text-xs">
                    <span className="text-gray-400">Canopy Status:</span>
                    <span className="font-medium text-gray-700">{yrStat.vegetation_health}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Month-Wise Seasonal Analysis */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-surface-900">
                  🗓️ Month-Wise Seasonal Anomaly Breakdown
                </h2>
                <p className="text-sm text-gray-500">
                  Compares baseline ({data.summary.start_year}) vs target ({data.summary.end_year}) for each seasonal month to distinguish natural dry cycles from permanent clearing.
                </p>
              </div>
              <span className="text-xs text-gray-400">Resolution: 30m / Multi-spectral</span>
            </div>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead className="bg-surface-50 text-gray-600 text-xs uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Seasonal Month</th>
                    <th className="px-4 py-3 text-center">Baseline ({data.summary.start_year})</th>
                    <th className="px-4 py-3 text-center">Target ({data.summary.end_year})</th>
                    <th className="px-4 py-3 text-center">Net Shift (Δ)</th>
                    <th className="px-4 py-3 text-left">Trajectory Bar</th>
                    <th className="px-4 py-3 text-center">Seasonal Diagnosis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.monthly_breakdown.map((mStat) => {
                    const hasObs = mStat.is_observed && mStat.change_val != null;
                    const isDecline = hasObs && mStat.change_val < 0;
                    const magnitude = hasObs ? Math.min(100, Math.abs(mStat.change_val) * 400) : 0;

                    return (
                      <tr key={mStat.month_num} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-surface-900 flex items-center gap-2">
                          <span className="text-xs text-gray-400">M{mStat.month_num}</span>
                          {mStat.month_name}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-gray-700">
                          {mStat.start_year_val != null ? mStat.start_year_val.toFixed(4) : <span className="text-xs text-gray-400 italic">No clear data</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-gray-700">
                          {mStat.end_year_val != null ? mStat.end_year_val.toFixed(4) : <span className="text-xs text-gray-400 italic">No clear data</span>}
                        </td>
                        <td className="px-4 py-3 text-center font-mono font-semibold">
                          {hasObs ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs ${
                                isDecline ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                              }`}
                            >
                              {mStat.change_val > 0 ? '+' : ''}
                              {mStat.change_val.toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400 italic">N/A (Cloud Masked)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 w-48">
                          {hasObs ? (
                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden flex">
                              {isDecline ? (
                                <div
                                  className="bg-red-500 h-2.5 rounded-full"
                                  style={{ width: `${Math.max(5, magnitude)}%` }}
                                ></div>
                              ) : (
                                <div
                                  className="bg-emerald-500 h-2.5 rounded-full"
                                  style={{ width: `${Math.max(5, magnitude)}%` }}
                                ></div>
                              )}
                            </div>
                          ) : (
                            <div className="w-full bg-gray-100 rounded-full h-2.5 border border-dashed border-gray-200"></div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!hasObs ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                              ☁️ Insufficient Clear Pixels
                            </span>
                          ) : Math.abs(mStat.change_val) > 0.08 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                              Chronic Anomaly
                            </span>
                          ) : Math.abs(mStat.change_val) > 0.03 ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                              Moderate Shift
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                              Expected Seasonal
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Priority Hotspots Detected in Window */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-surface-900">
                📍 Monitored Hotspots for Selected Window
              </h2>
              <span className="text-xs text-gray-400">
                Sorted by priority risk score (Requires Field Verification)
              </span>
            </div>
            <HotspotTable
              hotspots={data.hotspots}
              title={`Hotspot Locations (${data.summary.start_year} - ${data.summary.end_year})`}
            />
          </div>

          {/* Scientific Disclaimer Footer */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-700">Methodology & Scientific Integrity:</p>
            <p>{data.methodology}</p>
            <p className="text-gray-400 mt-1">{data.limitations}</p>
          </div>
        </>
      )}
    </div>
  );
}
