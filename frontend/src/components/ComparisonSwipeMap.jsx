import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_STYLES, getBasemapStyle } from '../config/basemaps';

/**
 * Interactive Before/After Satellite Comparison Swipe Map.
 * Synchronizes two MapLibre GL map instances and provides a draggable vertical
 * divider with a slider handle for direct visual comparison of real temporal satellite imagery.
 */
export default function ComparisonSwipeMap({
  geometry,
  beforeTileUrl,
  afterTileUrl,
  beforeLabel = 'Before Period',
  afterLabel = 'After Period',
  activeLayer = 'rgb', // 'rgb' | 'cir' | 'delta_ndvi' | 'delta_ndwi'
  isLoading = false,
  error = null,
  isDemo = false,
}) {
  const containerRef = useRef(null);
  const beforeContainerRef = useRef(null);
  const afterContainerRef = useRef(null);

  const beforeMapRef = useRef(null);
  const afterMapRef = useRef(null);
  const isSyncingRef = useRef(false);

  // Basemap selection - default to high-res Satellite Imagery so no street basemap obscures the view
  const [selectedBasemap, setSelectedBasemap] = useState('satellite'); // 'satellite' | 'dark' | 'osm'

  // Draggable slider position in percentage (0 to 100)
  const [sliderPct, setSliderPct] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);

  // Tile status feedback
  const [tileError, setTileError] = useState(null);

  // ── Helper: Safely apply raster layer on top of basemap ────────────────
  const safeApplyLayer = useCallback((map, sourceId, layerId, tileUrl) => {
    if (!map) return;

    const apply = () => {
      try {
        // 1. Remove existing layer and source if present
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }

        if (!tileUrl) return;

        // 2. Add satellite raster tile source
        map.addSource(sourceId, {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Google Earth Engine &copy; Copernicus Sentinel-2',
        });

        // 3. Insert BEFORE aoi-fill so the vector boundary is on top,
        // or at the top of the stack if aoi-fill does not exist.
        // This guarantees it renders ABOVE any street or satellite basemap!
        const beforeId = map.getLayer('aoi-fill') ? 'aoi-fill' : undefined;

        map.addLayer(
          {
            id: layerId,
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': 1.0,
              'raster-fade-duration': 0, // Clean instant switch between active layers
            },
          },
          beforeId
        );
      } catch (err) {
        console.warn(`[ComparisonSwipeMap] Notice applying layer ${layerId}:`, err);
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      const onStyleReady = () => {
        map.off('load', onStyleReady);
        map.off('styledata', onStyleReady);
        apply();
      };
      map.once('load', onStyleReady);
      map.once('styledata', onStyleReady);
    }
  }, []);

  // ── Helper: Apply AOI boundary polygon and stroke ──────────────────────
  const applyAoi = useCallback((map, geom) => {
    if (!map || !geom) return;

    const execute = () => {
      try {
        const aoiGeoJson = {
          type: 'Feature',
          geometry: geom,
          properties: {},
        };

        if (map.getSource('aoi-boundary')) {
          map.getSource('aoi-boundary').setData(aoiGeoJson);
        } else {
          map.addSource('aoi-boundary', {
            type: 'geojson',
            data: aoiGeoJson,
          });

          map.addLayer({
            id: 'aoi-fill',
            type: 'fill',
            source: 'aoi-boundary',
            paint: {
              'fill-color': '#06b6d4',
              'fill-opacity': 0.04,
            },
          });

          map.addLayer({
            id: 'aoi-stroke',
            type: 'line',
            source: 'aoi-boundary',
            paint: {
              'line-color': '#06b6d4',
              'line-width': 2.5,
              'line-dasharray': [2, 1],
            },
          });
        }
      } catch (err) {
        console.warn('[ComparisonSwipeMap] Notice applying AOI boundary:', err);
      }
    };

    if (map.isStyleLoaded()) {
      execute();
    } else {
      const onStyleReady = () => {
        map.off('load', onStyleReady);
        map.off('styledata', onStyleReady);
        execute();
      };
      map.once('load', onStyleReady);
      map.once('styledata', onStyleReady);
    }
  }, []);

  // ── 1. Initialize Dual Synchronized MapLibre Maps ───────────────────────
  useEffect(() => {
    if (!beforeContainerRef.current || !afterContainerRef.current) return;

    let isDisposed = false;
    const baseStyle = getBasemapStyle(selectedBasemap);

    // Initial center from geometry or default India center
    let initialCenter = [73.8567, 18.5204];
    let initialZoom = 11;

    if (geometry && geometry.coordinates) {
      try {
        const flat =
          geometry.type === 'Polygon'
            ? geometry.coordinates[0]
            : geometry.type === 'MultiPolygon'
            ? geometry.coordinates[0][0]
            : [geometry.coordinates];
        if (flat && flat.length > 0) {
          const lngs = flat.map((p) => p[0]);
          const lats = flat.map((p) => p[1]);
          initialCenter = [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
        }
      } catch (_) {}
    }

    // Initialize Before Map (Left / Base Map)
    const beforeMap = new Map({
      container: beforeContainerRef.current,
      style: baseStyle,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    // Initialize After Map (Right / Clipped Map)
    const afterMap = new Map({
      container: afterContainerRef.current,
      style: baseStyle,
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: false,
    });

    // Controls on Before Map
    beforeMap.addControl(new NavigationControl({ showCompass: false }), 'bottom-left');

    beforeMapRef.current = beforeMap;
    afterMapRef.current = afterMap;

    // Camera Synchronization
    const sync = (source, target) => {
      if (isSyncingRef.current || isDisposed) return;
      isSyncingRef.current = true;
      target.jumpTo({
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
      });
      isSyncingRef.current = false;
    };

    const onBeforeMove = () => sync(beforeMap, afterMap);
    const onAfterMove = () => sync(afterMap, beforeMap);

    beforeMap.on('move', onBeforeMove);
    afterMap.on('move', onAfterMove);

    // Sanitized Error Listeners (Never log authentication tokens or full URLs)
    const onTileErr = (e) => {
      if (e?.sourceId === 'before-satellite-source' || e?.sourceId === 'after-satellite-source') {
        console.warn(`[ComparisonSwipeMap] Satellite tile load error on ${e.sourceId}`);
        setTileError('A satellite tile failed to load. Check date intervals or cloud thresholds.');
      }
    };

    beforeMap.on('error', onTileErr);
    afterMap.on('error', onTileErr);

    // Resize Observer to handle container resizing
    const resizeObserver = new ResizeObserver(() => {
      if (!isDisposed) {
        beforeMap.resize();
        afterMap.resize();
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      beforeMap.off('move', onBeforeMove);
      afterMap.off('move', onAfterMove);
      beforeMap.off('error', onTileErr);
      afterMap.off('error', onTileErr);
      beforeMap.remove();
      afterMap.remove();
      beforeMapRef.current = null;
      afterMapRef.current = null;
    };
  }, [selectedBasemap]);

  // ── 2. Update AOI Overlay & Camera Fitting ─────────────────────────────
  useEffect(() => {
    const bMap = beforeMapRef.current;
    const aMap = afterMapRef.current;
    if (!bMap || !aMap || !geometry) return;

    applyAoi(bMap, geometry);
    applyAoi(aMap, geometry);

    // Fit camera to AOI
    try {
      const flat =
        geometry.type === 'Polygon'
          ? geometry.coordinates[0]
          : geometry.type === 'MultiPolygon'
          ? geometry.coordinates[0][0]
          : [geometry.coordinates];

      if (flat && flat.length > 1) {
        const lngs = flat.map((p) => p[0]);
        const lats = flat.map((p) => p[1]);
        const bounds = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ];
        bMap.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 600 });
      }
    } catch (_) {}
  }, [geometry, applyAoi]);

  // ── 3. Apply Satellite Raster Tile Layers ──────────────────────────────
  useEffect(() => {
    safeApplyLayer(beforeMapRef.current, 'before-satellite-source', 'before-satellite-layer', beforeTileUrl);
  }, [beforeTileUrl, safeApplyLayer, selectedBasemap]);

  useEffect(() => {
    safeApplyLayer(afterMapRef.current, 'after-satellite-source', 'after-satellite-layer', afterTileUrl);
  }, [afterTileUrl, safeApplyLayer, selectedBasemap]);

  // ── 4. Draggable Slider Interaction (Mouse, Touch, Keyboard) ───────────
  const updateSliderPos = useCallback((clientX) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const clampedPct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPct(clampedPct);
  }, []);

  const handlePointerDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingRef.current = true;
      setIsDragging(true);
      updateSliderPos(e.clientX);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
    },
    [updateSliderPos]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      updateSliderPos(e.clientX);
    },
    [updateSliderPos]
  );

  const handlePointerUp = useCallback((e) => {
    isDraggingRef.current = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }, []);

  // Window-level pointer tracking ensures seamless dragging across the entire screen
  useEffect(() => {
    const onWindowPointerMove = (e) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      updateSliderPos(e.clientX);
    };

    const onWindowPointerUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
    };
  }, [updateSliderPos]);

  // Keyboard navigation for accessibility
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setSliderPct((prev) => Math.max(0, prev - 5));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setSliderPct((prev) => Math.min(100, prev + 5));
    } else if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      setSliderPct(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      setSliderPct(100);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[540px] md:h-[600px] overflow-hidden rounded-xl border border-surface-700 bg-surface-950 select-none shadow-2xl focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Satellite Before and After Swipe Comparison Map"
    >
      {/* ── Layer 1: Before Map (Left/Base) ─────────────────────────── */}
      <div
        ref={beforeContainerRef}
        className="absolute inset-0 w-full h-full z-0"
      />

      {/* ── Layer 2: After Map (Right/Clipped by Slider) ────────────── */}
      <div
        ref={afterContainerRef}
        className="absolute inset-0 w-full h-full z-10"
        style={{
          clipPath: `inset(0 0 0 ${sliderPct}%)`,
          WebkitClipPath: `inset(0 0 0 ${sliderPct}%)`,
        }}
      />

      {/* ── Draggable Vertical Slider Divider ──────────────────────── */}
      <div
        className="absolute top-0 bottom-0 z-20 cursor-ew-resize flex items-center justify-center touch-none select-none -translate-x-1/2 w-8"
        style={{ left: `${sliderPct}%` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="slider"
        aria-valuenow={Math.round(sliderPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Swipe comparison position"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Visible Divider Line (Coincides exactly with sliderPct clipping boundary) */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.8)] pointer-events-none" />

        {/* Handle Button */}
        <div
          className={`relative z-10 w-10 h-10 rounded-full bg-surface-900 text-white shadow-2xl flex items-center justify-center border-2 border-brand-500 font-bold transition-transform select-none ${
            isDragging ? 'scale-110 ring-4 ring-brand-500/40' : 'hover:scale-105'
          }`}
          title="Drag left or right to swipe before/after satellite imagery"
        >
          <svg
            className="w-5 h-5 text-brand-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M8 9l-4 3 4 3m8-6l4 3-4 3"
            />
          </svg>
        </div>
      </div>

      {/* ── Period Badges & Labels ──────────────────────────────────── */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-surface-900/90 backdrop-blur-md border border-surface-700 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
          <span className="font-semibold text-gray-300">BEFORE:</span>
          <span className="font-medium text-blue-300">{beforeLabel}</span>
          {beforeTileUrl && (
            <span className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800 px-1.5 py-0.2 rounded font-mono">
              S2-L2A
            </span>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        <div className="bg-surface-900/90 backdrop-blur-md border border-surface-700 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-semibold text-gray-300">AFTER:</span>
          <span className="font-medium text-emerald-300">{afterLabel}</span>
          {afterTileUrl && (
            <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded font-mono">
              S2-L2A
            </span>
          )}
        </div>
      </div>

      {/* ── Basemap Selector & Slider Position (Bottom) ─────────────── */}
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-surface-900/90 backdrop-blur-md border border-surface-700 p-1 rounded-xl shadow-lg flex items-center gap-1 text-[11px]">
          <span className="text-gray-400 px-2 font-medium">Basemap:</span>
          <button
            type="button"
            onClick={() => setSelectedBasemap('satellite')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              selectedBasemap === 'satellite' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'
            }`}
          >
            🛰️ Satellite
          </button>
          <button
            type="button"
            onClick={() => setSelectedBasemap('dark')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              selectedBasemap === 'dark' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'
            }`}
          >
            🌑 Dark Canvas
          </button>
          <button
            type="button"
            onClick={() => setSelectedBasemap('osm')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              selectedBasemap === 'osm' ? 'bg-brand-600 text-white' : 'text-gray-300 hover:text-white'
            }`}
          >
            🗺️ Street Context
          </button>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
        <div className="bg-surface-900/85 backdrop-blur-sm border border-surface-700 text-gray-300 text-[11px] px-3 py-1 rounded-full shadow">
          Swipe: <span className="text-brand-400 font-bold">{Math.round(sliderPct)}%</span> | Drag bar or use Arrow keys
        </div>
      </div>

      {/* ── Demo Mode Warning Banner ─────────────────────────────────── */}
      {isDemo && !isLoading && (
        <div className="absolute top-16 left-4 right-4 z-20 bg-amber-950/90 border border-amber-500/60 backdrop-blur-md text-amber-200 text-xs p-3 rounded-xl shadow-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🧪</span>
            <span>
              <strong>DEMO CALIBRATION:</strong> Live satellite tile streaming requires an active Google Earth Engine connection. Change metrics shown are illustrative calibration estimates.
            </span>
          </div>
          <span className="bg-amber-900 text-amber-300 border border-amber-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase">
            Demo Mode
          </span>
        </div>
      )}

      {/* ── Loading Overlay ────────────────────────────────────────── */}
      {isLoading && (
        <div className="absolute inset-0 z-30 bg-surface-900/75 backdrop-blur-sm flex flex-col items-center justify-center text-white">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-semibold tracking-wide text-brand-400">Processing Earth Engine Satellite Tiles...</p>
          <p className="text-xs text-gray-400 mt-1">Filtering Sentinel-2 scenes & applying Cloud Score+ masks</p>
        </div>
      )}

      {/* ── Error Overlay ──────────────────────────────────────────── */}
      {(error || tileError) && !isLoading && (
        <div className="absolute top-16 left-4 right-4 z-20 bg-red-950/90 border border-red-500/60 backdrop-blur-md text-red-100 text-xs p-3.5 rounded-xl shadow-xl flex items-start gap-3">
          <span className="text-lg">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold text-white">Satellite Imagery Notification</p>
            <p className="mt-0.5 text-red-200">{error || tileError}</p>
          </div>
          <button
            type="button"
            onClick={() => setTileError(null)}
            className="text-red-300 hover:text-white text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
