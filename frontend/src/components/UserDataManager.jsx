import { useState, useEffect, useRef } from 'react';
import { apiFetch, apiPost } from '../api/client';

export default function UserDataManager({ onDataUpdated }) {
  const [status, setStatus] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const fetchStatus = async () => {
    const { data, error: err } = await apiFetch('/user-data/status');
    if (!err && data) {
      setStatus(data);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/user-data/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.detail || 'Upload failed');
      }

      setSuccessMsg(`Loaded ${result.total_points?.toLocaleString()} points from ${result.filename}!`);
      await fetchStatus();
      if (onDataUpdated) onDataUpdated();

      setTimeout(() => {
        setModalOpen(false);
        setSuccessMsg(null);
      }, 1500);
    } catch (err) {
      setError(err.message || 'Error processing uploaded file');
    } finally {
      setUploading(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setError(null);
    try {
      const { data, error: err } = await apiPost('/user-data/reset', {});
      if (err) throw new Error(err);
      await fetchStatus();
      if (onDataUpdated) onDataUpdated();
    } catch (err) {
      setError(err.message || 'Error resetting dataset');
    } finally {
      setResetting(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <>
      {/* Sleek Data Management Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full animate-pulse ${status?.is_user_dataset ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Active Dataset</span>
              {status?.is_user_dataset ? (
                <span className="bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full text-xs">
                  User Ingested ({status.total_points?.toLocaleString()} pts)
                </span>
              ) : (
                <span className="bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full text-xs">
                  Sentinel-2 Operational ({status?.total_points?.toLocaleString() || 5000} pts)
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              {status?.filename || 'Copernicus Sentinel-2 Level-2A Multi-Temporal'} — Updated: {status?.last_updated || 'Latest'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status?.is_user_dataset && (
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-xs font-semibold px-3 py-2 text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1.5"
              title="Reset back to standard 5,000-point Sentinel-2 dataset"
            >
              🔄 {resetting ? 'Resetting...' : 'Reset to Sentinel-2'}
            </button>
          )}

          <a
            href="/api/user-data/template"
            download="geovision_user_dataset_template.csv"
            className="text-xs font-semibold px-3 py-2 text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Download CSV format template"
          >
            📥 Template
          </a>

          <button
            onClick={() => setModalOpen(true)}
            className="text-xs font-bold px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
          >
            📤 Upload Custom Data
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Upload User Geospatial Dataset</h3>
                <p className="text-xs text-gray-500 mt-0.5">Import custom survey points, sensor coordinates, or field data.</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                &times;
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2">
                <span>✅</span> {successMsg}
              </div>
            )}

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-4 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.geojson,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="text-4xl mb-2">📁</div>
              <p className="text-sm font-semibold text-gray-800">
                {uploading ? 'Processing & calculating risks...' : 'Click to browse or drag and drop your dataset'}
              </p>
              <p className="text-xs text-gray-500 mt-1">Supports CSV, GeoJSON (.geojson), or JSON</p>
            </div>

            {/* Guidance */}
            <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-200/60 text-xs text-gray-600 space-y-1.5">
              <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                <span>💡</span> Expected Columns / Attributes:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-600 pl-1">
                <li><b className="text-gray-700">Required:</b> <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">latitude</code>, <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">longitude</code> (or GeoJSON features)</li>
                <li><b className="text-gray-700">Optional:</b> <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">region</code>, <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">NDVI_2023</code>, <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">NDVI_2026</code>, <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">NDBI_Change</code>, <code className="bg-white px-1 py-0.5 rounded text-gray-800 font-mono">NDWI_Change</code></li>
              </ul>
              <p className="text-[11px] text-gray-500 pt-1">
                Spectral values are auto-computed via the platform risk engine if missing.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
