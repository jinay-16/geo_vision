import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { apiFetch, downloadPdf, downloadFile, downloadFilePost } from '../api/client';
import UserDataManager from '../components/UserDataManager';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import StatCard from '../components/StatCard';
import RiskBadge from '../components/RiskBadge';

export default function Reports() {
  const location = useLocation();

  // Top-level hooks — guaranteed to run in identical order on every render
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exportModule, setExportModule] = useState('all');
  const [exportRisk, setExportRisk] = useState('all');
  const [previewHotspots, setPreviewHotspots] = useState([]);
  const [downloading, setDownloading] = useState(null); // 'pdf' | 'csv' | 'geojson' | null
  const [downloadMsg, setDownloadMsg] = useState(null);

  // Custom AOI State (read from navigation state or sessionStorage)
  const [aoiData, setAoiData] = useState(() => {
    if (location.state?.aoiReportData) return location.state.aoiReportData;
    try {
      const saved = sessionStorage.getItem('geovision_custom_aoi_report');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const [activeReportTab, setActiveReportTab] = useState(() => {
    if (location.state?.aoiReportData) return 'aoi';
    try {
      if (sessionStorage.getItem('geovision_custom_aoi_report')) return 'aoi';
    } catch {}
    return 'pune';
  });

  // Keep state updated if location state changes
  useEffect(() => {
    if (location.state?.aoiReportData) {
      setAoiData(location.state.aoiReportData);
      setActiveReportTab('aoi');
    }
  }, [location.state]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await apiFetch('/reports/summary');
      if (err) {
        setError(err);
        return;
      }
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load report summary');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreviewHotspots = async () => {
    try {
      const modParam = exportModule !== 'all' ? `module=${exportModule}&` : '';
      const { data: spots } = await apiFetch(`/hotspots?${modParam}limit=25`);
      if (spots && Array.isArray(spots)) {
        let filtered = spots;
        if (exportRisk !== 'all') {
          filtered = spots.filter((s) => s.risk_level?.toLowerCase() === exportRisk.toLowerCase());
        }
        setPreviewHotspots(filtered.slice(0, 10));
      }
    } catch {
      // Non-critical preview failure
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchPreviewHotspots();
  }, [exportModule, exportRisk]);

  // Regional Pune Downloads
  const handleDownloadPdf = async () => {
    setDownloading('pdf');
    setDownloadMsg('Generating multi-temporal PDF audit report...');
    try {
      await downloadPdf(exportModule, exportRisk);
      setDownloadMsg('PDF report generated and downloaded successfully!');
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err) {
      setDownloadMsg(`PDF generation failed: ${err.message}`);
      setTimeout(() => setDownloadMsg(null), 5000);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadCsv = async () => {
    setDownloading('csv');
    setDownloadMsg('Compiling hotspot observations into CSV...');
    try {
      const mod = exportModule !== 'all' ? `module=${exportModule}&` : '';
      const risk = exportRisk !== 'all' ? `risk_level=${exportRisk}&` : '';
      await downloadFile(`/api/export/csv?${mod}${risk}`, `geovision_hotspots_${exportModule}.csv`);
      setDownloadMsg('CSV hotspot dataset downloaded successfully!');
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err) {
      setDownloadMsg(`CSV export failed: ${err.message}`);
      setTimeout(() => setDownloadMsg(null), 5000);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadGeoJson = async () => {
    setDownloading('geojson');
    setDownloadMsg('Packaging GIS FeatureCollection GeoJSON...');
    try {
      const mod = exportModule !== 'all' ? `module=${exportModule}` : '';
      await downloadFile(`/api/export/geojson?${mod}`, `geovision_features_${exportModule}.geojson`);
      setDownloadMsg('GeoJSON layer downloaded successfully!');
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err) {
      setDownloadMsg(`GeoJSON export failed: ${err.message}`);
      setTimeout(() => setDownloadMsg(null), 5000);
    } finally {
      setDownloading(null);
    }
  };

  // Custom AOI Downloads (strictly scoped to user's analyzed polygon)
  const handleDownloadAoiPdf = async () => {
    if (!aoiData) return;
    setDownloading('pdf');
    setDownloadMsg('Compiling custom AOI PDF audit report...');
    try {
      const safeName = (aoiData.region_name || 'aoi').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadFilePost('/api/reports/aoi-pdf', aoiData, `geovision_audit_${safeName}.pdf`);
      setDownloadMsg('Custom AOI PDF audit report downloaded successfully!');
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err) {
      setDownloadMsg(`AOI PDF generation failed: ${err.message}`);
      setTimeout(() => setDownloadMsg(null), 5000);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAoiCsv = async () => {
    if (!aoiData) return;
    setDownloading('csv');
    setDownloadMsg('Exporting custom AOI metrics as CSV...');
    try {
      const safeName = (aoiData.region_name || 'aoi').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadFilePost('/api/export/aoi-csv', aoiData, `geovision_aoi_${safeName}.csv`);
      setDownloadMsg('Custom AOI CSV dataset downloaded successfully!');
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err) {
      setDownloadMsg(`AOI CSV export failed: ${err.message}`);
      setTimeout(() => setDownloadMsg(null), 5000);
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAoiGeoJson = async () => {
    if (!aoiData) return;
    setDownloading('geojson');
    setDownloadMsg('Generating custom AOI GIS GeoJSON...');
    try {
      const safeName = (aoiData.region_name || 'aoi').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadFilePost('/api/export/aoi-geojson', aoiData, `geovision_aoi_${safeName}.geojson`);
      setDownloadMsg('Custom AOI GeoJSON feature collection downloaded successfully!');
      setTimeout(() => setDownloadMsg(null), 4000);
    } catch (err) {
      setDownloadMsg(`AOI GeoJSON export failed: ${err.message}`);
      setTimeout(() => setDownloadMsg(null), 5000);
    } finally {
      setDownloading(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) return <LoadingState message="Loading report data & compliance summary..." />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;
  if (!data) return null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <UserDataManager onDataUpdated={fetchData} />

      {/* Status / Download feedback toast */}
      {downloadMsg && (
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-sm shadow-sm transition-all animate-fade-in ${
            downloadMsg.includes('failed')
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{downloadMsg.includes('failed') ? '❌' : '✅'}</span>
            <span className="font-medium">{downloadMsg}</span>
          </div>
          <button
            onClick={() => setDownloadMsg(null)}
            className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Mode Switcher Tabs: Pune Pilot Baseline vs Custom AOI Report */}
      <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            id="tab-pune-report"
            onClick={() => setActiveReportTab('pune')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeReportTab === 'pune'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-surface-50'
            }`}
          >
            <span>🏛️</span>
            <span>Pune Regional Pilot Report</span>
          </button>

          <button
            id="tab-aoi-report"
            onClick={() => {
              if (aoiData) setActiveReportTab('aoi');
            }}
            disabled={!aoiData}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeReportTab === 'aoi'
                ? 'bg-emerald-600 text-white shadow-sm'
                : aoiData
                ? 'text-gray-600 hover:text-gray-900 hover:bg-surface-50'
                : 'text-gray-400 cursor-not-allowed bg-gray-50'
            }`}
          >
            <span>📍</span>
            <span>
              {aoiData ? `Custom AOI Report: ${aoiData.region_name}` : 'Custom AOI Report (No AOI Analyzed)'}
            </span>
            {aoiData && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                activeReportTab === 'aoi' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {aoiData.area_km2} km²
              </span>
            )}
          </button>
        </div>

        <Link
          to="/aoi"
          className="text-xs font-semibold text-brand-600 hover:text-brand-800 px-3 py-1.5 rounded-lg hover:bg-brand-50 transition-all flex items-center gap-1"
        >
          <span>📐</span>
          <span>{aoiData ? 'Analyze Another AOI' : 'Draw or Select Custom AOI'}</span>
          <span>&rarr;</span>
        </Link>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: CUSTOM AOI REPORT (When activeReportTab === 'aoi')
      ────────────────────────────────────────────────────────────── */}
      {activeReportTab === 'aoi' && aoiData && (
        <div className="space-y-6 animate-fade-in">
          {/* AOI Header & Export Toolbar */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-emerald-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">📍</span>
                <h1 className="text-2xl font-bold text-surface-900">
                  Custom AOI Audit Report: {aoiData.region_name}
                </h1>
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                  aoiData.is_live
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {aoiData.is_live ? '🛰️ Live Satellite Observation' : '📊 Demonstration Mode'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Multi-temporal biophysical intelligence synthesized for <strong>{aoiData.area_km2.toFixed(2)} km²</strong> custom study boundary.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                <span>
                  <strong>Analysis Window:</strong> {aoiData.start_year} – {aoiData.end_year}
                </span>
                <span>·</span>
                <span>
                  <strong>Data Provenance:</strong> {aoiData.source || 'Copernicus Sentinel-2 Level-2A'}
                </span>
                <span>·</span>
                <span>
                  <strong>Generated:</strong> {new Date().toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Custom AOI Export Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                id="aoi-pdf-btn"
                onClick={handleDownloadAoiPdf}
                disabled={downloading === 'pdf'}
                className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                title="Download formal written PDF audit for this custom AOI"
              >
                <span>{downloading === 'pdf' ? '⏳' : '📥'}</span>
                <span>{downloading === 'pdf' ? 'Generating PDF...' : 'Download AOI PDF'}</span>
              </button>

              <button
                id="aoi-csv-btn"
                onClick={handleDownloadAoiCsv}
                disabled={downloading === 'csv'}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                title="Download CSV containing metrics scoped to this AOI"
              >
                <span>{downloading === 'csv' ? '⏳' : '📊'}</span>
                <span>{downloading === 'csv' ? 'Exporting...' : 'AOI CSV Data'}</span>
              </button>

              <button
                id="aoi-geojson-btn"
                onClick={handleDownloadAoiGeoJson}
                disabled={downloading === 'geojson'}
                className="px-4 py-2.5 bg-surface-800 hover:bg-surface-700 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                title="Download GIS GeoJSON containing this AOI polygon boundary"
              >
                <span>{downloading === 'geojson' ? '⏳' : '🗺️'}</span>
                <span>{downloading === 'geojson' ? 'Exporting...' : 'AOI GeoJSON'}</span>
              </button>

              <button
                onClick={handlePrint}
                className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="Print or save as browser PDF"
              >
                <span>🖨️</span>
                <span>Print</span>
              </button>
            </div>
          </div>

          {/* AOI Executive Overview Metrics */}
          <div>
            <h2 className="text-base font-bold text-surface-800 mb-3 flex items-center gap-2">
              <span>📊</span>
              <span>AOI Environmental Risk Summary</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Calculated Risk Score"
                value={`${aoiData.summary?.risk_score || 0} / 100`}
                icon="🎯"
                color={aoiData.summary?.risk_score >= 70 ? 'red' : aoiData.summary?.risk_score >= 40 ? 'yellow' : 'green'}
                description={`Threat Category: ${aoiData.summary?.risk_level || 'Low'} Risk`}
              />
              <StatCard
                title="Vegetation Loss Impact"
                value={`${aoiData.summary?.vegetation_loss_km2 || 0} km²`}
                icon="🌳"
                color="red"
                description={`Net Canopy Delta (ΔNDVI): ${aoiData.summary?.net_ndvi_change > 0 ? '+' : ''}${aoiData.summary?.net_ndvi_change || 0}`}
              />
              <StatCard
                title="Land Disturbance Impact"
                value={`${aoiData.summary?.disturbance_km2 || 0} km²`}
                icon="⛏️"
                color="yellow"
                description={`Bare-Soil Shift (ΔNDBI): ${aoiData.summary?.net_ndbi_change > 0 ? '+' : ''}${aoiData.summary?.net_ndbi_change || 0}`}
              />
              <StatCard
                title="Surface Water Delta"
                value={`${aoiData.summary?.water_expansion_km2 || 0} km²`}
                icon="🌊"
                color="blue"
                description={`Moisture Index (ΔNDWI): ${aoiData.summary?.net_ndwi_change > 0 ? '+' : ''}${aoiData.summary?.net_ndwi_change || 0}`}
              />
            </div>
          </div>

          {/* Three Domain Modules Diagnostics (Scoped to AOI) */}
          <div>
            <h2 className="text-base font-bold text-surface-800 mb-3 flex items-center gap-2">
              <span>🔍</span>
              <span>Domain Hazards Detected Within AOI Boundary</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Deforestation Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                    <span>🌳</span> Deforestation & Canopy Loss
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold">
                    Sentinel-2 NDVI
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Affected Canopy:</span>
                    <strong className="text-gray-900">{aoiData.summary?.vegetation_loss_km2 || 0} km²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Footprint Percentage:</span>
                    <strong className="text-red-600">
                      {aoiData.area_km2 > 0 ? ((aoiData.summary?.vegetation_loss_km2 || 0) / aoiData.area_km2 * 100).toFixed(1) : 0}%
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Net Index Drift:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {aoiData.summary?.net_ndvi_change > 0 ? '+' : ''}{aoiData.summary?.net_ndvi_change || 0}
                    </span>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-gray-800">
                    {(aoiData.summary?.net_ndvi_change || 0) < -0.05 ? 'Active Loss Alert' : 'Contained / Stable'}
                  </span>
                </div>
              </div>

              {/* Mining / Disturbance Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                    <span>⛏️</span> Mining & Land Disturbance
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">
                    Sentinel-2 NDBI
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Excavation / Bare Soil:</span>
                    <strong className="text-gray-900">{aoiData.summary?.disturbance_km2 || 0} km²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Footprint Percentage:</span>
                    <strong className="text-amber-700">
                      {aoiData.area_km2 > 0 ? ((aoiData.summary?.disturbance_km2 || 0) / aoiData.area_km2 * 100).toFixed(1) : 0}%
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Net Soil Index Drift:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {aoiData.summary?.net_ndbi_change > 0 ? '+' : ''}{aoiData.summary?.net_ndbi_change || 0}
                    </span>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-gray-800">
                    {(aoiData.summary?.net_ndbi_change || 0) > 0.03 ? 'Significant Earthworks' : 'Baseline Reflectance'}
                  </span>
                </div>
              </div>

              {/* Flood / Hydrology Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-gray-900 text-sm">
                    <span>🌊</span> Flood & Water Extent
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold">
                    Sentinel-2 NDWI
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Moisture / Water Delta:</span>
                    <strong className="text-gray-900">{aoiData.summary?.water_expansion_km2 || 0} km²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Footprint Percentage:</span>
                    <strong className="text-blue-700">
                      {aoiData.area_km2 > 0 ? ((aoiData.summary?.water_expansion_km2 || 0) / aoiData.area_km2 * 100).toFixed(1) : 0}%
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Net Moisture Drift:</span>
                    <span className="font-mono font-bold text-gray-800">
                      {aoiData.summary?.net_ndwi_change > 0 ? '+' : ''}{aoiData.summary?.net_ndwi_change || 0}
                    </span>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-gray-100 text-[11px] text-gray-500 flex items-center justify-between">
                  <span>Status:</span>
                  <span className="font-semibold text-gray-800">
                    {Math.abs(aoiData.summary?.net_ndwi_change || 0) > 0.03 ? 'Active Hydrological Delta' : 'Stable Shorelines'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Machine Learning Decision & Multi-Year History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ML Classification Card */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <span>🌲</span> Machine Learning Diagnostic (Random Forest)
                </h3>
                <RiskBadge level={aoiData.ml_result?.risk_level || 'Low'} />
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                The 15-feature Random Forest model inferred a disturbance probability of{' '}
                <strong>{((aoiData.ml_result?.probability || 0) * 100).toFixed(1)}%</strong> for this specific boundary footprint.
              </p>
              {aoiData.ml_result?.top_features && (
                <div className="space-y-1.5 pt-2">
                  <span className="text-[11px] font-bold text-gray-500 uppercase">Top Guiding Predictors:</span>
                  {aoiData.ml_result.top_features.slice(0, 4).map((f, idx) => (
                    <div key={idx} className="p-2 rounded bg-surface-50 text-xs flex items-center justify-between">
                      <span className="font-mono text-gray-700">{f.feature}</span>
                      <span className="text-gray-500">{f.description}</span>
                      <span className="font-bold text-brand-600">{(f.importance * 100).toFixed(1)}% weight</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Geographic Boundary & Coordinate Card */}
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <span>🗺️</span> Surveyed Boundary Geometry & Extent
                </h3>
                <span className="text-xs bg-gray-100 text-gray-700 font-mono px-2 py-0.5 rounded">
                  EPSG:4326 (WGS84)
                </span>
              </div>
              <div className="text-xs text-gray-600 space-y-2">
                <p>
                  <strong>Boundary Type:</strong> {aoiData.geometry?.type || 'Polygon'}
                </p>
                <p>
                  <strong>Total Surveyed Area:</strong> {aoiData.area_km2?.toFixed(2)} km²
                </p>
                {aoiData.geometry?.coordinates?.[0] && (
                  <div>
                    <span className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                      Polygon Boundary Vertices ({aoiData.geometry.coordinates[0].length} points):
                    </span>
                    <div className="max-h-28 overflow-y-auto font-mono text-[11px] bg-surface-50 p-2 rounded border border-gray-100 divide-y divide-gray-100">
                      {aoiData.geometry.coordinates[0].map(([lng, lat], idx) => (
                        <div key={idx} className="py-0.5 flex justify-between">
                          <span>Vertex #{idx + 1}:</span>
                          <span>{lat.toFixed(5)}°N, {lng.toFixed(5)}°E</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Technical Limitations & Verification Mandates */}
          <div className="p-4 bg-slate-900 text-slate-100 rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between text-brand-400 font-bold">
              <span className="flex items-center gap-1.5">
                <span>🛡️</span> Technical Constraints & Ground Verification Protocol
              </span>
              <span className="text-[10px] text-gray-400">Decision-Support Only</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300">
              <li>Spectral observations reflect Sentinel-2 surface reflectance (10m–20m pixel resolution); micro-scale understory variations require in-situ sampling.</li>
              <li>SAR phase interferometry (InSAR) was not computed in this optical pass; surface deformation tracking requires repeat-pass acquisitions.</li>
              <li>Satellite classifications are decision-support indicators and do not substitute for official statutory surveys or judicial findings.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: REGIONAL PUNE PILOT REPORT (When activeReportTab === 'pune')
      ────────────────────────────────────────────────────────────── */}
      {activeReportTab === 'pune' && (
        <div className="space-y-6 animate-fade-in">
          {/* Main Header & Export Toolbar */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏛️</span>
                <h1 className="text-2xl font-bold text-surface-900">Pune Regional Pilot Audit Report</h1>
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                  Regional Baseline
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {data.title} — <span className="font-semibold text-gray-800">{data.pilot_area}</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                <span>
                  <strong>Analysis Period:</strong> {data.analysis_period}
                </span>
                <span>·</span>
                <span>
                  <strong>Generated:</strong> {new Date(data.generated_at).toLocaleString()}
                </span>
                <span>·</span>
                <span>
                  <strong>Source:</strong> {data.source || 'Sentinel-2 Harmonized L2A'}
                </span>
              </div>
            </div>

            {/* Configuration & Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">Module:</label>
                <select
                  value={exportModule}
                  onChange={(e) => setExportModule(e.target.value)}
                  className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="all">All Modules</option>
                  <option value="deforestation">Deforestation</option>
                  <option value="mining">Mining</option>
                  <option value="flood">Flood</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase">Risk:</label>
                <select
                  value={exportRisk}
                  onChange={(e) => setExportRisk(e.target.value)}
                  className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="all">All Levels</option>
                  <option value="High">🔴 High Only</option>
                  <option value="Medium">🟡 Medium Only</option>
                  <option value="Low">🟢 Low Only</option>
                </select>
              </div>

              <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>

              {/* PDF Report Generation Button */}
              <button
                onClick={handleDownloadPdf}
                disabled={downloading === 'pdf'}
                className="px-4 py-2.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                title="Download detailed multi-temporal PDF audit report"
              >
                <span>{downloading === 'pdf' ? '⏳' : '📥'}</span>
                <span>{downloading === 'pdf' ? 'Generating PDF...' : 'Generate PDF Audit'}</span>
              </button>

              {/* CSV Export Button */}
              <button
                onClick={handleDownloadCsv}
                disabled={downloading === 'csv'}
                className="px-4 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                title="Export filtered records as CSV"
              >
                <span>{downloading === 'csv' ? '⏳' : '📊'}</span>
                <span>{downloading === 'csv' ? 'Exporting...' : 'CSV Data'}</span>
              </button>

              {/* GeoJSON Export Button */}
              <button
                onClick={handleDownloadGeoJson}
                disabled={downloading === 'geojson'}
                className="px-4 py-2.5 bg-surface-800 text-white text-xs font-semibold rounded-lg hover:bg-surface-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60 cursor-pointer"
                title="Export GIS vector FeatureCollection for QGIS/ArcGIS"
              >
                <span>{downloading === 'geojson' ? '⏳' : '🗺️'}</span>
                <span>{downloading === 'geojson' ? 'Exporting...' : 'GeoJSON'}</span>
              </button>

              {/* Print Button */}
              <button
                onClick={handlePrint}
                className="px-3 py-2.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                title="Print or save as browser PDF"
              >
                <span>🖨️</span>
                <span>Print</span>
              </button>
            </div>
          </div>

          {/* Executive Overview Stats */}
          <div>
            <h2 className="text-lg font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <span>📊</span>
              <span>Regional Executive Overview Metrics</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="Total Regions"
                value={data.overview?.total_regions}
                icon="🌍"
                color="blue"
                description="Geographic administrative sub-divisions"
              />
              <StatCard
                title="Total Sample Points"
                value={data.overview?.total_points?.toLocaleString()}
                icon="📍"
                color="gray"
                description="Multi-temporal Sentinel-2 sample locations"
              />
              <StatCard
                title="High-Risk Zones"
                value={data.overview?.high_risk_zones}
                icon="🔴"
                color="red"
                description="Require priority field inspection"
              />
            </div>
          </div>

          {/* Module Summaries */}
          <div>
            <h2 className="text-lg font-semibold text-surface-800 mb-3 flex items-center gap-2">
              <span>🔍</span>
              <span>Regional Domain Module Diagnostics</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Deforestation Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🌳</span>
                      <h3 className="font-semibold text-surface-800">Deforestation / Loss</h3>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                      NDVI
                    </span>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Monitored Points</span>
                      <span className="font-medium text-surface-800">
                        {data.deforestation?.total_points?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">High Risk Alerts</span>
                      <span className="font-bold text-red-600">
                        {data.deforestation?.high_risk?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Avg NDVI Delta</span>
                      <span className="font-mono text-xs font-semibold text-gray-700">
                        {data.deforestation?.avg_ndvi_change > 0 ? '+' : ''}
                        {data.deforestation?.avg_ndvi_change?.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                  Harmonized canopy decline tracking (2023–2026)
                </div>
              </div>

              {/* Mining Disturbance Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">⛏️</span>
                      <h3 className="font-semibold text-surface-800">Mining Disturbance</h3>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
                      NDBI
                    </span>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Monitored Points</span>
                      <span className="font-medium text-surface-800">
                        {data.mining?.total_points?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">High Risk Alerts</span>
                      <span className="font-bold text-red-600">
                        {data.mining?.high_risk?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Avg NDBI Delta</span>
                      <span className="font-mono text-xs font-semibold text-gray-700">
                        {data.mining?.avg_ndbi_change > 0 ? '+' : ''}
                        {data.mining?.avg_ndbi_change?.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                  Bare-ground excavation & built expansion
                </div>
              </div>

              {/* Flood Risk Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🌊</span>
                      <h3 className="font-semibold text-surface-800">Flood Extent</h3>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                      NDWI
                    </span>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Monitored Points</span>
                      <span className="font-medium text-surface-800">
                        {data.flood?.total_points?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">High Risk Alerts</span>
                      <span className="font-bold text-red-600">
                        {data.flood?.high_risk?.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Avg NDWI Delta</span>
                      <span className="font-mono text-xs font-semibold text-gray-700">
                        {data.flood?.avg_ndwi_change > 0 ? '+' : ''}
                        {data.flood?.avg_ndwi_change?.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
                  Water-extent anomalies & inundation risk
                </div>
              </div>
            </div>
          </div>

          {/* Preview Table of Hotspot Findings */}
          {previewHotspots.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-surface-800">
                    Regional Scope Preview — Priority Monitored Locations
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Top records matching selected filters ({exportModule.toUpperCase()} ·{' '}
                    {exportRisk.toUpperCase()})
                  </p>
                </div>
                <span className="text-xs font-medium text-gray-400">
                  Showing top {previewHotspots.length} sample points
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-2.5 text-left">Region</th>
                      <th className="px-4 py-2.5 text-left">Module</th>
                      <th className="px-4 py-2.5 text-left">Coordinates</th>
                      <th className="px-4 py-2.5 text-right">Spectral Change</th>
                      <th className="px-4 py-2.5 text-right">Risk Score</th>
                      <th className="px-4 py-2.5 text-center">Risk Level</th>
                      <th className="px-4 py-2.5 text-center">Field Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {previewHotspots.map((h, i) => (
                      <tr key={h.id || i} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-surface-800">{h.region}</td>
                        <td className="px-4 py-2.5 text-gray-500 capitalize">{h.module}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                          {h.latitude?.toFixed(4)}, {h.longitude?.toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs">
                          <span
                            className={
                              h.change_value < 0
                                ? 'text-red-600 font-semibold'
                                : 'text-green-600 font-semibold'
                            }
                          >
                            {h.change_value > 0 ? '+' : ''}
                            {h.change_value?.toFixed(4)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-surface-800">
                          {h.risk_score}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <RiskBadge level={h.risk_level} />
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium">
                          {h.requires_field_verification ? (
                            <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              Required
                            </span>
                          ) : (
                            <span className="text-gray-400">Optional</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legal & Scientific Disclaimer */}
          <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
            <span className="text-base leading-none">⚠️</span>
            <div>
              <strong className="font-semibold">Compliance & Methodology Disclaimer:</strong>{' '}
              {data.disclaimer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
