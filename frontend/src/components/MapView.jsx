import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, NavigationControl, FullscreenControl, AttributionControl, Popup, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiFetch } from '../api/client';
import {
  BASEMAP_STYLES,
  DEFAULT_BASEMAP_ID,
  getBasemapStyle,
  getBasemapOptions,
  resolveSafeBasemapId,
} from '../config/basemaps';

const RISK_COLORS = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };

/**
 * Returns a recommended action based on risk level and module type.
 */
function getRecommendedAction(riskLevel, module) {
  const actions = {
    deforestation: {
      High: 'Immediate field inspection. Cross-verify with ground surveys and recent land-use records.',
      Medium: 'Schedule follow-up satellite pass. Monitor for continued NDVI decline.',
      Low: 'Continue routine monitoring. No immediate action required.',
    },
    mining: {
      High: 'Flag for regulatory review. Cross-reference with mining permits and land-use zoning.',
      Medium: 'Increase monitoring frequency. Compare with historical NDBI patterns.',
      Low: 'Continue periodic observation. NDBI changes within expected range.',
    },
    flood: {
      High: 'Issue risk advisory. Coordinate with local disaster management and drainage authorities.',
      Medium: 'Monitor water levels in upcoming monsoon. Pre-position response resources.',
      Low: 'Standard monitoring. NDWI values within seasonal norms.',
    },
  };
  return actions[module]?.[riskLevel] || 'Continue standard monitoring cycle.';
}

// ── Satellite & Environmental Index Layer Definitions ────────────────
const GEE_LAYERS_CONFIG = [
  { key: 'none', label: 'Basemap Only', icon: '🗺️', desc: 'Street / Terrain Vector Basemap without satellite overlay' },
  { key: 'true_color', label: 'True Color (RGB)', icon: '🛰️', desc: 'Sentinel-2 B4-B3-B2 Natural Surface Satellite Imagery' },
  { key: 'false_color', label: 'False Color (CIR)', icon: '🌿', desc: 'Sentinel-2 B8-B4-B3 Infrared Canopy Vigour' },
  { key: 'ndvi', label: 'NDVI Vegetation Health', icon: '🌳', desc: 'Normalized Difference Vegetation Index' },
  { key: 'ndvi_change', label: 'NDVI Decline Delta', icon: '🔴', desc: 'Vegetation Loss Delta between Baseline & Current' },
  { key: 'water_change', label: 'NDWI Water Change', icon: '🌊', desc: 'Water-Extent Change / Flood Inundation Delta' },
  { key: 'disturbance', label: 'NDBI Land Disturbance', icon: '⛏️', desc: 'Bare-Soil & Built-up Disturbance Delta' },
  { key: 's1_vv', label: 'Sentinel-1 SAR VV', icon: '📡', desc: 'C-Band Vertical Polarization Radar Backscatter (Surface Structure)' },
  { key: 's1_vh', label: 'Sentinel-1 SAR VH', icon: '🌲', desc: 'C-Band Cross-Polarization Radar Volume Backscatter (Canopy Biomass)' },
  { key: 's1_water', label: 'Radar Water Mask (S1)', icon: '💧', desc: 'All-Weather Specular Radar Water Detection (Penetrates Clouds)' },
];


function createGeoJsonCircle(centerLngLat, radiusKm, points = 64) {
  const [lng, lat] = centerLngLat;
  const coords = [];
  const distanceX = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([lng + x, lat + y]);
  }
  coords.push(coords[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: { radiusKm },
  };
}

/**
 * Reusable MapLibre GL JS component with live Google Earth Engine satellite raster overlays
 * and hardware-accelerated vector hotspot layers with 3D tilt.
 */
export default function MapView({
  hotspots = [],
  center = [18.5204, 73.8567],
  zoom = 12,
  height = '480px',
  isDemo = false,
  loading = false,
  error = null,
  startYear = 2023,
  endYear = 2026,
  startMonth = 1,
  endMonth = 4,
  defaultLayer = 'true_color',
  title = '',
  tileLayers = null,
  pinLocation = null,
  onLocationChange = null,
}) {
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const popupRef = useRef(null);
  const pinMarkerRef = useRef(null);

  const [geeTiles, setGeeTiles] = useState(tileLayers);
  const [activeGeeLayer, setActiveGeeLayer] = useState(defaultLayer);
  const [loadingTiles, setLoadingTiles] = useState(false);
  const [tileError, setTileError] = useState(null);
  const [opacity, setOpacity] = useState(0.85);
  const [showHotspots, setShowHotspots] = useState(true);
  const [hotspotModuleFilter, setHotspotModuleFilter] = useState('all'); // 'all' | 'deforestation' | 'mining' | 'flood'
  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP_ID);
  const [basemapNotice, setBasemapNotice] = useState(null);
  const [is3D, setIs3D] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const basemapKeyRef = useRef(basemapKey);
  useEffect(() => {
    basemapKeyRef.current = basemapKey;
  }, [basemapKey]);

  const pinLocationRef = useRef(pinLocation);
  useEffect(() => {
    pinLocationRef.current = pinLocation;
  }, [pinLocation]);

  // Normalize center: Leaflet was [lat, lng] -> MapLibre is [lng, lat]
  const lngLatCenter = Array.isArray(center) && center.length === 2
    ? [center[1], center[0]]
    : [73.8567, 18.5204];

  // ── Use passed-in tileLayers if available ──────────────────────────
  useEffect(() => {
    if (tileLayers && Object.keys(tileLayers).length > 0) {
      setGeeTiles(tileLayers);
      if (defaultLayer && tileLayers[defaultLayer]) {
        setActiveGeeLayer(defaultLayer);
      } else if (tileLayers.true_color) {
        setActiveGeeLayer('true_color');
      }
    }
  }, [tileLayers, defaultLayer]);

  // ── Fetch live GEE tile URLs when temporal window changes ──────────
  useEffect(() => {
    if (tileLayers && Object.keys(tileLayers).length > 0) return;
    let isMounted = true;
    const loadTiles = async () => {
      setLoadingTiles(true);
      setTileError(null);
      let tileQuery = `/gee/tiles?start_year=${startYear}&end_year=${endYear}&start_month=${startMonth}&end_month=${endMonth}`;
      if (pinLocation && pinLocation.lat != null && pinLocation.lng != null) {
        tileQuery += `&lat=${pinLocation.lat}&lng=${pinLocation.lng}&radius_km=${pinLocation.radiusKm || 5.0}`;
      }
      const { data, error: err } = await apiFetch(tileQuery);
      if (!isMounted) return;

      if (err) {
        setTileError('GEE raster tiles temporarily unavailable. Operating in basemap mode.');
      } else if (data && data.layers) {
        setGeeTiles(data.layers);
        if (defaultLayer && data.layers[defaultLayer]) {
          setActiveGeeLayer(defaultLayer);
        } else if (data.layers.true_color) {
          setActiveGeeLayer('true_color');
        }
      }
      setLoadingTiles(false);
    };
    loadTiles();
    return () => {
      isMounted = false;
    };
  }, [startYear, endYear, startMonth, endMonth, defaultLayer, pinLocation?.lat, pinLocation?.lng, pinLocation?.radiusKm]);

  // Filter hotspots based on module filter
  const filteredHotspots = hotspots.filter((h) => {
    if (hotspotModuleFilter === 'all') return true;
    return h.module?.toLowerCase() === hotspotModuleFilter.toLowerCase();
  });

  const opacityRef = useRef(opacity);
  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  // ── Update Hotspots GeoJSON source ─────────────────────────────────
  const updateHotspotsData = useCallback(() => {
    const map = mapInstance.current;
    if (!map || !map.getStyle()) return;

    const source = map.getSource('hotspots-source');
    if (!source) return;

    const sample =
      filteredHotspots.length > 1500
        ? filteredHotspots.filter((_, i) => i % Math.ceil(filteredHotspots.length / 1500) === 0)
        : filteredHotspots;

    const geojson = {
      type: 'FeatureCollection',
      features: sample
        .filter((h) => h.latitude && h.longitude)
        .map((h, idx) => ({
          type: 'Feature',
          id: idx,
          geometry: {
            type: 'Point',
            coordinates: [h.longitude, h.latitude],
          },
          properties: {
            ...h,
            risk_color: RISK_COLORS[h.risk_level] || '#94a3b8',
          },
        })),
    };

    source.setData(geojson);
  }, [filteredHotspots]);

  // ── Update GEE Satellite Raster Overlay ─────────────────────────────
  const updateGeeRasterLayer = useCallback(() => {
    const map = mapInstance.current;
    if (!map || !map.getStyle()) return;

    const sourceId = 'gee-raster-source';
    const layerId = 'gee-raster-layer';

    // Remove existing raster layer & source if present
    if (map.getLayer(layerId)) {
      try {
        map.removeLayer(layerId);
      } catch (err) {
        console.warn('Error removing gee-raster-layer:', err);
      }
    }
    if (map.getSource(sourceId)) {
      try {
        map.removeSource(sourceId);
      } catch (err) {
        console.warn('Error removing gee-raster-source:', err);
      }
    }

    if (activeGeeLayer === 'none' || !geeTiles || !geeTiles[activeGeeLayer]) {
      return;
    }

    const tileUrl = geeTiles[activeGeeLayer];

    try {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: 'Google Earth Engine &copy; Copernicus Sentinel-2',
      });

      // Place the raster layer underneath hotspots circle layers so points stay on top
      const beforeId = map.getLayer('hotspots-glow-layer')
        ? 'hotspots-glow-layer'
        : (map.getLayer('hotspots-circles-layer') ? 'hotspots-circles-layer' : undefined);

      map.addLayer(
        {
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': opacityRef.current,
            'raster-fade-duration': 0,
          },
        },
        beforeId
      );
    } catch (e) {
      console.warn('MapLibre: Failed adding GEE raster source/layer:', e);
    }
  }, [activeGeeLayer, geeTiles]);

  // ── Sync Layers after Style Loads ──────────────────────────────────
  const setupLayersOnStyle = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Hotspots GeoJSON source
    if (!map.getSource('hotspots-source')) {
      map.addSource('hotspots-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // Hotspots glow layer
    if (!map.getLayer('hotspots-glow-layer')) {
      map.addLayer({
        id: 'hotspots-glow-layer',
        type: 'circle',
        source: 'hotspots-source',
        layout: {
          visibility: showHotspots ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'risk_score'],
            0, 6,
            40, 10,
            70, 15,
            100, 20
          ],
          'circle-color': [
            'match', ['get', 'risk_level'],
            'High', '#ef4444',
            'Medium', '#f59e0b',
            'Low', '#22c55e',
            '#94a3b8'
          ],
          'circle-opacity': 0.25,
          'circle-blur': 0.6,
        },
      });
    }

    // Hotspots solid circle layer
    if (!map.getLayer('hotspots-circles-layer')) {
      map.addLayer({
        id: 'hotspots-circles-layer',
        type: 'circle',
        source: 'hotspots-source',
        layout: {
          visibility: showHotspots ? 'visible' : 'none',
        },
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'risk_score'],
            0, 3.5,
            40, 5.5,
            70, 7.5,
            100, 9
          ],
          'circle-color': [
            'match', ['get', 'risk_level'],
            'High', '#ef4444',
            'Medium', '#f59e0b',
            'Low', '#22c55e',
            '#94a3b8'
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.95,
        },
      });

      // Cursor changes on hover
      map.on('mouseenter', 'hotspots-circles-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'hotspots-circles-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      // Interactive Click Popup
      map.on('click', 'hotspots-circles-layer', (e) => {
        if (!e.features || !e.features.length) return;
        const f = e.features[0];
        const p = f.properties;
        const coords = f.geometry.coordinates.slice();

        const color = RISK_COLORS[p.risk_level] || '#94a3b8';
        const action = getRecommendedAction(p.risk_level, p.module);
        const changeVal = p.change_value != null ? Number(p.change_value) : null;
        const confVal = p.confidence != null ? Number(p.confidence) : null;

        const popupHtml = `
          <div style="font-family:Inter,system-ui,sans-serif;font-size:12px;min-width:240px;line-height:1.5;color:#1e293b;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <strong style="font-size:13px;color:#0f172a;">${p.region || 'Unknown Location'}</strong>
              <span style="font-size:10px;padding:2px 6px;border-radius:9999px;font-weight:700;background:${color}20;color:${color};border:1px solid ${color}40;">
                ${p.risk_level}
              </span>
            </div>
            <hr style="margin:6px 0;border-color:#e2e8f0"/>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:3px 8px;font-size:11.5px;">
              <span style="color:#64748b;">Module:</span>
              <span style="font-weight:600;text-transform:capitalize;">${p.module || 'Environmental'}</span>
              <span style="color:#64748b;">Coordinates:</span>
              <span>${Number(p.latitude).toFixed(4)}°, ${Number(p.longitude).toFixed(4)}°</span>
              <span style="color:#64748b;">Risk Score:</span>
              <span style="font-weight:700;color:${color};">${p.risk_score}/100</span>
              <span style="color:#64748b;">Change Delta:</span>
              <span>${changeVal != null ? (changeVal > 0 ? '+' : '') + changeVal.toFixed(4) : 'N/A'}</span>
              <span style="color:#64748b;">Confidence:</span>
              <span>${confVal != null ? (confVal * 100).toFixed(0) + '%' : 'N/A'}</span>
            </div>
            <div style="margin-top:6px;padding:4px 6px;background:#fef3c7;border-radius:4px;color:#92400e;font-size:10.5px;">
              <b>Status:</b> ${p.requires_field_verification ? '⚠️ Requires Field Verification' : 'Verified'}
            </div>
            <div style="margin-top:6px;padding:6px;background:${
              p.risk_level === 'High' ? '#fef2f2' : p.risk_level === 'Medium' ? '#fffbeb' : '#f0fdf4'
            };border-radius:6px;font-size:11px;color:#334155;border-left:3px solid ${color};">
              <b>📋 Recommended Action:</b><br/>${action}
            </div>
          </div>
        `;

        if (popupRef.current) {
          popupRef.current.remove();
        }

        popupRef.current = new Popup({
          offset: 10,
          maxWidth: '310px',
          className: 'geovision-maplibre-popup',
        })
          .setLngLat(coords)
          .setHTML(popupHtml)
          .addTo(map);
      });
    }

    updateHotspotsData();
    updateGeeRasterLayer();

    // Preserve pin radius buffer if active
    if (pinLocationRef.current && pinLocationRef.current.lat != null && pinLocationRef.current.lng != null) {
      const pl = pinLocationRef.current;
      const lngLat = [Number(pl.lng), Number(pl.lat)];
      const radKm = Number(pl.radiusKm) || 5.0;
      const circleData = createGeoJsonCircle(lngLat, radKm);

      if (!map.getSource('pin-radius-source')) {
        map.addSource('pin-radius-source', {
          type: 'geojson',
          data: circleData,
        });
      } else {
        map.getSource('pin-radius-source').setData(circleData);
      }

      if (!map.getLayer('pin-radius-fill')) {
        map.addLayer({
          id: 'pin-radius-fill',
          type: 'fill',
          source: 'pin-radius-source',
          paint: {
            'fill-color': '#2563eb',
            'fill-opacity': 0.15,
          },
        });
      }
      if (!map.getLayer('pin-radius-outline')) {
        map.addLayer({
          id: 'pin-radius-outline',
          type: 'line',
          source: 'pin-radius-source',
          paint: {
            'line-color': '#2563eb',
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
      }
    }
  }, [showHotspots, updateHotspotsData, updateGeeRasterLayer]);

  // ── Re-apply layers if basemap style changes ─────────────────────────
  const handleBasemapChange = (newKey) => {
    const safeKey = resolveSafeBasemapId(newKey);
    if (safeKey !== newKey) {
      setBasemapNotice(`Basemap '${newKey}' requires an API key. Falling back to OpenStreetMap.`);
      setTimeout(() => setBasemapNotice(null), 4000);
    }
    setBasemapKey(safeKey);
    basemapKeyRef.current = safeKey;
    const map = mapInstance.current;
    if (!map) return;

    try {
      map.setStyle(getBasemapStyle(safeKey));
      map.once('style.load', () => {
        setupLayersOnStyle();
      });
    } catch (err) {
      console.error('Failed to set basemap style:', err);
      setBasemapNotice('Failed to apply basemap. Falling back to OpenStreetMap.');
      setTimeout(() => setBasemapNotice(null), 4000);
      map.setStyle(getBasemapStyle('osm'));
      map.once('style.load', () => {
        setupLayersOnStyle();
      });
    }
  };

  // ── Initialize MapLibre GL instance once ────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapInstance.current) return;

    const initialKey = resolveSafeBasemapId(basemapKeyRef.current);
    const map = new Map({
      container: mapContainerRef.current,
      style: getBasemapStyle(initialKey),
      center: lngLatCenter,
      zoom: zoom,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    mapInstance.current = map;

    // Controls
    map.addControl(
      new NavigationControl({
        visualizePitch: true,
        showCompass: true,
      }),
      'top-right'
    );
    map.addControl(new FullscreenControl(), 'top-right');
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: 'GeoVision AI &bull; MapLibre GL JS',
      }),
      'bottom-right'
    );

    map.on('load', () => {
      setMapLoaded(true);
      setupLayersOnStyle();
      map.resize();
    });

    const resizeTimer1 = setTimeout(() => {
      mapInstance.current?.resize();
    }, 150);
    const resizeTimer2 = setTimeout(() => {
      mapInstance.current?.resize();
    }, 500);

    let ro;
    if (typeof window !== 'undefined' && window.ResizeObserver && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        mapInstance.current?.resize();
      });
      ro.observe(mapContainerRef.current);
    }

    map.on('error', (e) => {
      const status = e?.error?.status;
      if ((status === 401 || status === 403) && basemapKeyRef.current !== 'osm') {
        console.warn(`Tile provider auth error (${status}), falling back to OpenStreetMap`);
        setBasemapNotice(`Basemap provider returned HTTP ${status}. Switched to OpenStreetMap fallback.`);
        setTimeout(() => setBasemapNotice(null), 4500);
        handleBasemapChange('osm');
      } else if (e?.error?.status === 404 || e?.error?.message?.includes('tile')) {
        console.warn('MapLibre raster tile notice:', e.error);
      }
    });

    // Cleanup on unmount
    return () => {
      clearTimeout(resizeTimer1);
      clearTimeout(resizeTimer2);
      if (ro) ro.disconnect();
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // ── Toggle 3D Tilt Mode ──────────────────────────────────────────────
  const toggle3DTilt = () => {
    const map = mapInstance.current;
    if (!map) return;

    if (is3D) {
      map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      setIs3D(false);
    } else {
      map.easeTo({ pitch: 52, bearing: -20, duration: 800 });
      setIs3D(true);
    }
  };

  // ── React to changes in hotspots ─────────────────────────────────────
  useEffect(() => {
    if (mapLoaded) {
      updateHotspotsData();
    }
  }, [filteredHotspots, mapLoaded, updateHotspotsData]);

  // ── React to changes in GEE raster layer ────────────────────────────
  useEffect(() => {
    if (mapLoaded) {
      updateGeeRasterLayer();
    }
  }, [activeGeeLayer, geeTiles, mapLoaded, updateGeeRasterLayer]);

  // ── React to hotspots visibility ─────────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.getStyle()) return;

    const visibility = showHotspots ? 'visible' : 'none';
    if (map.getLayer('hotspots-circles-layer')) {
      map.setLayoutProperty('hotspots-circles-layer', 'visibility', visibility);
    }
    if (map.getLayer('hotspots-glow-layer')) {
      map.setLayoutProperty('hotspots-glow-layer', 'visibility', visibility);
    }
  }, [showHotspots]);

  // ── Manage Interactive Map Pin & Radius Circle Buffer ───────────────
  const onLocationChangeRef = useRef(onLocationChange);
  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded) return;

    if (!pinLocation || pinLocation.lat == null || pinLocation.lng == null) {
      if (pinMarkerRef.current) {
        pinMarkerRef.current.remove();
        pinMarkerRef.current = null;
      }
      if (map.getLayer('pin-radius-outline')) map.removeLayer('pin-radius-outline');
      if (map.getLayer('pin-radius-fill')) map.removeLayer('pin-radius-fill');
      if (map.getSource('pin-radius-source')) map.removeSource('pin-radius-source');
      return;
    }

    const lngLat = [Number(pinLocation.lng), Number(pinLocation.lat)];

    // 1. Interactive Marker
    if (!pinMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'geovision-pin-marker';
      el.style.cssText = 'font-size:26px;cursor:pointer;line-height:1;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.45));user-select:none;';
      el.textContent = '📍';
      const marker = new Marker({ element: el, draggable: Boolean(onLocationChange) })
        .setLngLat(lngLat)
        .addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        if (onLocationChangeRef.current) {
          onLocationChangeRef.current({
            lat: Math.round(pos.lat * 10000) / 10000,
            lng: Math.round(pos.lng * 10000) / 10000,
          });
        }
      });
      pinMarkerRef.current = marker;
    } else {
      pinMarkerRef.current.setLngLat(lngLat);
    }

    // 2. Radius Buffer Circle Layer
    const radKm = Number(pinLocation.radiusKm) || 5.0;
    const circleData = createGeoJsonCircle(lngLat, radKm);
    const src = map.getSource('pin-radius-source');
    if (src) {
      src.setData(circleData);
    } else {
      map.addSource('pin-radius-source', {
        type: 'geojson',
        data: circleData,
      });
      if (!map.getLayer('pin-radius-fill')) {
        map.addLayer({
          id: 'pin-radius-fill',
          type: 'fill',
          source: 'pin-radius-source',
          paint: {
            'fill-color': '#2563eb',
            'fill-opacity': 0.15,
          },
        });
      }
      if (!map.getLayer('pin-radius-outline')) {
        map.addLayer({
          id: 'pin-radius-outline',
          type: 'line',
          source: 'pin-radius-source',
          paint: {
            'line-color': '#2563eb',
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
      }
    }
  }, [pinLocation, onLocationChange, mapLoaded]);

  // Click on map to relocate pin
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded) return;

    const handleMapClick = (e) => {
      if (!onLocationChangeRef.current) return;
      // Skip if clicking a hotspot circle
      const features = map.queryRenderedFeatures(e.point, { layers: ['hotspots-circles-layer'] });
      if (features && features.length > 0) return;

      onLocationChangeRef.current({
        lat: Math.round(e.lngLat.lat * 10000) / 10000,
        lng: Math.round(e.lngLat.lng * 10000) / 10000,
      });
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [mapLoaded]);

  // ── React to raster opacity slider ───────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.getStyle()) return;

    if (map.getLayer('gee-raster-layer')) {
      map.setPaintProperty('gee-raster-layer', 'raster-opacity', opacity);
    }
  }, [opacity]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-surface-900 text-white">
      {/* Interactive Satellite Layer Toolbar */}
      <div className="bg-surface-900 p-3 flex flex-wrap items-center justify-between gap-3 border-b border-surface-700">
        <div className="flex flex-wrap items-center gap-2">
          {title ? (
            <span className="text-xs font-bold text-white tracking-wide pr-2 border-r border-surface-700">
              {title}
            </span>
          ) : (
            <span className="text-xs font-semibold text-emerald-400 pr-2 border-r border-surface-700 flex items-center gap-1">
              <span>🛰️</span> S2 {startYear}→{endYear}
            </span>
          )}

          {/* Environmental & Satellite Layer Switcher Chips */}
          <div className="flex flex-wrap items-center gap-1">
            {GEE_LAYERS_CONFIG.map((layer) => {
              const isActive = activeGeeLayer === layer.key;
              return (
                <button
                  key={layer.key}
                  type="button"
                  onClick={() => setActiveGeeLayer(layer.key)}
                  title={layer.desc}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm ring-1 ring-white/30'
                      : 'bg-surface-800 text-gray-300 hover:bg-surface-700 hover:text-white border border-surface-700'
                  }`}
                >
                  <span>{layer.icon}</span>
                  <span className="hidden sm:inline">{layer.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>

          {activeGeeLayer !== 'none' && (
            <div className="flex items-center gap-2 ml-1 pl-2 border-l border-surface-700">
              <span className="text-[11px] text-gray-400">Opacity:</span>
              <input
                type="range"
                min="0.2"
                max="1.0"
                step="0.05"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                className="w-16 h-1.5 bg-surface-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
              />
              <span className="text-[11px] font-mono text-gray-300">{Math.round(opacity * 100)}%</span>
            </div>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Basemap Switcher */}
          <div className="flex items-center gap-1 bg-surface-800 px-2 py-0.5 rounded-lg border border-surface-700 text-xs">
            <span className="text-[10px] text-gray-400 font-mono">BASE:</span>
            <select
              value={basemapKey}
              onChange={(e) => handleBasemapChange(e.target.value)}
              className="bg-transparent text-gray-200 text-xs focus:outline-none cursor-pointer"
              title="Select basemap layer style"
            >
              {getBasemapOptions().map((opt) => (
                <option
                  key={opt.id}
                  value={opt.id}
                  disabled={!opt.available}
                  className="bg-surface-900 text-white"
                >
                  {opt.label} {!opt.available ? '(Key Required)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 3D Tilt Button */}
          <button
            type="button"
            onClick={toggle3DTilt}
            title="Toggle 3D Pitch and Tilt"
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 border ${
              is3D
                ? 'bg-amber-600/30 text-amber-300 border-amber-500/50 shadow-xs'
                : 'bg-surface-800 text-gray-300 hover:text-white border-surface-700'
            }`}
          >
            <span>📐</span>
            <span>{is3D ? '2D View' : '3D Tilt'}</span>
          </button>

          {/* Hotspot Toggle & Filter */}
          <div className="flex items-center gap-1.5 bg-surface-800 px-2 py-0.5 rounded-lg border border-surface-700 text-xs">
            <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer pr-1 border-r border-surface-700">
              <input
                type="checkbox"
                checked={showHotspots}
                onChange={(e) => setShowHotspots(e.target.checked)}
                className="rounded text-brand-500 focus:ring-brand-500 h-3.5 w-3.5"
              />
              <span>Hotspots ({filteredHotspots.length})</span>
            </label>
            <select
              value={hotspotModuleFilter}
              onChange={(e) => setHotspotModuleFilter(e.target.value)}
              className="bg-transparent text-gray-300 text-xs focus:outline-none cursor-pointer"
              title="Filter hotspots by hazard module"
            >
              <option value="all" className="bg-surface-900 text-white">All Hazards</option>
              <option value="deforestation" className="bg-surface-900 text-white">Deforestation</option>
              <option value="mining" className="bg-surface-900 text-white">Mining</option>
              <option value="flood" className="bg-surface-900 text-white">Flood</option>
            </select>
          </div>

          {/* Provenance and GEE Status Badges */}
          {isDemo && (
            <span className="text-xs text-amber-300 flex items-center gap-1 font-medium bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800/50" title="Hotspots are loaded from the GeoVision pilot reference dataset">
              <span>📌</span> Pilot Hotspots
            </span>
          )}

          {loadingTiles ? (
            <span className="text-xs text-amber-400 animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              Rendering...
            </span>
          ) : tileError ? (
            <span className="text-xs text-amber-400/80 flex items-center gap-1" title={tileError}>
              <span>⚠️</span> Basemap Mode
            </span>
          ) : geeTiles ? (
            <span className="text-xs text-green-400 flex items-center gap-1 font-medium" title="Google Earth Engine Sentinel-2 raster layers active">
              <span className="w-2 h-2 rounded-full bg-green-400"></span>
              <span className="hidden md:inline">GEE Rasters</span>
            </span>
          ) : null}
        </div>
      </div>
      {basemapNotice && (
        <div className="bg-amber-950/90 text-amber-200 text-xs px-3 py-1.5 border-b border-amber-800/60 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span>ℹ️</span> {basemapNotice}
          </span>
          <button
            type="button"
            onClick={() => setBasemapNotice(null)}
            className="text-amber-300 hover:text-white underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Map Container */}
      <div ref={mapContainerRef} style={{ height }} className="w-full relative z-0 bg-slate-100" />

      {/* Overlays */}
      {loading && (
        <div className="absolute inset-0 bg-surface-900/60 backdrop-blur-xs flex items-center justify-center z-10">
          <div className="flex items-center gap-2 bg-surface-800 px-4 py-2 rounded-lg shadow-md border border-surface-700 text-white">
            <span className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></span>
            <span className="text-xs font-medium">Loading satellite data...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 bg-surface-900/90 flex items-center justify-center p-4 z-10">
          <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-4 rounded-xl text-center max-w-sm">
            <p className="text-sm font-semibold">Map Error</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 bg-surface-900/90 backdrop-blur-xs p-3 rounded-lg shadow-lg border border-surface-700 text-xs font-medium text-gray-200 z-10 space-y-1.5 pointer-events-auto">
        <div className="font-bold text-white border-b border-surface-700 pb-1 flex items-center justify-between gap-3">
          <span>Risk Level</span>
          <span className="text-[10px] text-gray-400 font-mono">MapLibre GL</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 shadow-xs shadow-green-500/50"></span>
          <span>Low (0–39)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 shadow-xs shadow-amber-500/50"></span>
          <span>Medium (40–69)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 shadow-xs shadow-red-500/50"></span>
          <span>High (70–100)</span>
        </div>
      </div>
    </div>
  );
}
