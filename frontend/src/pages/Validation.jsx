import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, apiPost } from '../api/client';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

const LANDSAT_PRESETS = [
  {
    id: 'pune_baseline',
    name: 'Pune Regional Study Area (Default Baseline)',
    lat: 18.5204,
    lng: 73.8567,
    buffer_meters: 1500,
    module: 'deforestation',
    baseline_start: '2023-01-01',
    baseline_end: '2023-04-30',
    comparison_start: '2024-01-01',
    comparison_end: '2024-04-30',
    description: 'Dry-season baseline vs evaluation comparison across the Pune pilot boundary.',
  },
  {
    id: 'western_ghats_forest',
    name: 'Western Ghats Foothills Forest Zone',
    lat: 18.6500,
    lng: 73.4800,
    buffer_meters: 2000,
    module: 'deforestation',
    baseline_start: '2023-01-01',
    baseline_end: '2023-04-30',
    comparison_start: '2024-01-01',
    comparison_end: '2024-04-30',
    description: 'Dense vegetation canopy site assessing dry-season foliage stability and canopy health.',
  },
  {
    id: 'riverbed_quarry',
    name: 'Mula-Mutha Basin Quarrying Zone',
    lat: 18.5800,
    lng: 73.9800,
    buffer_meters: 1500,
    module: 'mining',
    baseline_start: '2023-01-01',
    baseline_end: '2023-04-30',
    comparison_start: '2024-01-01',
    comparison_end: '2024-04-30',
    description: 'Active riverbed aggregate and basalt stone quarry site showing bare soil exposure.',
  },
  {
    id: 'ujani_reservoir',
    name: 'Ujani Wetland / Reservoir Perimeter',
    lat: 18.0700,
    lng: 75.1200,
    buffer_meters: 3000,
    module: 'flood',
    baseline_start: '2023-01-01',
    baseline_end: '2023-04-30',
    comparison_start: '2024-01-01',
    comparison_end: '2024-04-30',
    description: 'Seasonal surface water fluctuation zone along the reservoir periphery.',
  },
];

// Helper to compute slippy map tile URL (x, y) dynamically from lat/lng and zoom level
function getTileUrl(template, lat, lng, zoom = 13) {
  if (!template) return '';
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (isNaN(latNum) || isNaN(lngNum)) return '';
  // Clamp lat to valid Mercator range [-85.0511, 85.0511]
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, latNum));
  const latRad = (clampedLat * Math.PI) / 180.0;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lngNum + 180.0) / 360.0) * n);
  const y = Math.floor(
    ((1.0 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2.0) * n
  );
  return template.replace('{z}', zoom).replace('{x}', x).replace('{y}', y);
}

export default function Validation() {
  // Main data states
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [referenceCases, setReferenceCases] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('landsat'); // 'landsat' | 'benchmark' | 'reference_cases'
  const [benchmarkSubTab, setBenchmarkSubTab] = useState('real'); // 'real' | 'simulation'
  const [evaluationMode, setEvaluationMode] = useState('cached_empirical'); // 'cached_empirical' | 'live'
  const [selectedModule, setSelectedModule] = useState('flood'); // 'flood' | 'deforestation' | 'mining'
  const [caseFilterModule, setCaseFilterModule] = useState('all');
  const [caseFilterStatus, setCaseFilterStatus] = useState('all');
  const [selectedCaseModal, setSelectedCaseModal] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importSuccess, setImportSuccess] = useState(null);

  // Landsat Reference Validation Workflow State
  const [selectedLandsatPreset, setSelectedLandsatPreset] = useState('pune_baseline');
  const [landsatModule, setLandsatModule] = useState('deforestation');
  const [landsatBaselineStart, setLandsatBaselineStart] = useState('2023-01-01');
  const [landsatBaselineEnd, setLandsatBaselineEnd] = useState('2023-04-30');
  const [landsatCompStart, setLandsatCompStart] = useState('2024-01-01');
  const [landsatCompEnd, setLandsatCompEnd] = useState('2024-04-30');
  const [landsatLat, setLandsatLat] = useState(18.5204);
  const [landsatLng, setLandsatLng] = useState(73.8567);
  const [landsatBuffer, setLandsatBuffer] = useState(1500);
  const [landsatAoiName, setLandsatAoiName] = useState('Pune Regional Study Area (Default Baseline)');
  const [tileZoom, setTileZoom] = useState(13);

  const [landsatLoading, setLandsatLoading] = useState(false);
  const [landsatError, setLandsatError] = useState(null);
  const [landsatResult, setLandsatResult] = useState(null);
  const [crossSensorResult, setCrossSensorResult] = useState(null);

  // Quick reference logging state for Landsat observations
  const [showQuickLogForm, setShowQuickLogForm] = useState(false);
  const [quickLogSubmitting, setQuickLogSubmitting] = useState(false);
  const [quickLogSuccess, setQuickLogSuccess] = useState(null);
  const [quickLogForm, setQuickLogForm] = useState({
    reference_label: 'no_change_observed',
    confidence_level: 'corroborated',
    label_rationale: '',
    reviewer: 'Field Analyst / Remote Sensing Reviewer',
  });

  // Import form state
  const [importForm, setImportForm] = useState({
    aoi_name: '',
    module: 'deforestation',
    lat: 18.5204,
    lng: 73.8567,
    buffer_meters: 1500,
    earlier_date: '2023-01-01',
    later_date: '2024-04-30',
    reference_platform: 'USGS Landsat Collection 2 Level-2',
    sensor_product: 'Landsat 8/9 OLI-2 / TIRS-2 (30m)',
    evidence_identifier: '',
    evidence_url: '',
    reference_label: 'change_observed',
    label_rationale: '',
    reviewer: 'Field Analyst / Remote Sensing Reviewer',
    confidence_level: 'corroborated',
    evidence_limitations: '',
    field_verification_status: 'pending',
    attribution: 'USGS / NASA Landsat Collection 2 via Google Earth Engine',
    reference_image_url: '',
  });

  // Track active fetch controller for lifecycle cancellation
  const abortControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  async function loadAllValidationData(modeToFetch = evaluationMode) {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch benchmark data
      const benchPromise = apiFetch(`/analysis/validation-benchmark?mode=${modeToFetch}`, {
        signal: controller.signal,
        timeout: modeToFetch === 'live' ? 120000 : 25000,
      });

      // 2. Fetch reference cases
      const casesPromise = apiFetch('/analysis/reference-cases', {
        signal: controller.signal,
        timeout: 25000,
      });

      const [benchRes, casesRes] = await Promise.all([
        benchPromise,
        casesPromise,
      ]);

      if (!isMountedRef.current) return;

      if (benchRes.error) {
        throw new Error(`Benchmark API Error: ${benchRes.error}`);
      }
      if (!benchRes.data) {
        throw new Error('Empty benchmark dataset returned from server.');
      }

      setBenchmarkData(benchRes.data);
      if (casesRes.data) setReferenceCases(casesRes.data);
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('cancelled')) {
        return; // Ignore intentional aborts
      }
      if (isMountedRef.current) {
        console.error('Validation benchmark loading failure:', err);
        setError(err.message || 'Failed to load validation benchmark data.');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  // Handle Landsat validation execution
  const runLandsatValidation = async () => {
    setLandsatLoading(true);
    setLandsatError(null);
    try {
      const queryParams = new URLSearchParams({
        baseline_start: landsatBaselineStart,
        baseline_end: landsatBaselineEnd,
        comparison_start: landsatCompStart,
        comparison_end: landsatCompEnd,
        module: landsatModule,
        lat: parseFloat(landsatLat),
        lng: parseFloat(landsatLng),
        buffer_meters: parseInt(landsatBuffer, 10),
        aoi_name: landsatAoiName,
      });

      const [refRes, compRes] = await Promise.all([
        apiFetch(`/analysis/landsat-reference?${queryParams.toString()}`, { timeout: 60000 }),
        apiFetch(`/analysis/landsat-comparison?${queryParams.toString()}`, { timeout: 60000 }),
      ]);

      if (refRes.error) {
        throw new Error(refRes.error);
      }
      setLandsatResult(refRes.data);
      if (compRes.data) {
        setCrossSensorResult(compRes.data);
      }

      // Auto-set quick log default label based on result
      if (refRes.data?.reference_signal_label) {
        setQuickLogForm((prev) => ({
          ...prev,
          reference_label: refRes.data.reference_signal_label,
          label_rationale: `Landsat 30m reference spectral analysis (${refRes.data.indicator_name}) yielded mean delta ${refRes.data.signal_summary.mean_delta} with ${refRes.data.signal_summary.changed_area_pct}% changed footprint over ${refRes.data.coordinates.total_area_ha} ha.`,
        }));
      }
    } catch (err) {
      console.error('Landsat analysis failure:', err);
      setLandsatError(err.message || 'Failed to execute Landsat reference validation.');
    } finally {
      setLandsatLoading(false);
    }
  };

  // Preset selection handler
  const handlePresetSelect = (presetId) => {
    setSelectedLandsatPreset(presetId);
    const found = LANDSAT_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setLandsatLat(found.lat);
      setLandsatLng(found.lng);
      setLandsatBuffer(found.buffer_meters);
      setLandsatModule(found.module);
      setLandsatBaselineStart(found.baseline_start);
      setLandsatBaselineEnd(found.baseline_end);
      setLandsatCompStart(found.comparison_start);
      setLandsatCompEnd(found.comparison_end);
      setLandsatAoiName(found.name);
      setLandsatResult(null);
      setCrossSensorResult(null);
    }
  };

  // Select an existing reference case to validate against Landsat
  const handleSelectReferenceCase = (caseItem) => {
    if (!caseItem) return;
    const coords = caseItem.coordinates || {};
    const lat = coords.lat || 18.5204;
    const lng = coords.lng || 73.8567;
    const buf = coords.buffer_meters || 1500;
    const mod = caseItem.module || 'deforestation';
    const earlier = caseItem.earlier_date || '2023-01-01';
    const later = caseItem.later_date || '2024-04-30';

    setLandsatAoiName(caseItem.aoi_name || `Ref Case: ${caseItem.sample_id}`);
    setLandsatLat(lat);
    setLandsatLng(lng);
    setLandsatBuffer(buf);
    setLandsatModule(mod);
    setLandsatBaselineStart(earlier);
    setLandsatBaselineEnd(earlier.length >= 7 ? earlier.slice(0, 7) + '-28' : '2023-04-30');
    setLandsatCompStart(later.length >= 4 ? later.slice(0, 4) + '-01-01' : '2024-01-01');
    setLandsatCompEnd(later);
    setSelectedLandsatPreset(`ref_${caseItem.sample_id}`);
    setLandsatResult(null);
    setCrossSensorResult(null);
    setActiveTab('landsat');
  };

  // Quick logging of Landsat reference evaluation
  const handleQuickLogSubmit = async (e) => {
    e.preventDefault();
    if (!landsatResult) return;
    setQuickLogSubmitting(true);
    try {
      const payload = {
        aoi_name: landsatAoiName || 'Landsat Reference Site',
        module: landsatModule,
        lat: parseFloat(landsatLat),
        lng: parseFloat(landsatLng),
        buffer_meters: parseInt(landsatBuffer, 10),
        earlier_date: landsatBaselineStart,
        later_date: landsatCompEnd,
        reference_platform: 'USGS Landsat Collection 2 Level-2',
        sensor_product: landsatResult.baseline_metadata?.sensor || 'Landsat 8/9 OLI-2 / TIRS-2 (30m)',
        evidence_identifier: `LANDSAT-${landsatBaselineStart.slice(0, 4)}-${landsatCompEnd.slice(0, 4)}-${Math.round(landsatLat * 100)}`,
        evidence_url: 'https://earthengine.google.com',
        reference_label: quickLogForm.reference_label,
        label_rationale: quickLogForm.label_rationale,
        reviewer: quickLogForm.reviewer,
        confidence_level: quickLogForm.confidence_level,
        evidence_limitations: 'Spatial resolution is 30m; fine canopy/edge shifts (<0.09 ha) may undergo spatial smoothing.',
        field_verification_status: 'included',
        attribution: 'USGS / NASA Landsat Collection 2 Level-2 Surface Reflectance via Google Earth Engine',
        reference_image_url: landsatResult.tile_layers?.indicator_change || '',
      };

      const res = await apiPost('/analysis/reference-cases', payload);
      if (res.error) throw new Error(res.error);

      setReferenceCases((prev) => [res.data, ...prev]);
      setQuickLogSuccess('Observation registered into Reference Cases registry!');
      setTimeout(() => {
        setShowQuickLogForm(false);
        setQuickLogSuccess(null);
      }, 2000);
    } catch (err) {
      alert(`Failed to save reference case: ${err.message}`);
    } finally {
      setQuickLogSubmitting(false);
    }
  };


  useEffect(() => {
    isMountedRef.current = true;
    loadAllValidationData(evaluationMode);

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [evaluationMode]);

  const handleModeChange = (newMode) => {
    if (newMode === evaluationMode) return;
    setEvaluationMode(newMode);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    setImportSubmitting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const payload = {
        ...importForm,
        lat: parseFloat(importForm.lat),
        lng: parseFloat(importForm.lng),
        buffer_meters: parseInt(importForm.buffer_meters, 10),
      };

      const res = await apiPost('/analysis/reference-cases', payload);
      if (res.error) {
        throw new Error(res.error);
      }

      setImportSuccess('Reference case successfully registered in audit registry!');
      setReferenceCases((prev) => [res.data, ...prev]);

      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(null);
      }, 1800);
    } catch (err) {
      setImportError(err.message || 'Failed to import reference case.');
    } finally {
      setImportSubmitting(false);
    }
  };

  // Explicit Loading State
  if (loading && !benchmarkData) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <LoadingState
          message={
            evaluationMode === 'live'
              ? 'Executing Live Earth Engine Dual-Sensor Benchmark across 24 reference locations... (may take 30–60s)'
              : 'Loading Validation Benchmark & Reference Datasets...'
          }
        />
        <div className="flex justify-center">
          <button
            onClick={() => handleModeChange('cached_empirical')}
            className="text-xs text-brand-600 hover:text-brand-800 underline font-medium"
          >
            Switch to Cached Empirical Mode for Instant Loading
          </button>
        </div>
      </div>
    );
  }

  // Explicit Error State with Retry Button
  if (error && !benchmarkData) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <ErrorState
          message={error}
          onRetry={() => loadAllValidationData(evaluationMode)}
        />
        <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 max-w-xl mx-auto">
          <span className="font-semibold block mb-1">Troubleshooting Guidance:</span>
          If using <strong>Live GEE Mode</strong>, the Earth Engine service may be experiencing quota limitations or connection timeouts. Try switching back to <strong>Cached Empirical Mode</strong> to view pre-verified reproducible GEE artifacts without live cloud network latency.
          <div className="mt-3">
            <button
              onClick={() => handleModeChange('cached_empirical')}
              className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700 transition-colors shadow-xs"
            >
              Load Cached Empirical Data Instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Explicit Empty Data State
  if (!benchmarkData?.benchmarks) {
    return (
      <div className="p-10 max-w-xl mx-auto text-center space-y-4">
        <div className="text-4xl">📂</div>
        <h3 className="text-lg font-bold text-surface-900">No Benchmark Data Available</h3>
        <p className="text-xs text-gray-500">
          The validation benchmark engine did not find active observation records for the selected mode.
        </p>
        <button
          onClick={() => loadAllValidationData('cached_empirical')}
          className="px-4 py-2 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700"
        >
          Initialize Cached Empirical Benchmark
        </button>
      </div>
    );
  }

  // Extract benchmark layers safely
  const realBench = benchmarkData.benchmarks.real_observation_benchmark;
  const simBench = benchmarkData.benchmarks.simulation_fixture_benchmark;
  const currentRealModule = realBench?.modules?.[selectedModule];
  const currentSimModule = simBench?.data?.module_benchmarks?.[selectedModule];

  // Filtered reference cases for Phase 3
  const filteredCases = referenceCases.filter((c) => {
    if (caseFilterModule !== 'all' && c.module !== caseFilterModule) return false;
    if (caseFilterStatus !== 'all' && c.inclusion_status !== caseFilterStatus) return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 shadow-xs border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-2xl">🔬</span>
            <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
              Validation Benchmark & Reference Evidence
            </h1>
            <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200">
              Evidence-First
            </span>
            <span className="bg-brand-50 text-brand-700 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-brand-200">
              Wilson 95% CI
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 max-w-3xl leading-relaxed">
            Multi-tier evaluation of optical and radar change detection using authentic Google Earth Engine satellite reductions, independently interpreted reference sites, and USGS Landsat Collection 2 Level-2 reference validation.
          </p>
        </div>

        {/* Global Action / Refresh Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadAllValidationData(evaluationMode)}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-surface-50 text-surface-800 transition-colors flex items-center gap-1.5 shadow-xs"
            title="Reload validation datasets"
          >
            <span>{loading ? '⏳' : '🔄'}</span>
            <span>{loading ? 'Refreshing...' : 'Refresh Benchmark'}</span>
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors shadow-xs flex items-center gap-1.5"
          >
            <span>📥</span>
            <span>Import Evidence Case</span>
          </button>
        </div>
      </div>

      {/* Main Feature Tabs */}
      <div className="flex border-b border-gray-200 gap-2 sm:gap-4 overflow-x-auto text-xs sm:text-sm">
        <button
          onClick={() => setActiveTab('landsat')}
          className={`pb-3 font-semibold transition-all border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'landsat'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-surface-900'
          }`}
        >
          <span>🛰️</span>
          <span>Landsat Reference Validation</span>
          <span className="bg-emerald-50 text-emerald-700 text-[10px] px-1.5 py-0.2 rounded-full border border-emerald-200 font-mono">
            USGS 30m C2 L2
          </span>
        </button>
        <button
          onClick={() => setActiveTab('benchmark')}
          className={`pb-3 font-semibold transition-all border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'benchmark'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-surface-900'
          }`}
        >
          <span>📊</span>
          <span>Sensor-Ablation Benchmark</span>
        </button>
        <button
          onClick={() => setActiveTab('reference_cases')}
          className={`pb-3 font-semibold transition-all border-b-2 flex items-center gap-2 shrink-0 ${
            activeTab === 'reference_cases'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-surface-900'
          }`}
        >
          <span>🔍</span>
          <span>Reference Cases & Side-by-Side Review</span>
          <span className="bg-gray-100 text-gray-700 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
            {referenceCases.length}
          </span>
        </button>
      </div>


      {/* ========================================================================= */}
      {/* TAB 1: SENSOR-ABLATION DUAL-BENCHMARK DASHBOARD (Phase 2 & Phase 5)       */}
      {/* ========================================================================= */}
      {activeTab === 'benchmark' && (
        <div className="space-y-6">
          {/* Sub-Header: Mode & Module Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
            {/* Mode Controls */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Evaluation Source:</span>
              <div className="flex bg-surface-100 p-0.5 rounded-lg border border-surface-200 text-xs">
                <button
                  onClick={() => handleModeChange('cached_empirical')}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${
                    evaluationMode === 'cached_empirical'
                      ? 'bg-white text-surface-900 shadow-xs font-semibold'
                      : 'text-gray-500 hover:text-surface-900'
                  }`}
                  title="Reproducible verified GEE observation artifacts on disk"
                >
                  ⚡ Cached Empirical
                </button>
                <button
                  onClick={() => handleModeChange('live')}
                  className={`px-3 py-1 rounded-md font-medium transition-all ${
                    evaluationMode === 'live'
                      ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                      : 'text-gray-500 hover:text-surface-900'
                  }`}
                  title="Queries Google Earth Engine live across all reference coordinates"
                >
                  🛰️ Live GEE Run
                </button>
              </div>

              <div className="h-4 w-[1px] bg-gray-200 mx-1"></div>

              <div className="flex bg-surface-100 p-0.5 rounded-lg border border-surface-200 text-xs">
                <button
                  onClick={() => setBenchmarkSubTab('real')}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    benchmarkSubTab === 'real'
                      ? 'bg-white text-surface-900 shadow-xs font-semibold'
                      : 'text-gray-500 hover:text-surface-900'
                  }`}
                >
                  Real Reference
                </button>
                <button
                  onClick={() => setBenchmarkSubTab('simulation')}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    benchmarkSubTab === 'simulation'
                      ? 'bg-amber-100 text-amber-900 shadow-xs font-semibold'
                      : 'text-gray-500 hover:text-surface-900'
                  }`}
                  title="Controlled 180-sample synthetic test fixture"
                >
                  🧪 Simulation Fixture
                </button>
              </div>
            </div>

            {/* Environmental Module Switcher */}
            <div className="flex items-center gap-1.5">
              {[
                { id: 'flood', label: 'Flood Inundation', icon: '🌊' },
                { id: 'deforestation', label: 'Deforestation', icon: '🌳' },
                { id: 'mining', label: 'Mining Disturbance', icon: '⛏️' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModule(m.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 ${
                    selectedModule === m.id
                      ? 'bg-brand-50 text-brand-700 border-brand-300 font-semibold shadow-xs'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-surface-50'
                  }`}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {benchmarkSubTab === 'real' ? (
            /* REAL REFERENCE EMPIRICAL BENCHMARK */
            <div className="space-y-6">
              {/* Scientific Protocol Banner */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 flex items-start gap-3">
                <span className="text-base shrink-0">ℹ️</span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-blue-950">
                    <span>Empirical Verification Protocol & Provenance</span>
                    <span className="bg-blue-200/70 text-blue-900 text-[10px] px-2 py-0.2 rounded font-mono">
                      {benchmarkData.pipeline_version}
                    </span>
                  </div>
                  <p className="text-blue-900 leading-relaxed">
                    {benchmarkData.scientific_qualification}
                  </p>
                  <p className="text-gray-600">
                    Metrics below are computed strictly from independent Earth Engine reductions across verified coordinates in Pune/Western Maharashtra. Normal seasonal reservoir drawdown is audited and kept excluded from flood disaster statistics.
                  </p>
                </div>
              </div>

              {/* Sample Counts & Class Distribution */}
              {currentRealModule && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                    <span className="text-[11px] text-gray-500 uppercase font-semibold block">Total Sites</span>
                    <p className="text-2xl font-bold text-surface-900 mt-1">{currentRealModule.total_registered_samples}</p>
                    <span className="text-[11px] text-gray-400">Documented references</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                    <span className="text-[11px] text-emerald-600 uppercase font-semibold block">Evaluated GT (N)</span>
                    <p className="text-2xl font-bold text-emerald-700 mt-1">{currentRealModule.evaluated_sample_count}</p>
                    <span className="text-[11px] text-gray-400">
                      {currentRealModule.class_distribution?.change_observed ?? 0} Pos / {currentRealModule.class_distribution?.no_change_observed ?? 0} Neg
                    </span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                    <span className="text-[11px] text-blue-600 uppercase font-semibold block">Usable GEE Scenes</span>
                    <p className="text-2xl font-bold text-blue-700 mt-1">
                      {currentRealModule.usable_gee_predictions_count || currentRealModule.evaluated_sample_count}
                    </p>
                    <span className="text-[11px] text-gray-400">Verified dual-sensor</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                    <span className="text-[11px] text-amber-600 uppercase font-semibold block">Pending Field Survey</span>
                    <p className="text-2xl font-bold text-amber-700 mt-1">{currentRealModule.pending_samples_count}</p>
                    <span className="text-[11px] text-gray-400">Awaiting GPS visit</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
                    <span className="text-[11px] text-purple-600 uppercase font-semibold block">Excluded Boundary</span>
                    <p className="text-2xl font-bold text-purple-700 mt-1">{currentRealModule.excluded_samples_count}</p>
                    <span className="text-[11px] text-gray-400">Drawdown / ecotone</span>
                  </div>
                </div>
              )}

              {/* Research Notes & Empirical Limitations */}
              {currentRealModule?.scientific_notes && currentRealModule.scientific_notes.length > 0 && (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-1.5">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                    <span>⚠️</span>
                    <span>Empirical Benchmark Notes & Denominator Constraints:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-amber-800">
                    {currentRealModule.scientific_notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sensor-Ablation Table */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-surface-900">
                      Sensor-Ablation Benchmark Results — {selectedModule.toUpperCase()}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Evaluated on N = {currentRealModule?.evaluated_sample_count} confirmed ground-truth samples with Wilson Score 95% Confidence Intervals.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono bg-surface-100 px-2 py-0.5 rounded text-gray-600 border border-surface-200">
                      Mode: {evaluationMode}
                    </span>
                    <span className="text-[11px] font-mono bg-surface-100 px-2 py-0.5 rounded text-gray-600 border border-surface-200">
                      N = {currentRealModule?.evaluated_sample_count}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-50 text-gray-600 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3 text-left">Ablation Configuration</th>
                        <th className="px-3 py-3 text-center">TP / FP / TN / FN</th>
                        <th className="px-3 py-3 text-right">Precision (95% CI)</th>
                        <th className="px-3 py-3 text-right">Recall (95% CI)</th>
                        <th className="px-3 py-3 text-right">F1-Score</th>
                        <th className="px-3 py-3 text-right">IoU</th>
                        <th className="px-3 py-3 text-right">Accuracy (95% CI)</th>
                        <th className="px-3 py-3 text-right">Specificity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentRealModule?.benchmark_results &&
                        Object.entries(currentRealModule.benchmark_results).map(([methodKey, metrics]) => {
                          const methodNames = {
                            s2_optical_only: '1. Sentinel-2 Optical Alone',
                            s1_sar_only: '2. Sentinel-1 SAR Alone',
                            dual_sensor_intersection: '3. Strict Coincident Intersection',
                            quality_aware_adaptive_fusion: '4. Quality-Aware Adaptive Fusion',
                          };
                          const isAdaptive = methodKey === 'quality_aware_adaptive_fusion';

                          return (
                            <tr
                              key={methodKey}
                              className={`hover:bg-surface-50 transition-colors ${
                                isAdaptive ? 'bg-brand-50/30 font-medium' : ''
                              }`}
                            >
                              <td className="px-4 py-3 text-surface-900">
                                <span className="font-semibold">{methodNames[methodKey] || methodKey}</span>
                                {isAdaptive && (
                                  <span className="ml-2 bg-brand-100 text-brand-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                                    Adaptive Fusion
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-center font-mono text-gray-600">
                                <span className="text-emerald-700 font-bold">{metrics.true_positives}</span> /{' '}
                                <span className="text-red-600">{metrics.false_positives}</span> /{' '}
                                <span className="text-gray-700">{metrics.true_negatives}</span> /{' '}
                                <span className="text-amber-700">{metrics.false_negatives}</span>
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {metrics.precision_status === 'not_estimable' || metrics.precision === null ? (
                                  <div>
                                    <span className="text-gray-400 italic">Not Estimable</span>
                                    <span className="block text-[10px] text-gray-400">0 pos preds (0/0)</span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="font-bold text-surface-900">
                                      {(metrics.precision * 100).toFixed(1)}%
                                    </span>
                                    {metrics.precision_95ci && (
                                      <span className="block text-[10px] text-gray-400">
                                        [{metrics.precision_95ci[0] * 100}%, {metrics.precision_95ci[1] * 100}%]
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {metrics.recall_status === 'not_estimable' || metrics.recall === null ? (
                                  <div>
                                    <span className="text-amber-700 font-semibold italic">Not Estimable</span>
                                    <span className="block text-[10px] text-amber-600">0 true events (0/0)</span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="font-bold text-surface-900">
                                      {(metrics.recall * 100).toFixed(1)}%
                                    </span>
                                    {metrics.recall_95ci && (
                                      <span className="block text-[10px] text-gray-400">
                                        [{metrics.recall_95ci[0] * 100}%, {metrics.recall_95ci[1] * 100}%]
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {metrics.f1_status === 'not_estimable' || metrics.f1_score === null ? (
                                  <span className="text-gray-400 italic">Not Estimable</span>
                                ) : (
                                  <span className="font-bold text-brand-700">{metrics.f1_score.toFixed(3)}</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {metrics.iou_status === 'not_estimable' || metrics.intersection_over_union === null ? (
                                  <span className="text-gray-400 italic">Not Estimable</span>
                                ) : (
                                  <span className="text-gray-700">{metrics.intersection_over_union.toFixed(3)}</span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                <span className="font-bold text-surface-900">
                                  {(metrics.accuracy * 100).toFixed(1)}%
                                </span>
                                {metrics.accuracy_95ci && (
                                  <span className="block text-[10px] text-gray-400">
                                    [{metrics.accuracy_95ci[0] * 100}%, {metrics.accuracy_95ci[1] * 100}%]
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3 text-right font-mono">
                                {metrics.specificity_status === 'not_estimable' || metrics.specificity === null ? (
                                  <span className="text-gray-400 italic">Not Estimable</span>
                                ) : (
                                  <div>
                                    <span className="font-bold text-surface-900">
                                      {(metrics.specificity * 100).toFixed(1)}%
                                    </span>
                                    {metrics.specificity_95ci && (
                                      <span className="block text-[10px] text-gray-400">
                                        [{metrics.specificity_95ci[0] * 100}%, {metrics.specificity_95ci[1] * 100}%]
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Mathematical Semantics & Zero-Denominator Footnote */}
                <div className="px-5 py-3 bg-surface-50 border-t border-gray-100 text-[11px] text-gray-500 leading-relaxed">
                  <strong>Statistical Accounting Rule:</strong> When zero true positive events occur in an observation window (e.g. Flood during January–April dry season), Recall is mathematically <em>Not Estimable</em> (0/0 denominator). Precision and F1 evaluate to zero because no positive detections occurred. Specificity evaluates negative-control false-alarm rejection across confirmed non-flooded baseline reservoirs.
                </div>
              </div>

              {/* Cloud Resilience Metrics */}
              {currentRealModule?.cloud_resilience && (
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5">
                  <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                    <span>☁️</span> Empirical Observation Coverage & Cloud Resilience
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {currentRealModule.cloud_resilience.coverage_definition}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
                      <span className="text-xs text-gray-500">Sentinel-2 Optical Valid Pixels</span>
                      <p className="text-lg font-bold text-surface-900 mt-0.5">
                        {currentRealModule.cloud_resilience.actual_s2_optical_valid_pixel_pct}%
                      </p>
                      <span className="text-[10px] text-gray-400">Cloud Score+ filtered</span>
                    </div>
                    <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
                      <span className="text-xs text-gray-500">Sentinel-1 Radar Valid Coverage</span>
                      <p className="text-lg font-bold text-emerald-700 mt-0.5">
                        {currentRealModule.cloud_resilience.actual_s1_sar_valid_pixel_pct}%
                      </p>
                      <span className="text-[10px] text-gray-400">All-weather C-band microwave</span>
                    </div>
                    <div className="p-3 bg-surface-50 rounded-lg border border-surface-200">
                      <span className="text-xs text-gray-500">Dry-Season Empirical Gain</span>
                      <p className="text-lg font-bold text-brand-700 mt-0.5">
                        +{currentRealModule.cloud_resilience.empirical_observation_gain_pct}%
                      </p>
                      <span className="text-[10px] text-gray-400">Adaptive union improvement</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* SIMULATION BENCHMARK FIXTURE TAB */
            <div className="space-y-6">
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-amber-950">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h3 className="font-bold text-sm text-amber-900 uppercase tracking-wide">
                      Simulated Pipeline Test Fixture Only
                    </h3>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      The data below is generated from the 180-sample synthetic test fixture with 25% artificial cloud noise injection. It exists strictly to verify ablation math and edge cases in unit tests.
                    </p>
                    <div className="mt-2 text-xs font-semibold text-amber-950 bg-amber-100/90 px-3 py-1.5 rounded inline-block border border-amber-300">
                      NEVER present simulation metrics as measured real-world accuracy or validated detection performance.
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulation Table */}
              <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-surface-900">
                      Simulation Benchmark Results [SYNTHETIC] — {selectedModule.toUpperCase()}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      180 synthetic samples with 25% artificial cloud injection.
                    </p>
                  </div>
                  <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-300">
                    TEST FIXTURE ONLY
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-50 text-gray-600 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-3 text-left">Configuration</th>
                        <th className="px-3 py-3 text-right">Precision [SIM]</th>
                        <th className="px-3 py-3 text-right">Recall [SIM]</th>
                        <th className="px-3 py-3 text-right">F1-Score [SIM]</th>
                        <th className="px-3 py-3 text-right">IoU [SIM]</th>
                        <th className="px-3 py-3 text-right">Accuracy [SIM]</th>
                        <th className="px-3 py-3 text-right">Specificity [SIM]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {currentSimModule &&
                        Object.entries(currentSimModule).map(([methodKey, metrics]) => (
                          <tr key={methodKey} className="hover:bg-surface-50">
                            <td className="px-4 py-3 font-medium text-surface-900 capitalize">
                              {methodKey.replace(/_/g, ' ')}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">{(metrics.precision * 100).toFixed(1)}%</td>
                            <td className="px-3 py-3 text-right font-mono">{(metrics.recall * 100).toFixed(1)}%</td>
                            <td className="px-3 py-3 text-right font-mono font-semibold text-gray-700">
                              {metrics.f1_score?.toFixed(3)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-gray-600">
                              {metrics.intersection_over_union?.toFixed(3)}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">{(metrics.accuracy * 100).toFixed(1)}%</td>
                            <td className="px-3 py-3 text-right font-mono">{(metrics.specificity * 100).toFixed(1)}%</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Validation Hierarchy Distinction (Phase 2 Requirement) */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-5 space-y-3">
            <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
              <span>🛡️</span> Understanding the Four Validation Tiers
            </h3>
            <p className="text-xs text-gray-500">
              GeoVision AI enforces strict distinctions between software correctness, pilot pseudo-labeling, third-party reference evidence, and ground truth:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs pt-1">
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">1. Automated Tests</span>
                <p className="text-gray-600 leading-relaxed">
                  Verifies code execution, schema adherence, zero-division safeguards, and geographic payload isolation. Does not prove satellite detection accuracy.
                </p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">2. Pseudo-Label Agreement</span>
                <p className="text-gray-600 leading-relaxed">
                  Evaluates Random Forest agreement with synthetic rule thresholds (NDVI &ge; 0.4, &Delta; &le; -0.2). Reflects rule correlation, <em>never independent validation</em>.
                </p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">3. Reference Image Review</span>
                <p className="text-gray-600 leading-relaxed">
                  Multi-temporal manual photointerpretation using USGS Landsat (30m), NICFI/PlanetScope, and gauge records. Validates physical surface state without field travel.
                </p>
              </div>
              <div className="p-3 bg-surface-50 rounded-lg border border-gray-200">
                <span className="font-bold text-surface-900 block mb-1">4. Field Ground Verification</span>
                <p className="text-gray-600 leading-relaxed">
                  Physical on-site inspection with GPS coordinates, drone photogrammetry, local revenue surveys, and statutory permits. The ultimate authoritative ground truth.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REFERENCE CASES & SIDE-BY-SIDE REVIEW (Phase 3)                   */}
      {/* ========================================================================= */}
      {activeTab === 'reference_cases' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-100 shadow-xs">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-600">Module:</span>
                <select
                  value={caseFilterModule}
                  onChange={(e) => setCaseFilterModule(e.target.value)}
                  className="bg-surface-50 border border-gray-200 rounded-lg px-2.5 py-1 text-surface-800"
                >
                  <option value="all">All Modules</option>
                  <option value="flood">Flood Inundation</option>
                  <option value="deforestation">Deforestation</option>
                  <option value="mining">Mining Disturbance</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-gray-600">Status:</span>
                <select
                  value={caseFilterStatus}
                  onChange={(e) => setCaseFilterStatus(e.target.value)}
                  className="bg-surface-50 border border-gray-200 rounded-lg px-2.5 py-1 text-surface-800"
                >
                  <option value="all">All Inclusion Statuses</option>
                  <option value="included">Included in Ground Truth</option>
                  <option value="pending">Pending Field Survey</option>
                  <option value="excluded">Excluded (Drawdown / Ambiguous)</option>
                </select>
              </div>
            </div>

            <span className="text-xs text-gray-500 font-mono">
              Showing {filteredCases.length} of {referenceCases.length} Registered Cases
            </span>
          </div>

          {/* Reference Cases Table */}
          <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-50 text-gray-600 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">Case / Site ID</th>
                    <th className="px-3 py-3 text-left">Location & Coordinates</th>
                    <th className="px-3 py-3 text-center">Module</th>
                    <th className="px-3 py-3 text-center">Observation Window</th>
                    <th className="px-3 py-3 text-center">Reference Label</th>
                    <th className="px-3 py-3 text-center">Automated S1 / S2</th>
                    <th className="px-3 py-3 text-left">Evidence Source & Platform</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredCases.map((c) => {
                    const isChange = c.reference_label === 'change_observed';
                    const isNoChange = c.reference_label === 'no_change_observed';
                    const isExcluded = c.inclusion_status === 'excluded';
                    const isPending = c.inclusion_status === 'pending';

                    return (
                      <tr key={c.sample_id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-4 py-3 font-mono">
                          <span className="font-bold text-surface-900 block">{c.sample_id}</span>
                          <span className="text-[10px] text-gray-400">{c.event_id}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-surface-900 block">{c.aoi_name}</span>
                          <span className="text-[10px] font-mono text-gray-500">
                            {c.coordinates?.lat?.toFixed(3)}°N, {c.coordinates?.lng?.toFixed(3)}°E (r={c.coordinates?.buffer_meters || 500}m)
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800">
                            {c.module}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-gray-600">
                          <div>{c.earlier_date || '2023-01'}</div>
                          <div className="text-[10px] text-gray-400">to {c.later_date || '2024-04'}</div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {isChange && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              Change Observed
                            </span>
                          )}
                          {isNoChange && (
                            <span className="bg-gray-100 text-gray-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              No Change (Control)
                            </span>
                          )}
                          {isExcluded && (
                            <span className="bg-purple-100 text-purple-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              Excluded ({c.reference_label})
                            </span>
                          )}
                          {isPending && (
                            <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                              Pending Survey
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center font-mono text-[10px]">
                          {c.geovision_prediction ? (
                            <div className="flex flex-col gap-0.5 items-center">
                              <span className={c.geovision_prediction.s1_sar_only ? 'text-blue-700 font-bold' : 'text-gray-400'}>
                                S1: {c.geovision_prediction.s1_sar_only ? 'Change' : 'None'}
                              </span>
                              <span className={c.geovision_prediction.s2_optical_only ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                                S2: {c.geovision_prediction.s2_optical_only ? 'Change' : 'None'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">User Reference</span>
                          )}
                        </td>
                        <td className="px-3 py-3 max-w-[200px]">
                          <div className="font-medium text-surface-900 truncate" title={c.reference_source}>
                            {c.reference_source}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">{c.reference_platform}</div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSelectReferenceCase(c)}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded font-semibold text-[11px] border border-emerald-200 transition-colors flex items-center gap-1"
                              title="Execute Landsat 30m reference comparison on this site"
                            >
                              <span>🛰️</span>
                              <span className="hidden md:inline">Validate Landsat</span>
                            </button>
                            <button
                              onClick={() => setSelectedCaseModal(c)}
                              className="px-2.5 py-1 bg-surface-100 hover:bg-brand-50 hover:text-brand-700 text-surface-800 rounded font-semibold text-[11px] border border-gray-200 transition-colors"
                            >
                              Inspect →
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: LANDSAT REFERENCE VALIDATION WORKFLOW                                */}
      {/* ========================================================================= */}
      {activeTab === 'landsat' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🛰️</span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-surface-900">
                      Landsat Reference Validation & Cross-Sensor Comparison
                    </h3>
                    <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                      USGS 30m C2 L2
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Independent satellite reference benchmark using USGS Landsat Collection 2 Level-2 Surface Reflectance.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-surface-100 text-surface-800 border border-gray-200">
                  Dual-Sensor Pipeline: Landsat 8/9 vs Sentinel-2
                </span>
              </div>
            </div>

            {/* Scientific Notice & Resolution Mismatch Note */}
            <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-blue-950 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-blue-900">
                <span>📐</span>
                <span>Scientific Qualification: Independent-Sensor Reference Comparison</span>
              </div>
              <p className="leading-relaxed">
                Landsat surface-reflectance pixels are <strong>30 meters</strong> (900 m² footprint); Sentinel-2 optical bands have a finer <strong>10 m / 20 m</strong> spatial resolution (100 m² footprint, 9× pixel density). Small-scale localized clearings (&lt;0.09 ha) may undergo spatial smoothing in Landsat pixels. Agreement between Landsat and Sentinel-2 represents independent orbital cross-corroboration, not confirmed ground truth. Neither sensor claims legal culpability for mining or proves flood event causality.
              </p>

            </div>

            {/* Guided Workflow Controls */}
            <div className="p-4 bg-surface-50 rounded-xl border border-gray-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200/60 pb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-surface-700 flex items-center gap-1.5">
                  <span>🎯</span> Guided Workflow Configuration
                </span>
                {/* Presets and Existing Case Selection */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-medium text-gray-500">Preset Site:</span>
                    {LANDSAT_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handlePresetSelect(p.id)}
                        className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-all ${
                          selectedLandsatPreset === p.id
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'bg-white text-surface-800 border border-gray-200 hover:bg-surface-100'
                        }`}
                      >
                        {p.name.split(' (')[0]}
                      </button>
                    ))}
                  </div>
                  {referenceCases.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-500">Or Existing Case:</span>
                      <select
                        value={selectedLandsatPreset.startsWith('ref_') ? selectedLandsatPreset.replace('ref_', '') : ''}
                        onChange={(e) => {
                          const c = referenceCases.find((rc) => rc.sample_id === e.target.value);
                          if (c) handleSelectReferenceCase(c);
                        }}
                        className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-[11px] text-surface-800 font-medium max-w-[220px] truncate"
                      >
                        <option value="">-- Choose Case ({referenceCases.length}) --</option>
                        {referenceCases.map((rc) => (
                          <option key={rc.sample_id} value={rc.sample_id}>
                            {rc.sample_id}: {rc.aoi_name} ({rc.module})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Controls Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {/* Module */}
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Environmental Module</label>
                  <select
                    value={landsatModule}
                    onChange={(e) => {
                      setLandsatModule(e.target.value);
                      setSelectedLandsatPreset('custom');
                    }}
                    className="w-full bg-white border border-gray-200 rounded-lg p-2 text-surface-900 font-medium"
                  >
                    <option value="deforestation">🌲 Deforestation & Canopy Loss (NDVI)</option>
                    <option value="mining">⛏️ Mining Disturbance & Bare Soil (NDBI)</option>
                    <option value="flood">🌊 Water Extent & Inundation (NDWI)</option>
                  </select>
                </div>

                {/* Baseline Window */}
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Baseline Date Window</label>
                  <div className="grid grid-cols-2 gap-1 font-mono">
                    <input
                      type="date"
                      value={landsatBaselineStart}
                      onChange={(e) => setLandsatBaselineStart(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Baseline Start"
                    />
                    <input
                      type="date"
                      value={landsatBaselineEnd}
                      onChange={(e) => setLandsatBaselineEnd(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Baseline End"
                    />
                  </div>
                </div>

                {/* Comparison Window */}
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Comparison Date Window</label>
                  <div className="grid grid-cols-2 gap-1 font-mono">
                    <input
                      type="date"
                      value={landsatCompStart}
                      onChange={(e) => setLandsatCompStart(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Comparison Start"
                    />
                    <input
                      type="date"
                      value={landsatCompEnd}
                      onChange={(e) => setLandsatCompEnd(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Comparison End"
                    />
                  </div>
                </div>

                {/* Coordinates & Radius */}
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">AOI Coordinates & Radius</label>
                  <div className="grid grid-cols-3 gap-1 font-mono">
                    <input
                      type="number"
                      step="0.0001"
                      value={landsatLat}
                      onChange={(e) => {
                        setLandsatLat(e.target.value);
                        setSelectedLandsatPreset('custom');
                      }}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Latitude"
                      placeholder="Lat"
                    />
                    <input
                      type="number"
                      step="0.0001"
                      value={landsatLng}
                      onChange={(e) => {
                        setLandsatLng(e.target.value);
                        setSelectedLandsatPreset('custom');
                      }}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Longitude"
                      placeholder="Lng"
                    />
                    <input
                      type="number"
                      step="100"
                      value={landsatBuffer}
                      onChange={(e) => setLandsatBuffer(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg p-1.5 text-[11px]"
                      title="Radius in meters"
                      placeholder="Radius m"
                    />
                  </div>
                </div>
              </div>

              {/* Execution Action */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-gray-500">
                  Target: <strong>{landsatAoiName}</strong> • Buffer Radius: <strong>{landsatBuffer}m</strong> ({landsatLat}°N, {landsatLng}°E)
                </div>
                <button
                  onClick={runLandsatValidation}
                  disabled={landsatLoading}
                  className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-2"
                >
                  {landsatLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Retrieving USGS Landsat & Sentinel-2...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>Run Landsat Reference Validation</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Loading State */}
          {landsatLoading && (
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-xs">
              <LoadingState message="Processing USGS Landsat Collection 2 Level-2 Surface Reflectance via Google Earth Engine and computing cross-sensor comparison..." />
            </div>
          )}

          {/* Error State */}
          {landsatError && !landsatLoading && (
            <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-xs space-y-3">
              <ErrorState
                message={landsatError}
                onRetry={runLandsatValidation}
              />
              <div className="p-3 bg-red-50 text-red-900 rounded-lg text-xs">
                <strong>Diagnostic Note:</strong> If no observations were found, verify that the date window falls within Landsat operational periods and that cloud cover conditions permitted clear optical imaging. Try expanding the seasonal window (e.g., 3–4 months).
              </div>
            </div>
          )}

          {/* Empty State before first run */}
          {!landsatResult && !landsatLoading && !landsatError && (
            <div className="bg-white rounded-2xl p-10 border border-gray-100 shadow-xs text-center space-y-4 max-w-xl mx-auto">
              <div className="text-4xl">🛰️</div>
              <h3 className="text-base font-bold text-surface-900">Execute Landsat Reference Comparison</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Click the execution button above to query USGS Landsat 8/9 Collection 2 Level-2 Surface Reflectance for your selected AOI and compare it with GeoVision AI's Copernicus Sentinel-2 pipeline.
              </p>
              <button
                onClick={runLandsatValidation}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700"
              >
                Launch Initial Baseline Comparison
              </button>
            </div>
          )}

          {/* Successful Landsat Result Display */}
          {landsatResult && !landsatLoading && (
            <div className="space-y-6">
              {/* Provenance & Observation Metadata Banner */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <span className="text-[11px] font-mono text-emerald-700 uppercase font-bold">
                      Earth Engine Reference Verification
                    </span>
                    <h4 className="text-base font-bold text-surface-900">
                      {landsatResult.indicator_name} • {landsatResult.aoi_name}
                    </h4>
                  </div>
                  {/* Reference Label Badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-medium">Reference Signal:</span>
                    {landsatResult.reference_signal_label === 'change_observed' && (
                      <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-300">
                        ✓ Change Observed
                      </span>
                    )}
                    {landsatResult.reference_signal_label === 'no_change_observed' && (
                      <span className="px-3 py-1 bg-slate-100 text-slate-800 text-xs font-bold rounded-full border border-slate-300">
                        ✓ No Change Observed (Stable)
                      </span>
                    )}
                    {landsatResult.reference_signal_label === 'uncertain' && (
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-full border border-amber-300">
                        ⚠ Uncertain Signal
                      </span>
                    )}
                    {landsatResult.reference_signal_label === 'insufficient_imagery' && (
                      <span className="px-3 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-full border border-purple-300">
                        ✕ Insufficient Clear Imagery
                      </span>
                    )}
                  </div>
                </div>

                {/* Sensor & Pipeline Metadata Details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 bg-surface-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Sensor Platform</span>
                    <span className="font-bold text-surface-900">{landsatResult.baseline_metadata.sensor}</span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">30m Optical Surface Reflectance</span>
                  </div>
                  <div className="p-3 bg-surface-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Scaling & Preprocessing</span>
                    <span className="font-mono text-[11px] font-bold text-surface-900">SR = raw * 0.0000275 - 0.2</span>
                    <span className="text-[10px] text-emerald-700 block mt-0.5">QA_PIXEL Cloud/Shadow Masked</span>
                  </div>
                  <div className="p-3 bg-surface-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Baseline Observations</span>
                    <span className="font-bold text-surface-900">{landsatResult.baseline_metadata.scenes_count} Valid Scenes</span>
                    <span className="text-[10px] font-mono text-gray-500 block mt-0.5">
                      {landsatResult.baseline_metadata.start_date} to {landsatResult.baseline_metadata.end_date}
                    </span>
                  </div>
                  <div className="p-3 bg-surface-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 block text-[10px] uppercase font-semibold">Comparison Observations</span>
                    <span className="font-bold text-surface-900">{landsatResult.comparison_metadata.scenes_count} Valid Scenes</span>
                    <span className="text-[10px] font-mono text-gray-500 block mt-0.5">
                      {landsatResult.comparison_metadata.start_date} to {landsatResult.comparison_metadata.end_date}
                    </span>
                  </div>
                </div>
              </div>

              {/* Multi-Temporal Satellite Imagery Triad */}
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-surface-900 uppercase tracking-wide flex items-center gap-1.5">
                    <span>🛰️</span> Landsat Collection 2 Level-2 Imagery Triad
                  </h4>
                  <span className="text-[11px] font-mono text-gray-400">
                    AOI Area: {landsatResult.coordinates.total_area_ha} ha
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Panel 1: Baseline True Color */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-surface-900 flex flex-col">
                    <div className="p-2.5 bg-surface-100 border-b border-gray-200 flex items-center justify-between text-xs font-semibold">
                      <span>Baseline Landsat True Color (RGB)</span>
                      <div className="flex items-center gap-1 font-mono text-[10px] text-gray-500">
                        <span>{landsatResult.baseline_metadata.start_date.slice(0, 4)}</span>
                        <span>•</span>
                        <span>z={tileZoom}</span>
                        <button
                          type="button"
                          onClick={() => setTileZoom((z) => Math.max(10, z - 1))}
                          className="px-1 bg-white border border-gray-200 rounded text-gray-700 hover:bg-gray-100 font-bold"
                          title="Zoom Out"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => setTileZoom((z) => Math.min(15, z + 1))}
                          className="px-1 bg-white border border-gray-200 rounded text-gray-700 hover:bg-gray-100 font-bold"
                          title="Zoom In"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="relative aspect-square bg-surface-950 flex items-center justify-center overflow-hidden">
                      {landsatResult.tile_layers?.baseline_rgb ? (
                        <>
                          <img
                            src={getTileUrl(landsatResult.tile_layers.baseline_rgb, landsatLat, landsatLng, tileZoom)}
                            alt="Baseline Landsat RGB"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fb = e.currentTarget.parentElement?.querySelector('.tile-fallback-msg');
                              if (fb) fb.classList.remove('hidden');
                            }}
                          />
                          <div className="tile-fallback-msg hidden w-full h-full flex flex-col items-center justify-center p-4 text-center bg-surface-950 text-gray-400 text-xs">
                            <span className="text-2xl mb-1">🛰️</span>
                            <span className="font-semibold text-gray-300">Observation Tile Unavailable</span>
                            <span className="text-[10px] text-gray-400 mt-1">Slippy tile (z={tileZoom}) not yet cached or outside AOI raster boundary.</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">Tile generation active</span>
                      )}
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                        Bands: SR_B4 / SR_B3 / SR_B2 (30m)
                      </div>
                    </div>
                    <div className="p-2 bg-surface-50 text-[11px] text-gray-600 border-t border-gray-100">
                      Acquired: {landsatResult.baseline_metadata.acquisition_dates.slice(0, 3).join(', ')}
                      {landsatResult.baseline_metadata.acquisition_dates.length > 3 && '...'}
                    </div>
                  </div>

                  {/* Panel 2: Comparison True Color */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-surface-900 flex flex-col">
                    <div className="p-2.5 bg-surface-100 border-b border-gray-200 flex items-center justify-between text-xs font-semibold">
                      <span>Comparison Landsat True Color (RGB)</span>
                      <div className="flex items-center gap-1 font-mono text-[10px] text-gray-500">
                        <span>{landsatResult.comparison_metadata.start_date.slice(0, 4)}</span>
                        <span>•</span>
                        <span>z={tileZoom}</span>
                        <button
                          type="button"
                          onClick={() => setTileZoom((z) => Math.max(10, z - 1))}
                          className="px-1 bg-white border border-gray-200 rounded text-gray-700 hover:bg-gray-100 font-bold"
                          title="Zoom Out"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => setTileZoom((z) => Math.min(15, z + 1))}
                          className="px-1 bg-white border border-gray-200 rounded text-gray-700 hover:bg-gray-100 font-bold"
                          title="Zoom In"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="relative aspect-square bg-surface-950 flex items-center justify-center overflow-hidden">
                      {landsatResult.tile_layers?.comparison_rgb ? (
                        <>
                          <img
                            src={getTileUrl(landsatResult.tile_layers.comparison_rgb, landsatLat, landsatLng, tileZoom)}
                            alt="Comparison Landsat RGB"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fb = e.currentTarget.parentElement?.querySelector('.tile-fallback-msg');
                              if (fb) fb.classList.remove('hidden');
                            }}
                          />
                          <div className="tile-fallback-msg hidden w-full h-full flex flex-col items-center justify-center p-4 text-center bg-surface-950 text-gray-400 text-xs">
                            <span className="text-2xl mb-1">🛰️</span>
                            <span className="font-semibold text-gray-300">Observation Tile Unavailable</span>
                            <span className="text-[10px] text-gray-400 mt-1">Slippy tile (z={tileZoom}) not yet cached or outside AOI raster boundary.</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">Tile generation active</span>
                      )}
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                        Bands: SR_B4 / SR_B3 / SR_B2 (30m)
                      </div>
                    </div>
                    <div className="p-2 bg-surface-50 text-[11px] text-gray-600 border-t border-gray-100">
                      Acquired: {landsatResult.comparison_metadata.acquisition_dates.slice(0, 3).join(', ')}
                      {landsatResult.comparison_metadata.acquisition_dates.length > 3 && '...'}
                    </div>
                  </div>

                  {/* Panel 3: Change Indicator View */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden bg-surface-900 flex flex-col">
                    <div className="p-2.5 bg-surface-100 border-b border-gray-200 flex items-center justify-between text-xs font-semibold">
                      <span>Landsat Spectral Change View</span>
                      <div className="flex items-center gap-1 font-mono text-[10px] text-brand-700">
                        <span>Δ {landsatResult.indicator_name.split(' ')[0]}</span>
                        <span>•</span>
                        <span>z={tileZoom}</span>
                      </div>
                    </div>
                    <div className="relative aspect-square bg-surface-950 flex items-center justify-center overflow-hidden">
                      {landsatResult.tile_layers?.indicator_change ? (
                        <>
                          <img
                            src={getTileUrl(landsatResult.tile_layers.indicator_change, landsatLat, landsatLng, tileZoom)}
                            alt="Spectral Change Layer"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fb = e.currentTarget.parentElement?.querySelector('.tile-fallback-msg');
                              if (fb) fb.classList.remove('hidden');
                            }}
                          />
                          <div className="tile-fallback-msg hidden w-full h-full flex flex-col items-center justify-center p-4 text-center bg-surface-950 text-gray-400 text-xs">
                            <span className="text-2xl mb-1">🛰️</span>
                            <span className="font-semibold text-gray-300">Differential Layer Unavailable</span>
                            <span className="text-[10px] text-gray-400 mt-1">Slippy tile (z={tileZoom}) not yet cached or outside AOI raster boundary.</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">Tile generation active</span>
                      )}
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                        Differential Heat Map
                      </div>
                    </div>
                    <div className="p-2 bg-surface-50 text-[11px] text-gray-600 border-t border-gray-100 flex items-center justify-between">
                      <span>Mean Δ: <strong>{landsatResult.signal_summary.mean_delta}</strong></span>
                      <span>Changed: <strong>{landsatResult.signal_summary.changed_area_pct}%</strong> ({landsatResult.signal_summary.changed_area_ha} ha)</span>
                    </div>
                  </div>
                </div>

                {/* Zonal Statistics Bar */}
                <div className="p-3 bg-surface-50 rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-gray-400 text-[10px] block font-semibold">Mean Spectral Shift</span>
                    <span className="font-bold font-mono text-surface-900">{landsatResult.signal_summary.mean_delta}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block font-semibold">Min / Max Range</span>
                    <span className="font-mono text-surface-900">
                      [{landsatResult.signal_summary.min_delta}, {landsatResult.signal_summary.max_delta}]
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block font-semibold">Changed Surface Extent</span>
                    <span className="font-bold text-surface-900">
                      {landsatResult.signal_summary.changed_area_ha} ha ({landsatResult.signal_summary.changed_area_pct}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block font-semibold">Confidence Rating</span>
                    <span className="font-bold capitalize text-emerald-800">{landsatResult.signal_summary.confidence_level}</span>
                  </div>
                </div>
              </div>

              {/* Cross-Sensor Comparison & Agreement Panel */}
              {crossSensorResult && (
                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <span className="text-[11px] font-mono text-brand-700 uppercase font-bold">
                        Cross-Sensor Consistency Analysis
                      </span>
                      <h4 className="text-base font-bold text-surface-900">
                        Independent-Sensor Reference Comparison: Landsat (30m) vs Sentinel-2 (10m)
                      </h4>
                    </div>
                    {/* Agreement Status Badge */}
                    <div>
                      {crossSensorResult.sensor_agreement_status === 'AGREE_CHANGE' && (
                        <span className="px-3.5 py-1.5 bg-emerald-100 text-emerald-900 text-xs font-bold rounded-full border border-emerald-300 flex items-center gap-1.5">
                          <span>✓</span>
                          <span>Sensors in Agreement: Change Corroborated</span>
                        </span>
                      )}
                      {crossSensorResult.sensor_agreement_status === 'AGREE_NO_CHANGE' && (
                        <span className="px-3.5 py-1.5 bg-slate-100 text-slate-800 text-xs font-bold rounded-full border border-slate-300 flex items-center gap-1.5">
                          <span>✓</span>
                          <span>Sensors in Agreement: Stable Negative Control</span>
                        </span>
                      )}
                      {crossSensorResult.sensor_agreement_status === 'DISCORDANT_SENSOR_SIGNAL' && (
                        <span className="px-3.5 py-1.5 bg-amber-100 text-amber-900 text-xs font-bold rounded-full border border-amber-300 flex items-center gap-1.5">
                          <span>⚠</span>
                          <span>Discordant Signal (Resolution Sensitivity)</span>
                        </span>
                      )}
                      {crossSensorResult.sensor_agreement_status === 'INCONCLUSIVE' && (
                        <span className="px-3.5 py-1.5 bg-purple-100 text-purple-900 text-xs font-bold rounded-full border border-purple-300 flex items-center gap-1.5">
                          <span>ℹ</span>
                          <span>Inconclusive Observation Density</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comparison Metrics Table */}
                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-50 text-surface-800 font-semibold border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3">Sensor Platform</th>
                          <th className="px-3 py-3 text-center">Pixel Resolution</th>
                          <th className="px-3 py-3 text-center">Pixel Footprint</th>
                          <th className="px-3 py-3 text-center">Observations</th>
                          <th className="px-3 py-3 text-center">Mean Spectral Δ</th>
                          <th className="px-3 py-3 text-center">Changed Area %</th>
                          <th className="px-3 py-3 text-right">Detection Label</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        <tr className="hover:bg-surface-50">
                          <td className="px-4 py-3 font-semibold text-surface-900">
                            <div>USGS Landsat 8/9 C2 L2</div>
                            <span className="text-[10px] text-gray-400">External Satellite Reference</span>
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold text-surface-900">30 meters</td>
                          <td className="px-3 py-3 text-center font-mono text-gray-600">900 m²</td>
                          <td className="px-3 py-3 text-center font-mono">{crossSensorResult.landsat_reference.scenes_count_total} scenes</td>
                          <td className="px-3 py-3 text-center font-mono font-bold">{crossSensorResult.landsat_reference.mean_delta}</td>
                          <td className="px-3 py-3 text-center font-mono font-bold">{crossSensorResult.landsat_reference.changed_area_pct}%</td>
                          <td className="px-3 py-3 text-right">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold capitalize bg-gray-100 text-gray-800">
                              {crossSensorResult.landsat_reference.reference_label.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                        <tr className="hover:bg-surface-50">
                          <td className="px-4 py-3 font-semibold text-brand-900">
                            <div>Copernicus Sentinel-2 L2A</div>
                            <span className="text-[10px] text-brand-600 font-normal">GeoVision AI Primary Sensor</span>
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold text-brand-800">10 meters</td>
                          <td className="px-3 py-3 text-center font-mono text-gray-600">100 m²</td>
                          <td className="px-3 py-3 text-center font-mono">{crossSensorResult.sentinel_geovision.scenes_count_total} scenes</td>
                          <td className="px-3 py-3 text-center font-mono font-bold">{crossSensorResult.sentinel_geovision.mean_delta}</td>
                          <td className="px-3 py-3 text-center font-mono font-bold">{crossSensorResult.sentinel_geovision.changed_area_pct}%</td>
                          <td className="px-3 py-3 text-right">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold capitalize bg-brand-100 text-brand-800">
                              {crossSensorResult.sentinel_geovision.prediction_label.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Resolution Mismatch Deep-Dive Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="p-4 bg-surface-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                      <h5 className="font-bold text-surface-900 flex items-center gap-1.5">
                        <span>🔍</span> Resolution Footprint Divergence (9× Ratio)
                      </h5>
                      <p className="text-gray-600 leading-relaxed">
                        {crossSensorResult.resolution_mismatch_analysis.resolution_impact_statement}
                      </p>
                    </div>

                    <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 space-y-2 text-xs text-amber-950">
                      <h5 className="font-bold text-amber-900 flex items-center gap-1.5">
                        <span>⚖️</span> Scientific Ground Truth Safeguards
                      </h5>
                      <p className="leading-relaxed">
                        {crossSensorResult.disclaimer}
                      </p>
                    </div>
                  </div>

                  {/* Quick-Log Button */}
                  <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      Observation verified across {landsatResult.baseline_metadata.scenes_count + landsatResult.comparison_metadata.scenes_count} Landsat scenes.
                    </span>
                    <button
                      onClick={() => setShowQuickLogForm(!showQuickLogForm)}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5"
                    >
                      <span>📝</span>
                      <span>{showQuickLogForm ? 'Hide Registration Form' : 'Register in Reference Registry'}</span>
                    </button>
                  </div>

                  {/* Inline Quick-Log Registration Form */}
                  {showQuickLogForm && (
                    <form onSubmit={handleQuickLogSubmit} className="p-4 bg-emerald-50/40 rounded-xl border border-emerald-200 text-xs space-y-3">
                      <div className="font-bold text-emerald-950">Register Landsat Reference Case in Permanent Audit Registry</div>
                      {quickLogSuccess && (
                        <div className="p-2.5 bg-emerald-100 text-emerald-900 font-semibold rounded-lg">
                          ✓ {quickLogSuccess}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="font-semibold block mb-1">Reference Ground Truth Label</label>
                          <select
                            value={quickLogForm.reference_label}
                            onChange={(e) => setQuickLogForm({ ...quickLogForm, reference_label: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2 font-semibold"
                          >
                            <option value="change_observed">Change Observed (Positive Detection)</option>
                            <option value="no_change_observed">No Change Observed (Negative Control)</option>
                            <option value="uncertain">Uncertain / Borderline Signal</option>
                            <option value="insufficient_imagery">Insufficient Clear Imagery</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Confidence Rating</label>
                          <select
                            value={quickLogForm.confidence_level}
                            onChange={(e) => setQuickLogForm({ ...quickLogForm, confidence_level: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2 font-semibold"
                          >
                            <option value="corroborated">Corroborated (Dual-Sensor)</option>
                            <option value="provisional">Provisional Inspection</option>
                            <option value="authoritative">Authoritative Mission Archive</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-semibold block mb-1">Reviewer Name / Role</label>
                          <input
                            type="text"
                            value={quickLogForm.reviewer}
                            onChange={(e) => setQuickLogForm({ ...quickLogForm, reviewer: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-lg p-2"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="font-semibold block mb-1">Interpretation & Evidence Rationale</label>
                        <textarea
                          rows={2}
                          value={quickLogForm.label_rationale}
                          onChange={(e) => setQuickLogForm({ ...quickLogForm, label_rationale: e.target.value })}
                          className="w-full bg-white border border-gray-200 rounded-lg p-2"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowQuickLogForm(false)}
                          className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={quickLogSubmitting}
                          className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold"
                        >
                          {quickLogSubmitting ? 'Saving...' : 'Save to Reference Cases'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section: Landsat Reference Case History with Source & Provenance */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <span className="text-[11px] font-mono text-emerald-700 uppercase font-bold">
                  Reference Case Registry & Audit History
                </span>
                <h4 className="text-base font-bold text-surface-900">
                  Landsat Reference Cases & Provenance History ({referenceCases.length} Registered)
                </h4>
              </div>
              <span className="text-xs text-gray-500">
                Preserved audit records with complete sensor provenance and evidence IDs
              </span>
            </div>

            {referenceCases.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-500 bg-surface-50 rounded-xl">
                No reference cases recorded yet. Use the Landsat registration form above or import an evidence dossier.
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-50 text-surface-800 font-semibold border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2.5">Case / Site ID</th>
                      <th className="px-3 py-2.5">Module</th>
                      <th className="px-3 py-2.5">Observation Window</th>
                      <th className="px-3 py-2.5">Platform & Sensor Provenance</th>
                      <th className="px-3 py-2.5 text-center">Reference Label</th>
                      <th className="px-3 py-2.5">Reviewer Rationale</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {referenceCases.map((rc) => (
                      <tr key={rc.sample_id} className="hover:bg-surface-50 transition-colors">
                        <td className="px-3 py-2.5">
                          <span className="font-mono font-bold text-surface-900 block">{rc.sample_id}</span>
                          <span className="text-[10px] text-gray-500">{rc.aoi_name}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="capitalize px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-800">
                            {rc.module}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[10px] text-gray-600">
                          {rc.earlier_date} → {rc.later_date}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-surface-900 text-[11px] truncate max-w-[200px]" title={rc.reference_source}>
                            {rc.reference_source}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[200px]">{rc.attribution || rc.reference_platform}</div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rc.reference_label === 'change_observed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rc.reference_label === 'no_change_observed'
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {rc.reference_label?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <p className="text-[11px] text-gray-600 truncate" title={rc.reviewer_notes}>
                            {rc.reviewer_notes || 'Recorded via Landsat Validation.'}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleSelectReferenceCase(rc)}
                              className="px-2 py-1 text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-200"
                              title="Load this site into Landsat Validation form"
                            >
                              Load in Form
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedCaseModal(rc)}
                              className="px-2 py-1 text-[10px] font-semibold bg-surface-100 hover:bg-surface-200 text-surface-800 rounded border border-gray-200"
                            >
                              Dossier →
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* MODAL 1: CASE DETAIL & SIDE-BY-SIDE INSPECTION (Phase 3)                  */}
      {/* ========================================================================= */}
      {selectedCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[11px] font-mono text-gray-400 uppercase">
                  Reference Case Dossier • {selectedCaseModal.module}
                </span>
                <h3 className="text-lg font-bold text-surface-900">{selectedCaseModal.aoi_name}</h3>
              </div>
              <button
                onClick={() => setSelectedCaseModal(null)}
                className="text-gray-400 hover:text-surface-900 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Case Key Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-surface-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block text-[10px]">Sample ID</span>
                <span className="font-mono font-bold text-surface-900">{selectedCaseModal.sample_id}</span>
              </div>
              <div className="p-2.5 bg-surface-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block text-[10px]">Reference Label</span>
                <span className="font-bold text-surface-900">{selectedCaseModal.reference_label}</span>
              </div>
              <div className="p-2.5 bg-surface-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block text-[10px]">Inclusion Status</span>
                <span className="font-bold capitalize text-surface-900">{selectedCaseModal.inclusion_status}</span>
              </div>
              <div className="p-2.5 bg-surface-50 rounded-lg border border-gray-100">
                <span className="text-gray-400 block text-[10px]">Confidence Level</span>
                <span className="font-bold capitalize text-surface-900">{selectedCaseModal.evidence_quality_rating}</span>
              </div>
            </div>

            {/* Side-by-Side Comparison Layout (Phase 3) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-surface-900 uppercase tracking-wide flex items-center gap-1.5">
                <span>🛰️</span> Multi-Temporal Observation & Sensor Comparison
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-surface-50 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-surface-900">Baseline Window</span>
                    <span className="font-mono text-gray-500">{selectedCaseModal.earlier_date || '2023-01'}</span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-gray-100 text-xs text-gray-600 space-y-1">
                    <div><strong>Sensors:</strong> Sentinel-2 Level-2A & Sentinel-1 SAR</div>
                    <div><strong>Condition:</strong> Undisturbed vegetation canopy / baseline reservoir level</div>
                    <div className="text-[11px] text-gray-400">Attribution: {selectedCaseModal.attribution || 'ESA / Copernicus via GEE'}</div>
                  </div>
                </div>

                <div className="p-4 bg-surface-50 rounded-xl border border-gray-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-surface-900">Evaluation Window</span>
                    <span className="font-mono text-gray-500">{selectedCaseModal.later_date || '2024-04'}</span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-gray-100 text-xs text-gray-600 space-y-1">
                    <div><strong>GeoVision AI Result:</strong> {selectedCaseModal.geovision_prediction ? (selectedCaseModal.geovision_prediction.quality_aware_adaptive_fusion ? 'Change Detected' : 'No Change Detected') : 'User Verified'}</div>
                    <div><strong>Ground Truth:</strong> {selectedCaseModal.reference_label}</div>
                    <div className="text-[11px] text-gray-400">Attribution: {selectedCaseModal.reference_platform}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Reviewer Rationale & Audit Trail */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 space-y-1.5">
              <span className="font-bold block text-surface-900">Reviewer Interpretation & Ground Truth Rationale:</span>
              <p className="leading-relaxed">{selectedCaseModal.reviewer_notes}</p>
              {selectedCaseModal.evidence_url && (
                <div className="pt-1">
                  <a
                    href={selectedCaseModal.evidence_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <span>🔗</span> View External Primary Evidence ({selectedCaseModal.evidence_identifier})
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCaseModal(null)}
                className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-800 rounded-lg text-xs font-semibold"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: MANUAL EVIDENCE IMPORT WORKFLOW (Phase 4)                        */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[11px] font-mono text-emerald-700 uppercase font-bold">
                  Satellite Reference Evidence Registration
                </span>
                <h3 className="text-lg font-bold text-surface-900">Register Reference Case Evidence</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-surface-900 text-xl font-bold p-1"
              >
                ✕
              </button>
            </div>

            {importSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-lg font-semibold">
                ✓ {importSuccess}
              </div>
            )}
            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-900 text-xs rounded-lg font-semibold">
                ⚠️ {importError}
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Site / AOI Name</label>
                  <input
                    type="text"
                    required
                    value={importForm.aoi_name}
                    onChange={(e) => setImportForm({ ...importForm, aoi_name: e.target.value })}
                    placeholder="e.g. Pune Regional Verification Site"
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 text-surface-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Environmental Module</label>
                  <select
                    value={importForm.module}
                    onChange={(e) => setImportForm({ ...importForm, module: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 text-surface-900"
                  >
                    <option value="deforestation">Deforestation & Canopy Loss</option>
                    <option value="mining">Mining & Land Disturbance</option>
                    <option value="flood">Flood Inundation & Water Extent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Latitude (°N)</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={importForm.lat}
                    onChange={(e) => setImportForm({ ...importForm, lat: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 font-mono text-surface-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Longitude (°E)</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={importForm.lng}
                    onChange={(e) => setImportForm({ ...importForm, lng: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 font-mono text-surface-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Buffer Radius (m)</label>
                  <input
                    type="number"
                    step="50"
                    required
                    value={importForm.buffer_meters}
                    onChange={(e) => setImportForm({ ...importForm, buffer_meters: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 font-mono text-surface-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Baseline Observation Date</label>
                  <input
                    type="date"
                    required
                    value={importForm.earlier_date}
                    onChange={(e) => setImportForm({ ...importForm, earlier_date: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 font-mono text-surface-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Evaluation Observation Date</label>
                  <input
                    type="date"
                    required
                    value={importForm.later_date}
                    onChange={(e) => setImportForm({ ...importForm, later_date: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 font-mono text-surface-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Reference Source Platform</label>
                  <select
                    value={importForm.reference_platform}
                    onChange={(e) => setImportForm({ ...importForm, reference_platform: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 text-surface-900"
                  >
                    <option value="USGS Landsat Collection 2 Level-2">USGS Landsat Collection 2 Level-2 (Landsat 8/9, 30m)</option>
                    <option value="USGS Landsat 7 ETM+ C2 L2">USGS Landsat 7 ETM+ C2 L2 (30m Historical)</option>
                    <option value="USGS Landsat 5 TM C2 L2">USGS Landsat 5 TM C2 L2 (30m Historical)</option>
                    <option value="Field GPS Ground Survey">Field GPS Ground Survey</option>
                    <option value="State Irrigation Dept Records">State Irrigation Dept Records</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Ground Truth Label</label>
                  <select
                    value={importForm.reference_label}
                    onChange={(e) => setImportForm({ ...importForm, reference_label: e.target.value })}
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 text-surface-900 font-semibold"
                  >
                    <option value="change_observed">Change Observed (Positive Detection)</option>
                    <option value="no_change_observed">No Change Observed (Negative Control)</option>
                    <option value="uncertain">Uncertain Observation</option>
                    <option value="insufficient_imagery">Insufficient Clear Imagery</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-surface-800 block mb-1">Reviewer Label Rationale & Interpretation</label>
                <textarea
                  required
                  rows={2}
                  value={importForm.label_rationale}
                  onChange={(e) => setImportForm({ ...importForm, label_rationale: e.target.value })}
                  placeholder="Explain why this site was classified as change vs negative control (e.g. Landsat 30m Collection 2 L2 reflectance indicates significant spectral shift)..."
                  className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 text-surface-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Evidence ID / Scene Identifier</label>
                  <input
                    type="text"
                    value={importForm.evidence_identifier}
                    onChange={(e) => setImportForm({ ...importForm, evidence_identifier: e.target.value })}
                    placeholder="e.g. LANDSAT-LC08-2024-PUN"
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 font-mono text-surface-900"
                  />
                </div>
                <div>
                  <label className="font-semibold text-surface-800 block mb-1">Source URL / Link</label>
                  <input
                    type="url"
                    value={importForm.evidence_url}
                    onChange={(e) => setImportForm({ ...importForm, evidence_url: e.target.value })}
                    placeholder="https://earthengine.google.com/..."
                    className="w-full bg-surface-50 border border-gray-200 rounded-lg p-2 text-surface-900"
                  />
                </div>
              </div>


              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-surface-100 hover:bg-surface-200 text-surface-800 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importSubmitting}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold shadow-xs"
                >
                  {importSubmitting ? 'Registering...' : 'Register Reference Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
