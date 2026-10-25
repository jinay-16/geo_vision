import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';
import UserDataManager from '../components/UserDataManager';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import StatCard from '../components/StatCard';
import ModuleCard from '../components/ModuleCard';
import MapView from '../components/MapView';
import RiskDistributionChart from '../components/RiskDistributionChart';
import HotspotTable from '../components/HotspotTable';

export default function Overview() {
  const [data, setData] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, hotspotsRes] = await Promise.all([
        apiFetch('/overview'),
        apiFetch('/hotspots?limit=200'),
      ]);

      if (overviewRes.error) {
        setError(overviewRes.error);
        setLoading(false);
        return;
      }

      setData(overviewRes.data);
      setHotspots(hotspotsRes.data?.hotspots || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingState message="Loading overview dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;
  if (!data) return <ErrorState message="Overview dashboard data unavailable." onRetry={fetchData} />;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <UserDataManager onDataUpdated={fetchData} />

      {/* Header */}
      <div className="mb-6 mt-2 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Overview Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Environmental risk assessment summary — {data.source}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${data.is_live ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {data.is_live ? 'Live Observation' : 'Reference / Pilot Data'}
          </span>
        </div>
      </div>

      {/* Action Callout Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-r from-brand-600 to-emerald-600 rounded-xl p-4 text-white shadow-sm flex flex-col justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🎯</span>
            <div>
              <h3 className="font-bold text-base">Custom AOI Intelligence</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Click or define custom polygons on the map to extract live Sentinel-2 multispectral bands and run instant ML risk inference.
              </p>
            </div>
          </div>
          <Link
            to="/aoi"
            className="inline-flex items-center gap-2 bg-white text-brand-700 hover:bg-emerald-50 px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm self-start"
          >
            Launch AOI Explorer &rarr;
          </Link>
        </div>

        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 rounded-xl p-4 text-white shadow-sm flex flex-col justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl">📸</span>
            <div>
              <h3 className="font-bold text-base">Field Photo Geotag</h3>
              <p className="text-xs text-indigo-100 mt-0.5">
                Upload any geotagged field photo or drone image to extract GPS EXIF, query Earth Engine satellite data, and verify conditions.
              </p>
            </div>
          </div>
          <Link
            to="/field-photo"
            className="inline-flex items-center gap-2 bg-white text-indigo-800 hover:bg-purple-50 px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm self-start"
          >
            Inspect Field Photo &rarr;
          </Link>
        </div>

        <div className="bg-gradient-to-r from-teal-700 to-cyan-700 rounded-xl p-4 text-white shadow-sm flex flex-col justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-3xl">📈</span>
            <div>
              <h3 className="font-bold text-base">Temporal Analysis</h3>
              <p className="text-xs text-cyan-100 mt-0.5">
                Compare multi-year Sentinel-2 observations (2023 vs 2026) across custom dry/monsoon seasonal windows.
              </p>
            </div>
          </div>
          <Link
            to="/analysis"
            className="inline-flex items-center gap-2 bg-white text-teal-800 hover:bg-cyan-50 px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm self-start"
          >
            Open Temporal Explorer &rarr;
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard title="Monitored Regions" value={data.total_monitored_regions} icon="🌍" color="blue" />
        <StatCard title="Total Points" value={data.total_points?.toLocaleString()} icon="📍" color="gray" />
        <StatCard title="High-Risk Zones" value={data.high_risk_zones} icon="🔴" color="red" />
        <StatCard title="Vegetation Loss" value={data.vegetation_loss_areas} icon="🌳" color="green" subtitle="Areas at risk" />
        <StatCard title="Land Disturbance" value={data.land_disturbance_areas} icon="⛏️" color="yellow" subtitle="Areas at risk" />
        <StatCard title="Flood Risk" value={data.flood_risk_areas} icon="🌊" color="blue" subtitle="Areas at risk" />
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link to="/deforestation" className="block hover:ring-2 hover:ring-brand-200 rounded-xl transition-all">
          <ModuleCard
            title="Deforestation"
            description="Vegetation-loss detection via NDVI"
            icon="🌳"
            color="green"
            stats={data.module_stats?.deforestation || {}}
            avgChange={data.module_changes?.deforestation}
            indicator="ΔNDVI"
          />
        </Link>
        <Link to="/mining" className="block hover:ring-2 hover:ring-brand-200 rounded-xl transition-all">
          <ModuleCard
            title="Mining Disturbance"
            description="Land disturbance via NDBI + NDVI"
            icon="⛏️"
            color="amber"
            stats={data.module_stats?.mining || {}}
            avgChange={data.module_changes?.mining}
            indicator="ΔNDBI"
          />
        </Link>
        <Link to="/flood" className="block hover:ring-2 hover:ring-brand-200 rounded-xl transition-all">
          <ModuleCard
            title="Flood Risk"
            description="Water-extent via NDWI"
            icon="🌊"
            color="blue"
            stats={data.module_stats?.flood || {}}
            avgChange={data.module_changes?.flood}
            indicator="ΔNDWI"
          />
        </Link>
      </div>

      {/* Map + Risk Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2">
          <MapView hotspots={hotspots} isDemo={data.is_demo} height="400px" />
        </div>
        <RiskDistributionChart distribution={data.risk_distribution} title="Overall Risk Distribution" />
      </div>

      {/* Hotspot Table */}
      <HotspotTable hotspots={data.recent_hotspots || []} title="Recent High-Risk Hotspots" />

      {/* Methodology note */}
      <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
        <strong>Methodology:</strong> {data.methodology}
      </div>
      <div className="mt-2 p-4 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-800">
        <strong>Limitations:</strong> {data.limitations}
      </div>
    </div>
  );
}
