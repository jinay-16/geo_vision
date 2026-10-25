import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiPost } from '../api/client';
import UserDataManager from '../components/UserDataManager';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import StatCard from '../components/StatCard';
import MapView from '../components/MapView';
import TrendChart from '../components/TrendChart';
import RiskDistributionChart from '../components/RiskDistributionChart';
import HotspotTable from '../components/HotspotTable';

const DEFORESTATION_PRESETS = [
  {
    name: 'Mulshi Watershed & Forest Foothills (Pune Pilot Example)',
    desc: 'Dense Western Ghats canopy buffer subject to seasonal shifts and infrastructure pressure',
    coords: [
      [73.48, 18.48],
      [73.56, 18.48],
      [73.56, 18.55],
      [73.48, 18.55],
      [73.48, 18.48],
    ],
  },
  {
    name: 'Sinhagad Ecological Sanctuary & Ridge (Pune Pilot Example)',
    desc: 'Steep montane forest corridor with seasonal canopy variation and agro-forestry edges',
    coords: [
      [73.73, 18.34],
      [73.80, 18.34],
      [73.80, 18.40],
      [73.73, 18.40],
      [73.73, 18.34],
    ],
  },
  {
    name: 'Tamhini Ghat Western Slopes (Pune Pilot Example)',
    desc: 'Evergreen montane rainforest fringe with intense monsoon cloud cover',
    coords: [
      [73.38, 18.42],
      [73.46, 18.42],
      [73.46, 18.50],
      [73.38, 18.50],
      [73.38, 18.42],
    ],
  },
  {
    name: 'Jim Corbett Tiger Reserve Buffer (Uttarakhand Example)',
    desc: 'Northern Himalayan foothills dense sal forest canopy & riverine vegetation corridor',
    coords: [
      [78.75, 29.50],
      [78.85, 29.50],
      [78.85, 29.58],
      [78.75, 29.58],
      [78.75, 29.50],
    ],
  },
  {
    name: 'Sundarbans Mangrove Fringe (West Bengal Example)',
    desc: 'Dynamic estuarine mangrove canopy interface subject to cyclonic salinity shifts',
    coords: [
      [88.80, 21.85],
      [88.92, 21.95],
      [88.80, 21.95],
      [88.80, 21.85],
    ],
  },
  {
    name: 'Anamalai Rainforest Corridor (Tamil Nadu Example)',
    desc: 'Southern Western Ghats moist tropical canopy and agro-forestry fringe',
    coords: [
      [76.85, 10.35],
      [76.95, 10.35],
      [76.95, 10.45],
      [76.85, 10.45],
      [76.85, 10.35],
    ],
  },
];

const computeBoundingBox = (lat, lng, radiusKm) => {
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const minLat = Math.round((lat - dLat) * 10000) / 10000;
  const maxLat = Math.round((lat + dLat) * 10000) / 10000;
  const minLng = Math.round((lng - dLng) * 10000) / 10000;
  const maxLng = Math.round((lng + dLng) * 10000) / 10000;
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
};

export default function Deforestation() {
  const [activeTab, setActiveTab] = useState('pilot'); // 'pilot' | 'live_aoi'

  // Pilot Reference Data
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live Dual-Sensor AOI Analysis State
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [locationMode, setLocationMode] = useState('preset'); // 'preset' | 'custom' | 'polygon'
  const [customLat, setCustomLat] = useState('29.5300');
  const [customLng, setCustomLng] = useState('78.8000');
  const [customRadiusKm, setCustomRadiusKm] = useState(5);
  const [customName, setCustomName] = useState('Jim Corbett Buffer Test AOI');
  const [customPolygonText, setCustomPolygonText] = useState(
    JSON.stringify(
      {
        type: 'Polygon',
        coordinates: [
          [
            [78.75, 29.50],
            [78.85, 29.50],
            [78.85, 29.58],
            [78.75, 29.58],
            [78.75, 29.50],
          ],
        ],
      },
      null,
      2
    )
  );
  const [startYear, setStartYear] = useState(2023);
  const [endYear, setEndYear] = useState(2026);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [liveResult, setLiveResult] = useState(null);

  const fetchPilotData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await apiFetch('/deforestation');
      if (err) { setError(err); return; }
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load deforestation data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPilotData(); }, []);

  const handleRunLiveAnalysis = async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      let geom, regionName;
      if (locationMode === 'polygon') {
        let parsed;
        try {
          parsed = JSON.parse(customPolygonText.trim());
        } catch {
          throw new Error('Invalid JSON format. Please provide valid GeoJSON Polygon or coordinates array.');
        }
        if (parsed.type === 'FeatureCollection' && parsed.features?.[0]?.geometry) {
          geom = parsed.features[0].geometry;
        } else if (parsed.type === 'Feature' && parsed.geometry) {
          geom = parsed.geometry;
        } else if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates)) {
          geom = parsed;
        } else if (Array.isArray(parsed)) {
          const coords = Array.isArray(parsed[0][0]) ? parsed : [parsed];
          geom = { type: 'Polygon', coordinates: coords };
        } else {
          throw new Error('Unsupported geometry format. Please provide a valid Polygon GeoJSON.');
        }
        const ring = geom.coordinates?.[0];
        if (!ring || ring.length < 3) throw new Error('Polygon must contain at least 3 coordinate vertices.');
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push([ring[0][0], ring[0][1]]);
        }
        regionName = customName.trim() || `Custom Polygon Forest AOI (${ring.length - 1} vertices)`;
      } else if (locationMode === 'custom') {
        const lat = parseFloat(customLat);
        const lng = parseFloat(customLng);
        const rad = parseFloat(customRadiusKm) || 5;
        if (isNaN(lat) || isNaN(lng) || lat < 6 || lat > 38 || lng < 68 || lng > 98) {
          throw new Error('Please enter valid coordinates within India / target extent (Latitude 6°–38°N, Longitude 68°–98°E)');
        }
        const coords = computeBoundingBox(lat, lng, rad);
        geom = { type: 'Polygon', coordinates: [coords] };
        regionName = customName.trim() || `Custom Location (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E, r=${rad}km)`;
      } else {
        const preset = DEFORESTATION_PRESETS[selectedPreset];
        geom = { type: 'Polygon', coordinates: [preset.coords] };
        regionName = preset.name;
      }

      const payload = {
        geometry: geom,
        start_year: Number(startYear),
        end_year: Number(endYear),
        start_month: 1,
        end_month: 4,
        region_name: regionName,
        orbit_pass: 'DESCENDING',
        demo: false,
      };

      const { data: res, error: err } = await apiPost('/deforestation/analyze', payload);
      if (err) {
        setLiveError(err);
      } else {
        setLiveResult(res);
      }
    } catch (err) {
      setLiveError(err.message || 'Live dual-sensor deforestation analysis failed');
    } finally {
      setLiveLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading deforestation data..." />;
  if (error) return <ErrorState message={error} onRetry={fetchPilotData} />;
  if (!data) return null;

  const s = data.summary || {};

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <UserDataManager onDataUpdated={fetchPilotData} />

      {/* Header */}
      <div className="mb-6 mt-2 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">🌳 Deforestation & Vegetation Loss</h1>
          <p className="text-sm text-gray-500 mt-1">
            Dual-Sensor Satellite Intelligence: Sentinel-2 Optical (NDVI vigor) + Sentinel-1 SAR (VH canopy volume scattering)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'pilot' ? (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${data.is_live ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {data.is_live ? 'Live Observation' : 'Reference / Pilot Data'}
            </span>
          ) : (
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${liveResult?.is_live ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
              {liveResult?.is_live ? 'Live Dual-Sensor GEE Active' : 'Live AOI Query Ready'}
            </span>
          )}
          <span className="text-xs text-gray-400 font-mono hidden sm:inline" title={data.source}>
            {data.source ? `Source: ${data.source.substring(0, 32)}...` : ''}
          </span>
        </div>
      </div>

      {/* Mode Navigation Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('pilot')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'pilot'
              ? 'border-green-600 text-green-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📍 Pune Reference Pilot (2023–2026 Hotspots)
        </button>
        <button
          onClick={() => setActiveTab('live_aoi')}
          className={`pb-3 px-1 border-b-2 transition-colors ${
            activeTab === 'live_aoi'
              ? 'border-green-600 text-green-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🛰️ Live Dual-Sensor AOI Analysis (Sentinel-1 SAR + Sentinel-2)
        </button>
      </div>

      {/* TAB 1: PILOT REFERENCE VIEW */}
      {activeTab === 'pilot' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Monitored Points" value={s.total_points?.toLocaleString()} icon="📍" color="gray" />
            <StatCard title="High Risk Zones" value={s.high_risk_zones} icon="🔴" color="red" />
            <StatCard title="Medium Risk Zones" value={s.medium_risk_zones} icon="🟡" color="yellow" />
            <StatCard
              title="Avg NDVI Change"
              value={s.avg_change?.toFixed(4)}
              icon="📉"
              color="green"
              subtitle={s.avg_change < 0 ? 'Vegetation declining' : 'Stable'}
            />
          </div>

          {/* Map + Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2">
              <MapView hotspots={data.hotspots || []} isDemo={data.is_demo ?? true} height="400px" defaultLayer="ndvi_change" />
            </div>
            <RiskDistributionChart distribution={data.risk_distribution} title="Deforestation Risk Distribution" />
          </div>

          {/* Trend */}
          <div className="mb-6">
            <TrendChart data={data.trends || []} title="NDVI Trend (Mean Vegetation Index)" color="#22c55e" dataKey="value" />
          </div>

          {/* Hotspot Table */}
          <HotspotTable hotspots={data.hotspots || []} title="Top Deforestation Hotspots" />

          {/* Methodology */}
          <div className="mt-4 p-4 bg-green-50 border border-green-100 rounded-lg text-xs text-green-800">
            <strong>Methodology:</strong> {data.methodology}
          </div>
          <div className="mt-2 p-4 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800 mb-6">
            <strong>Limitations:</strong> {data.limitations}
          </div>
        </>
      )}

      {/* TAB 2: LIVE DUAL-SENSOR AOI ANALYSIS */}
      {activeTab === 'live_aoi' && (
        <div>
          {/* Controls Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  Select Forest / Canopy Area of Interest & Comparison Period
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Analyze arbitrary forest canopies across India using benchmark presets or custom coordinates.
                </p>
              </div>
              <Link
                to="/aoi?module=deforestation"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-2xs"
              >
                <span>✏️ Draw Arbitrary AOI on Map Studio</span>
                <span>↗</span>
              </Link>
            </div>

            {/* Location Mode Toggle */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs font-medium text-gray-600">Location Selector:</span>
              <button
                type="button"
                onClick={() => setLocationMode('preset')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all ${
                  locationMode === 'preset'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                📍 Presets (Pune Examples & India Benchmark Sites)
              </button>
              <button
                type="button"
                onClick={() => setLocationMode('custom')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all ${
                  locationMode === 'custom'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🌐 Coordinates & Radius (Lat, Lng, Extent)
              </button>
              <button
                type="button"
                onClick={() => setLocationMode('polygon')}
                className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all ${
                  locationMode === 'polygon'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🔷 Custom Polygon / GeoJSON
              </button>
            </div>

            {locationMode === 'preset' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target Area of Interest</label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => setSelectedPreset(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                  >
                    {DEFORESTATION_PRESETS.map((p, idx) => (
                      <option key={idx} value={idx}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{DEFORESTATION_PRESETS[selectedPreset].desc}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Baseline Reference Year</label>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                  >
                    <option value={2023}>2023 (Baseline Composite)</option>
                    <option value={2024}>2024</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Target Comparison Year</label>
                  <select
                    value={endYear}
                    onChange={(e) => setEndYear(Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                  >
                    <option value={2026}>2026 (Current Assessment)</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                  </select>
                </div>
              </div>
            )}

            {locationMode === 'custom' && (
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-gray-50/80 p-3.5 rounded-xl border border-gray-200">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Latitude (°N)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={customLat}
                      onChange={(e) => setCustomLat(e.target.value)}
                      placeholder="e.g. 29.5300"
                      className="w-full text-sm border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">India bounds: 6.0° to 38.0°N</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Longitude (°E)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={customLng}
                      onChange={(e) => setCustomLng(e.target.value)}
                      placeholder="e.g. 78.8000"
                      className="w-full text-sm border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">India bounds: 68.0° to 98.0°E</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Radius / Extent (km)</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={customRadiusKm}
                      onChange={(e) => setCustomRadiusKm(e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Bounding box half-width</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Custom Location Name</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Jim Corbett Buffer"
                      className="w-full text-sm border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-green-500"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">Descriptive label for results</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Baseline Reference Year</label>
                    <select
                      value={startYear}
                      onChange={(e) => setStartYear(Number(e.target.value))}
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                    >
                      <option value={2023}>2023 (Baseline Composite)</option>
                      <option value={2024}>2024</option>
                      <option value={2025}>2025</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Target Comparison Year</label>
                    <select
                      value={endYear}
                      onChange={(e) => setEndYear(Number(e.target.value))}
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                    >
                      <option value={2026}>2026 (Current Assessment)</option>
                      <option value={2025}>2025</option>
                      <option value={2024}>2024</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {locationMode === 'polygon' && (
              <div className="space-y-3 mb-4">
                <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Custom Location / Study Area Name
                    </label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. Sundarbans Fringe Polygon AOI"
                      className="w-full text-sm border border-gray-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      GeoJSON Polygon or Coordinate Ring Array [[[lng, lat], ...]]
                    </label>
                    <textarea
                      rows={5}
                      value={customPolygonText}
                      onChange={(e) => setCustomPolygonText(e.target.value)}
                      placeholder='{"type": "Polygon", "coordinates": [[[78.75, 29.50], [78.85, 29.50], ...]]}'
                      className="w-full font-mono text-xs border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-green-500 leading-relaxed"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Provide valid GeoJSON Polygon with [longitude, latitude] coordinate pairs in WGS84.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Baseline Reference Year</label>
                    <select
                      value={startYear}
                      onChange={(e) => setStartYear(Number(e.target.value))}
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                    >
                      <option value={2023}>2023 (Baseline Composite)</option>
                      <option value={2024}>2024</option>
                      <option value={2025}>2025</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Target Comparison Year</label>
                    <select
                      value={endYear}
                      onChange={(e) => setEndYear(Number(e.target.value))}
                      className="w-full text-sm border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500"
                    >
                      <option value={2026}>2026 (Current Assessment)</option>
                      <option value={2025}>2025</option>
                      <option value={2024}>2024</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Queries Sentinel-1 GRD (IW C-Band VH volume scattering) and Sentinel-2 Level-2A (NDVI canopy vigor) via GEE.
              </div>
              <button
                onClick={handleRunLiveAnalysis}
                disabled={liveLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-sm rounded-lg shadow-sm transition-all flex items-center gap-2"
              >
                {liveLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Extracting Satellite Imagery...
                  </>
                ) : (
                  '🚀 Run Live Dual-Sensor Analysis'
                )}
              </button>
            </div>
          </div>

          {liveError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-6">
              <strong>Live Analysis Error:</strong> {liveError}
            </div>
          )}

          {/* Live Analysis Results Display */}
          {liveResult && (
            <div>
              {/* Provisional Findings Disclosure */}
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3.5 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  <span>
                    <strong>Provisional Satellite Screening Finding:</strong> Canopy loss indicators across non-pilot sites are provisional change candidates. Ground-truth field verification is required before concluding legal deforestation.
                  </span>
                </div>
                <Link
                  to="/aoi?module=deforestation"
                  className="px-3 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-lg font-bold shrink-0 shadow-2xs"
                >
                  Inspect in Studio ↗
                </Link>
              </div>

              {/* Provenance & Sensor Status Ribbon */}
              <div className="bg-slate-900 text-white rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4 shadow-md">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      LIVE OBSERVATION
                    </span>
                    <span className="text-xs text-slate-300 font-mono">
                      {liveResult.region_name} • {liveResult.geometry_area_km2} km²
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    Data Source: {liveResult.source}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Sentinel-1 SAR Status */}
                  <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                    <span className="text-cyan-400 font-semibold">📡 Sentinel-1 SAR:</span>{' '}
                    {liveResult.sensor_status.s1_available
                      ? `${liveResult.sensor_status.s1_scene_count_eval} scenes (VH Volume Scattering)`
                      : 'Unavailable'}
                  </div>
                  {/* Sentinel-2 Optical Status */}
                  <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                    <span className="text-emerald-400 font-semibold">🛰️ Sentinel-2 Optical:</span>{' '}
                    {liveResult.sensor_status.s2_available
                      ? `${liveResult.sensor_status.s2_scene_count_eval} scenes (Cloud Score+ filtered)`
                      : 'Cloud Obscured'}
                  </div>
                  {/* Fusion State */}
                  <div className="bg-emerald-900/60 text-emerald-200 px-3 py-1.5 rounded-lg border border-emerald-500/40 font-medium">
                    ⚡ {liveResult.sensor_status.fusion_status === 'both_available' ? 'Dual-Sensor Fusion Active' : 'Single-Sensor Fallback'}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard
                  title="Vegetation Loss Candidate Area"
                  value={`${liveResult.affected_area_km2} km²`}
                  icon="📉"
                  color={liveResult.affected_area_km2 > 0.5 ? 'red' : 'yellow'}
                  subtitle="Meeting loss criteria"
                />
                <StatCard
                  title="Coincident Canopy & Structure Drop"
                  value={`${liveResult.fusion_metrics?.deforestation?.coincident_canopy_structure_loss_km2 ?? 0} km²`}
                  icon="🌲"
                  color="green"
                  subtitle="Both NDVI & SAR VH drop"
                />
                <StatCard
                  title="Valid Observed Area"
                  value={`${liveResult.valid_observed_area_km2} km²`}
                  icon="📐"
                  color="gray"
                  subtitle={`${liveResult.coverage_percentage}% total coverage`}
                />
                <StatCard
                  title="Coincident Agreement"
                  value={
                    liveResult.fusion_metrics?.deforestation?.agreement_ratio !== undefined
                      ? `${Math.round(liveResult.fusion_metrics.deforestation.agreement_ratio * 100)}%`
                      : 'Single Sensor'
                  }
                  icon="🤝"
                  color="green"
                  subtitle="Multi-sensor corroboration"
                />
              </div>

              {/* Map View with Clipped Raster Tiles */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Live Satellite Raster Overlay — {liveResult.region_name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Examine optical NDVI decline delta alongside radar all-weather surface layers
                    </p>
                  </div>
                </div>
                <MapView
                  hotspots={[]}
                  isDemo={false}
                  height="450px"
                  defaultLayer="ndvi_change"
                  tileLayers={liveResult.tile_layers}
                />
              </div>

              {/* Sensor Comparison Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span>📡</span> Sentinel-1 SAR (Canopy Structure & Biomass)
                  </h4>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Structural Loss Area (&Delta;VH &le; -2.0 dB):</span>
                      <strong className="text-gray-900">{liveResult.s1_metrics?.sar_structural_loss_km2 ?? 'N/A'} km²</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Mean VH Cross-Polarization Shift:</span>
                      <strong className="text-gray-900">{liveResult.s1_metrics?.vh_change_db ?? 'N/A'} dB</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Mean Baseline VH Backscatter:</span>
                      <strong className="text-gray-900">{liveResult.s1_metrics?.vh_mean_base_db ?? 'N/A'} dB</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Orbit Geometry:</span>
                      <strong className="text-gray-900">{liveResult.sensor_status.orbit_pass || 'Descending'}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <span>🛰️</span> Sentinel-2 Optical (Photosynthetic Vigor)
                  </h4>
                  <div className="space-y-2 text-xs text-gray-600">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Canopy Loss Area (NDVI_base &ge; 0.4 & &Delta;NDVI &le; -0.2):</span>
                      <strong className="text-gray-900">{liveResult.s2_metrics?.optical_vegetation_loss_km2 ?? 'N/A'} km²</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Mean NDVI Change:</span>
                      <strong className="text-gray-900">{liveResult.s2_metrics?.ndvi_change ?? 'N/A'}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Baseline Mean NDVI:</span>
                      <strong className="text-gray-900">{liveResult.s2_metrics?.ndvi_base ?? 'N/A'}</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Cloud Score+ Clear Threshold:</span>
                      <strong className="text-gray-900">cs_cdf &ge; 0.60</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scientific Caveats & Definitions */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2 mb-6">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <span>⚠</span> Scientific Qualification & Operational Disclaimers
                </div>
                <p>
                  <strong>1. Potential Vegetation Loss vs Confirmed Deforestation:</strong> Do not equate an NDVI decrease or radar VH drop with confirmed illegal deforestation. Agricultural crop harvesting, seasonal dry-period canopy shedding, controlled burning, and drought produce similar spectral and radar signals.
                </p>
                <p>
                  <strong>2. Terminology:</strong> Identified locations are classified as <em>"potential vegetation loss candidates"</em> defining priority inspection zones requiring ground-truth field verification.
                </p>
                <p>
                  <strong>3. Ground-Truth Notice:</strong> No independently verified ground-truth training or validation data is asserted for this specific live run without official cadastral/ground survey corroboration.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
