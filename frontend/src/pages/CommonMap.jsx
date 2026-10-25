import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../api/client';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import MapView from '../components/MapView';
import UserDataManager from '../components/UserDataManager';

export default function CommonMap() {
  const [allHotspots, setAllHotspots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moduleFilter, setModuleFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [isDemo, setIsDemo] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await apiFetch('/hotspots?limit=1000');
      if (err) { setError(err); return; }
      setAllHotspots(data?.hotspots || []);
      setIsDemo(data?.is_demo ?? true);
    } catch (err) {
      setError(err.message || 'Failed to load map data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Extract available regions
  const regions = useMemo(() => {
    const set = new Set(allHotspots.map(h => h.region).filter(Boolean));
    return Array.from(set).sort();
  }, [allHotspots]);

  // Apply filters client-side
  const filtered = useMemo(() => {
    return allHotspots.filter(h => {
      if (moduleFilter !== 'all' && h.module !== moduleFilter) return false;
      if (regionFilter !== 'all' && h.region !== regionFilter) return false;
      if (riskFilter !== 'all' && h.risk_level !== riskFilter) return false;
      return true;
    });
  }, [allHotspots, moduleFilter, regionFilter, riskFilter]);

  if (loading) return <LoadingState message="Loading map data..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const modules = [
    { key: 'all', label: 'All Modules', icon: '🗺️' },
    { key: 'deforestation', label: 'Deforestation', icon: '🌳' },
    { key: 'mining', label: 'Mining', icon: '⛏️' },
    { key: 'flood', label: 'Flood', icon: '🌊' },
  ];

  const risks = [
    { key: 'all', label: 'All Risk Levels' },
    { key: 'High', label: '🔴 High' },
    { key: 'Medium', label: '🟡 Medium' },
    { key: 'Low', label: '🟢 Low' },
  ];

  const highCount = filtered.filter(h => h.risk_level === 'High').length;
  const medCount = filtered.filter(h => h.risk_level === 'Medium').length;
  const lowCount = filtered.filter(h => h.risk_level === 'Low').length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <UserDataManager onDataUpdated={fetchData} />

      <div className="mb-4 mt-2">
        <h1 className="text-2xl font-bold text-surface-900">🗺️ Common Map View</h1>
        <p className="text-sm text-gray-500 mt-1">
          Explore all environmental risk hotspots — filter by module, region, or risk level
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Module filter */}
        <div className="flex flex-wrap gap-2">
          {modules.map(f => (
            <button
              key={f.key}
              onClick={() => setModuleFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                moduleFilter === f.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.icon} {f.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 hidden md:block" />

        {/* Region select */}
        <select
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          aria-label="Filter by region"
        >
          <option value="all">All Regions ({regions.length})</option>
          {regions.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Risk filter */}
        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-700 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          aria-label="Filter by risk level"
        >
          {risks.map(r => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-500 bg-surface-50 rounded-lg px-4 py-2.5 border border-gray-100">
        <span>Showing <strong className="text-surface-900">{filtered.length}</strong> of {allHotspots.length} hotspots</span>
        <span className="hidden sm:inline">•</span>
        <span>High: <strong className="text-red-600">{highCount}</strong></span>
        <span>Medium: <strong className="text-amber-600">{medCount}</strong></span>
        <span>Low: <strong className="text-green-600">{lowCount}</strong></span>
        {regionFilter !== 'all' && (
          <>
            <span className="hidden sm:inline">•</span>
            <span>Region: <strong className="text-brand-600">{regionFilter}</strong>
              <button
                onClick={() => setRegionFilter('all')}
                className="ml-1 text-gray-400 hover:text-red-500 text-xs"
                aria-label="Clear region filter"
              >✕</button>
            </span>
          </>
        )}
      </div>

      {/* Full-height map */}
      <MapView hotspots={filtered} isDemo={isDemo} height="calc(100vh - 320px)" />
    </div>
  );
}
