const API_BASE = typeof window !== 'undefined' ? '/api' : 'http://127.0.0.1:8000/api';

let _healthCache = null;
let _healthPromise = null;

/**
 * Fetch and cache the backend health status (/api/health).
 * Reuses in-flight promise and memory cache to prevent redundant polling.
 */
export async function getHealthStatus(forceRefresh = false) {
  if (!forceRefresh && _healthCache) {
    return _healthCache;
  }
  if (!forceRefresh && _healthPromise) {
    return _healthPromise;
  }
  _healthPromise = apiFetch('/health')
    .then((res) => {
      if (res && res.data) {
        _healthCache = res;
      }
      _healthPromise = null;
      return res;
    })
    .catch((err) => {
      _healthPromise = null;
      return { data: null, error: err?.message || 'Failed to fetch health status' };
    });
  return _healthPromise;
}

export async function apiFetch(endpoint, options = {}) {
  const { timeout = 60000, signal, ...customOptions } = options;
  const controller = new AbortController();
  let isTimeout = false;
  const timer = setTimeout(() => {
    isTimeout = true;
    controller.abort();
  }, timeout);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...customOptions,
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.detail || `API ${res.status}: ${res.statusText}`);
    }
    return { data: await res.json(), error: null, isAborted: false, isTimeout: false };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        data: null,
        error: isTimeout ? 'Request timed out. The satellite computation took longer than expected.' : 'Request was cancelled.',
        isAborted: true,
        isTimeout,
      };
    }
    console.error(`[API] ${endpoint}:`, err);
    return { data: null, error: err.message, isAborted: false, isTimeout: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPost(endpoint, body) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.detail || `API ${res.status}: ${res.statusText}`);
    }
    return { data: await res.json(), error: null };
  } catch (err) {
    console.error(`[API] POST ${endpoint}:`, err);
    return { data: null, error: err.message };
  }
}

export async function downloadFile(url, defaultFilename) {
  const res = await fetch(url);
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.detail || `Download failed with HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const disposition = res.headers.get('content-disposition');
  let filename = defaultFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function downloadFilePost(url, body, defaultFilename) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.detail || `Download failed with HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const disposition = res.headers.get('content-disposition');
  let filename = defaultFilename;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

export async function downloadPdf(module, riskLevel) {
  const params = new URLSearchParams();
  if (module && module !== 'all') params.append('module', module);
  if (riskLevel && riskLevel !== 'all') params.append('risk_level', riskLevel);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const url = `${API_BASE}/reports/pdf${qs}`;
  const today = new Date().toISOString().slice(0, 10);
  return downloadFile(url, `geovision_report_${module || 'all'}_${today}.pdf`);
}

