import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Map, NavigationControl, FullscreenControl, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { apiPost, getHealthStatus } from '../api/client';
import {
  DEFAULT_BASEMAP_ID,
  getBasemapStyle,
  getBasemapOptions,
  resolveSafeBasemapId,
} from '../config/basemaps';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
} from 'recharts';

// Preset AOIs across India (Preserving Pune Pilot Examples while enabling Nationwide Exploration)
const PRESET_AOIS = [
  {
    name: 'Mulshi Watershed & Forest Foothills (Pune Example)',
    desc: 'Dense Western Ghats canopy & catchment buffer',
    coords: [
      [73.48, 18.48],
      [73.56, 18.48],
      [73.56, 18.55],
      [73.48, 18.55],
      [73.48, 18.48],
    ],
  },
  {
    name: 'Pune West Urban Expansion Corridor (Pune Example)',
    desc: 'Hinjawadi / Baner fringe with rapid built-up surface conversion',
    coords: [
      [73.74, 18.50],
      [73.82, 18.50],
      [73.82, 18.57],
      [73.74, 18.57],
      [73.74, 18.50],
    ],
  },
  {
    name: 'PCMC Industrial & Quarry Belt (Pune Example)',
    desc: 'Bare soil, extraction, and industrial disturbance zones',
    coords: [
      [73.79, 18.63],
      [73.87, 18.63],
      [73.87, 18.70],
      [73.79, 18.70],
      [73.79, 18.63],
    ],
  },
  {
    name: 'Khadakwasla Basin Catchment (Pune Example)',
    desc: 'Key reservoir shoreline and riparian vegetation buffer',
    coords: [
      [73.72, 18.41],
      [73.80, 18.41],
      [73.80, 18.47],
      [73.72, 18.47],
      [73.72, 18.41],
    ],
  },
  {
    name: 'Sinhagad Ecological Sanctuary (Pune Example)',
    desc: 'Steep montane forest corridor with seasonal canopy variation',
    coords: [
      [73.73, 18.34],
      [73.80, 18.34],
      [73.80, 18.40],
      [73.73, 18.40],
      [73.73, 18.34],
    ],
  },
  {
    name: 'Mula-Mutha Riparian Floodplain (Pune Example)',
    desc: 'Riverine confluence subject to seasonal water-extent change',
    coords: [
      [73.88, 18.52],
      [73.96, 18.52],
      [73.96, 18.58],
      [73.88, 18.58],
      [73.88, 18.52],
    ],
  },
  {
    name: 'Jim Corbett Tiger Reserve Buffer (Uttarakhand Example)',
    desc: 'Northern Himalayan foothills dense sal forest canopy & riverine corridor',
    coords: [
      [78.75, 29.50],
      [78.85, 29.50],
      [78.85, 29.58],
      [78.75, 29.58],
      [78.75, 29.50],
    ],
  },
  {
    name: 'Sundarbans Mangrove Buffer (West Bengal Example)',
    desc: 'Dynamic estuarine mangrove canopy delta & tidal water channels',
    coords: [
      [88.80, 21.85],
      [88.92, 21.85],
      [88.92, 21.95],
      [88.80, 21.95],
      [88.80, 21.85],
    ],
  },
  {
    name: 'Singrauli Coal & Surface Quarry Basin (MP Example)',
    desc: 'Major coal extraction and industrial surface disturbance basin',
    coords: [
      [82.60, 24.15],
      [82.72, 24.15],
      [82.72, 24.25],
      [82.60, 24.25],
      [82.60, 24.15],
    ],
  },
  {
    name: 'Anamalai Rainforest Corridor (Tamil Nadu Example)',
    desc: 'Southern Western Ghats moist tropical canopy & plantation interface',
    coords: [
      [76.85, 10.35],
      [76.95, 10.35],
      [76.95, 10.45],
      [76.85, 10.45],
      [76.85, 10.35],
    ],
  },
];

const GEE_LAYERS = [
  { key: 'none', label: 'Street Map', icon: '🗺️' },
  { key: 'true_color', label: 'True Color (RGB)', icon: '🛰️', desc: 'Sentinel-2 B4-B3-B2' },
  { key: 'false_color', label: 'False Color (CIR)', icon: '🌿', desc: 'Sentinel-2 B8-B4-B3 Canopy Vigour' },
  { key: 'ndvi', label: 'NDVI Canopy Health', icon: '🌳', desc: 'Photosynthetic Vegetation Index' },
  { key: 'ndvi_change', label: 'Canopy Loss Delta', icon: '🔴', desc: 'NDVI Decline Heatmap' },
  { key: 'disturbance', label: 'Land Disturbance Delta', icon: '⛏️', desc: 'Bare-Soil / NDBI Shift' },
  { key: 'water_change', label: 'Water Delta', icon: '🌊', desc: 'NDWI Shift / Inundation' },
];

import { createCircularPolygon } from '../utils/geometry';
export { createCircularPolygon };

export default function AOIAnalysis() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedModule = searchParams.get('module');

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  // AOI State
  const [aoiName, setAoiName] = useState('Mulshi Watershed & Forest Foothills (Pune Example)');
  const [geometry, setGeometry] = useState({
    type: 'Polygon',
    coordinates: [PRESET_AOIS[0].coords],
  });
  const [aoiAreaApprox, setAoiAreaApprox] = useState(65.66);
  const [clickRadiusKm, setClickRadiusKm] = useState(5);
  const [radiusCenter, setRadiusCenter] = useState(null); // { lat, lng }
  const radiusCenterRef = useRef(null);
  useEffect(() => {
    radiusCenterRef.current = radiusCenter;
  }, [radiusCenter]);
  const radiusMarkerRef = useRef(null);
  const handleMapClickPointRef = useRef(null);

  // Drawing mode: 'polygon' | 'rectangle' | 'radius' | 'preset' | 'coords'
  const [drawMode, setDrawMode] = useState('polygon');
  const [polygonPoints, setPolygonPoints] = useState([]); // array of [lat, lng]
  const [boxStart, setBoxStart] = useState(null); // [lat, lng] for corner 1
  const [boxPreview, setBoxPreview] = useState(null); // [lat, lng] for corner 2 during move

  // Temporal Parameters
  const [startYear, setStartYear] = useState(2023);
  const [endYear, setEndYear] = useState(2026);
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(4);

  // Geotagged Photo State
  const [photoInfo, setPhotoInfo] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const aoiPhotoInputRef = useRef(null);

  // Analysis Pipeline State
  const [analyzing, setAnalyzing] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  const [mapError, setMapError] = useState(null);

  // Backend GEE Connectivity State: 'unverified' | 'connected' | 'unavailable'
  const [geeStatus, setGeeStatus] = useState('unverified');

  useEffect(() => {
    let isMounted = true;
    getHealthStatus()
      .then((res) => {
        if (!isMounted) return;
        if (res && res.data && typeof res.data.gee_available === 'boolean') {
          setGeeStatus(res.data.gee_available ? 'connected' : 'unavailable');
        } else {
          setGeeStatus('unverified');
        }
      })
      .catch(() => {
        if (isMounted) setGeeStatus('unverified');
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Map Layer Controls
  const getInitialLayer = () => {
    if (preselectedModule === 'deforestation') return 'ndvi_change';
    if (preselectedModule === 'mining') return 'disturbance';
    if (preselectedModule === 'flood') return 'water_change';
    return 'true_color';
  };
  const [activeLayer, setActiveLayer] = useState(getInitialLayer);
  const [layerOpacity, setLayerOpacity] = useState(0.85);

  useEffect(() => {
    if (preselectedModule === 'deforestation') setActiveLayer('ndvi_change');
    else if (preselectedModule === 'mining') setActiveLayer('disturbance');
    else if (preselectedModule === 'flood') setActiveLayer('water_change');
  }, [preselectedModule]);

  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP_ID);
  const basemapKeyRef = useRef(basemapKey);
  useEffect(() => {
    basemapKeyRef.current = basemapKey;
  }, [basemapKey]);

  const geometryRef = useRef(geometry);
  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  const analysisResultRef = useRef(analysisResult);
  useEffect(() => {
    analysisResultRef.current = analysisResult;
  }, [analysisResult]);

  const activeLayerRef = useRef(activeLayer);
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  const layerOpacityRef = useRef(layerOpacity);
  useEffect(() => {
    layerOpacityRef.current = layerOpacity;
  }, [layerOpacity]);

  // Sync ref to allow map event handlers access to latest state
  const stateRef = useRef({ drawMode, polygonPoints, boxStart, clickRadiusKm, radiusCenter });
  useEffect(() => {
    stateRef.current = { drawMode, polygonPoints, boxStart, clickRadiusKm, radiusCenter };
  }, [drawMode, polygonPoints, boxStart, clickRadiusKm, radiusCenter]);

  // Compute surface area in km² from lat/lng array
  const calculateAreaFromLatLngs = (latLngArray) => {
    if (!latLngArray || latLngArray.length < 3) return 0;
    try {
      const meanLat = latLngArray.reduce((acc, p) => acc + p[0], 0) / latLngArray.length;
      const latRad = (meanLat * Math.PI) / 180;
      const kx = 111.32 * Math.cos(latRad);
      const ky = 110.57;
      let areaSum = 0;
      const n = latLngArray.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x1 = latLngArray[i][1] * kx;
        const y1 = latLngArray[i][0] * ky;
        const x2 = latLngArray[j][1] * kx;
        const y2 = latLngArray[j][0] * ky;
        areaSum += x1 * y2 - x2 * y1;
      }
      return Math.abs(Math.round((areaSum / 2.0) * 100) / 100);
    } catch {
      return 15.0;
    }
  };

  // ── Render finalized AOI polygon on map ──────────────────────────
  const renderAoiOnMap = useCallback((geom) => {
    const map = mapInstance.current;
    if (!map) return;

    try {
      const source = map.getSource('aoi-source');
      if (source) {
        if (!geom) {
          source.setData({ type: 'FeatureCollection', features: [] });
        } else if (geom.type === 'FeatureCollection' || geom.type === 'Feature') {
          source.setData(geom);
        } else {
          source.setData({
            type: 'Feature',
            geometry: geom,
            properties: {},
          });
        }
      }

      if (geom && geom.coordinates && geom.coordinates[0]?.length) {
        const coords = geom.coordinates[0];
        let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
        coords.forEach(([lng, lat]) => {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        });
        if (minLng < maxLng && minLat < maxLat) {
          map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: 45, maxZoom: 14, duration: 600 }
          );
        }

        const latLngs = coords.map(([lng, lat]) => [lat, lng]);
        const area = calculateAreaFromLatLngs(latLngs);
        setAoiAreaApprox(area);
      }
    } catch (e) {
      console.warn('MapLibre: Failed to render AOI boundary:', e);
    }
  }, []);

  // ── Setup / Restore Map Layers on Style Load ─────────────────────
  const setupAoiLayers = useCallback((map) => {
    if (!map) return;

    // Source & layers for finalized AOI
    if (!map.getSource('aoi-source')) {
      map.addSource('aoi-source', {
        type: 'geojson',
        data: geometryRef.current ? { type: 'Feature', geometry: geometryRef.current, properties: {} } : { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer('aoi-fill')) {
      map.addLayer({
        id: 'aoi-fill',
        type: 'fill',
        source: 'aoi-source',
        paint: {
          'fill-color': '#2563eb',
          'fill-opacity': 0.25,
        },
      });
    }

    if (!map.getLayer('aoi-line')) {
      map.addLayer({
        id: 'aoi-line',
        type: 'line',
        source: 'aoi-source',
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 2.5,
          'line-opacity': 0.95,
        },
      });
    }

    // Source & layers for in-progress drawing preview
    if (!map.getSource('draw-preview-source')) {
      map.addSource('draw-preview-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    if (!map.getLayer('draw-preview-fill')) {
      map.addLayer({
        id: 'draw-preview-fill',
        type: 'fill',
        source: 'draw-preview-source',
        paint: {
          'fill-color': '#fbbf24',
          'fill-opacity': 0.2,
        },
      });
    }

    if (!map.getLayer('draw-preview-line')) {
      map.addLayer({
        id: 'draw-preview-line',
        type: 'line',
        source: 'draw-preview-source',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
          'line-dasharray': [3, 3],
        },
      });
    }

    if (geometryRef.current) {
      renderAoiOnMap(geometryRef.current);
    }

    // Re-apply GEE raster layer if active
    const res = analysisResultRef.current;
    const lyr = activeLayerRef.current;
    if (res?.tile_layers && res.tile_layers[lyr] && lyr !== 'none') {
      const sourceId = 'aoi-gee-source';
      const layerId = 'aoi-gee-layer';
      try {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'raster',
            tiles: [res.tile_layers[lyr]],
            tileSize: 256,
            attribution: 'Google Earth Engine &copy; Copernicus Sentinel-2',
          });
        }
        if (!map.getLayer(layerId)) {
          const beforeId = map.getLayer('aoi-line') ? 'aoi-line' : undefined;
          map.addLayer(
            {
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: {
                'raster-opacity': layerOpacityRef.current,
                'raster-fade-duration': 0,
              },
            },
            beforeId
          );
        }
      } catch (err) {
        console.warn('MapLibre: Failed re-adding AOI raster layer on style reload:', err);
      }
    }
  }, [renderAoiOnMap]);

  // Basemap switcher handler
  const handleBasemapChange = (newKey) => {
    const safeKey = resolveSafeBasemapId(newKey);
    setBasemapKey(safeKey);
    basemapKeyRef.current = safeKey;
    const map = mapInstance.current;
    if (!map) return;

    try {
      map.setStyle(getBasemapStyle(safeKey));
      map.once('style.load', () => {
        setupAoiLayers(map);
      });
    } catch (err) {
      console.error('Failed to change basemap style:', err);
      map.setStyle(getBasemapStyle('osm'));
      map.once('style.load', () => {
        setupAoiLayers(map);
      });
    }
  };

  // ── Initialize MapLibre GL Map ────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    let resizeTimer1 = null;
    let resizeTimer2 = null;
    let ro = null;

    try {
      const initialKey = resolveSafeBasemapId(basemapKeyRef.current);
      const map = new Map({
        container: mapRef.current,
        style: getBasemapStyle(initialKey),
        center: [73.8567, 18.5204],
        zoom: 11,
        attributionControl: false,
      });
      mapInstance.current = map;

      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new FullscreenControl(), 'top-right');

      map.on('load', () => {
        setupAoiLayers(map);
        map.resize();
      });

      resizeTimer1 = setTimeout(() => {
        mapInstance.current?.resize();
      }, 150);
      resizeTimer2 = setTimeout(() => {
        mapInstance.current?.resize();
      }, 500);

      if (typeof window !== 'undefined' && window.ResizeObserver && mapRef.current) {
        ro = new ResizeObserver(() => {
          mapInstance.current?.resize();
        });
        ro.observe(mapRef.current);
      }

      // Map click handler
      map.on('click', (e) => {
        const { lng, lat } = e.lngLat;
        const curMode = stateRef.current.drawMode;

        if (curMode === 'polygon') {
          setPolygonPoints((prev) => [...prev, [lat, lng]]);
        } else if (curMode === 'rectangle') {
          const currentBoxStart = stateRef.current.boxStart;
          if (!currentBoxStart) {
            setBoxStart([lat, lng]);
            setBoxPreview(null);
          } else {
            const lat1 = currentBoxStart[0];
            const lng1 = currentBoxStart[1];
            const lat2 = lat;
            const lng2 = lng;

            const minLat = Math.min(lat1, lat2);
            const maxLat = Math.max(lat1, lat2);
            const minLng = Math.min(lng1, lng2);
            const maxLng = Math.max(lng1, lng2);

            const boxCoords = [
              [Number(minLng.toFixed(5)), Number(minLat.toFixed(5))],
              [Number(maxLng.toFixed(5)), Number(minLat.toFixed(5))],
              [Number(maxLng.toFixed(5)), Number(maxLat.toFixed(5))],
              [Number(minLng.toFixed(5)), Number(maxLat.toFixed(5))],
              [Number(minLng.toFixed(5)), Number(minLat.toFixed(5))],
            ];

            const newGeom = {
              type: 'Polygon',
              coordinates: [boxCoords],
            };

            setGeometry(newGeom);
            setAoiName(`Custom Bounding Box (${minLat.toFixed(2)}°-${maxLat.toFixed(2)}°N, ${minLng.toFixed(2)}°-${maxLng.toFixed(2)}°E)`);
            setBoxStart(null);
            setBoxPreview(null);
            renderAoiOnMap(newGeom);
          }
        } else if (curMode === 'radius') {
          if (handleMapClickPointRef.current) {
            handleMapClickPointRef.current(lat, lng, stateRef.current.clickRadiusKm);
          }
        }
      });

      // Mousemove handler for box preview
      map.on('mousemove', (e) => {
        const curMode = stateRef.current.drawMode;
        const currentBoxStart = stateRef.current.boxStart;
        if (curMode === 'rectangle' && currentBoxStart) {
          setBoxPreview([e.lngLat.lat, e.lngLat.lng]);
        }
      });

      map.on('error', (e) => {
        const status = e?.error?.status;
        if ((status === 401 || status === 403) && basemapKeyRef.current !== 'osm') {
          console.warn(`Tile provider auth error (${status}), falling back to OpenStreetMap`);
          setMapError(`Selected basemap returned HTTP ${status}. Switched to OpenStreetMap fallback.`);
          handleBasemapChange('osm');
        } else if (e?.error?.status === 404 || e?.error?.message?.includes('tile')) {
          console.warn('MapLibre tile notice:', e.error);
        } else if (e?.error) {
          console.warn('MapLibre notice:', e.error);
        }
      });
    } catch (err) {
      console.error('Error initializing MapLibre map:', err);
      setMapError(err?.message || 'Failed to initialize WebGL map canvas');
    }

    return () => {
      if (resizeTimer1) clearTimeout(resizeTimer1);
      if (resizeTimer2) clearTimeout(resizeTimer2);
      if (ro) ro.disconnect();
      if (radiusMarkerRef.current) {
        radiusMarkerRef.current.remove();
        radiusMarkerRef.current = null;
      }
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Complete and seal the current polygon
  const completePolygon = useCallback(() => {
    if (polygonPoints.length < 3) return;

    // Convert [lat, lng] list to GeoJSON coordinates [lng, lat] and close ring
    const closedCoords = polygonPoints.map(([lat, lng]) => [
      Number(lng.toFixed(5)),
      Number(lat.toFixed(5)),
    ]);
    // Ensure last point equals first point
    closedCoords.push([
      Number(polygonPoints[0][1].toFixed(5)),
      Number(polygonPoints[0][0].toFixed(5)),
    ]);

    const newGeom = {
      type: 'Polygon',
      coordinates: [closedCoords],
    };

    const area = calculateAreaFromLatLngs(polygonPoints);
    setGeometry(newGeom);
    setAoiAreaApprox(area);
    setAoiName(`Custom Drawn Polygon (${polygonPoints.length} vertices, ~${area} km²)`);
    setPolygonPoints([]);
    renderAoiOnMap(newGeom);
  }, [polygonPoints, renderAoiOnMap]);

  // Update in-progress drawing preview layer
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.getStyle()) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const previewSource = map.getSource('draw-preview-source');
    if (!previewSource) return;

    const previewFeatures = [];

    // 1. Polygon Drawing In-Progress
    if (drawMode === 'polygon' && polygonPoints.length > 0) {
      if (polygonPoints.length > 1) {
        previewFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: polygonPoints.map(([lat, lng]) => [lng, lat]),
          },
        });
      }

      if (polygonPoints.length >= 3) {
        const ring = polygonPoints.map(([lat, lng]) => [lng, lat]);
        ring.push([polygonPoints[0][1], polygonPoints[0][0]]);
        previewFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [ring],
          },
        });
      }

      // Add vertex marker pins
      polygonPoints.forEach(([lat, lng], idx) => {
        const isFirst = idx === 0;
        const el = document.createElement('div');
        el.className = 'custom-vertex-pin';
        el.style.width = '24px';
        el.style.height = '24px';
        el.style.borderRadius = '50%';
        el.style.background = isFirst && polygonPoints.length >= 3 ? '#10b981' : isFirst ? '#059669' : '#2563eb';
        el.style.color = '#ffffff';
        el.style.fontSize = '11px';
        el.style.fontWeight = '700';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.border = '2px solid #ffffff';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
        el.style.cursor = 'pointer';
        el.style.transition = 'transform 0.15s';
        el.title = isFirst && polygonPoints.length >= 3 ? 'Click to complete polygon' : `Vertex ${idx + 1}`;
        el.innerText = isFirst && polygonPoints.length >= 3 ? '✔' : `${idx + 1}`;

        if (isFirst && polygonPoints.length >= 3) {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            completePolygon();
          });
        }

        const marker = new Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    }

    // 2. Rectangle Drawing Preview In-Progress
    if (drawMode === 'rectangle' && boxStart) {
      const el = document.createElement('div');
      el.style.width = '22px';
      el.style.height = '22px';
      el.style.borderRadius = '4px';
      el.style.background = '#f59e0b';
      el.style.color = '#ffffff';
      el.style.fontSize = '10px';
      el.style.fontWeight = '800';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.border = '2px solid #ffffff';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
      el.innerText = '1';

      const marker = new Marker({ element: el })
        .setLngLat([boxStart[1], boxStart[0]])
        .addTo(map);
      markersRef.current.push(marker);

      if (boxPreview) {
        const minLat = Math.min(boxStart[0], boxPreview[0]);
        const maxLat = Math.max(boxStart[0], boxPreview[0]);
        const minLng = Math.min(boxStart[1], boxPreview[1]);
        const maxLng = Math.max(boxStart[1], boxPreview[1]);

        previewFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [minLng, minLat],
                [maxLng, minLat],
                [maxLng, maxLat],
                [minLng, maxLat],
                [minLng, minLat],
              ],
            ],
          },
        });
      }
    }

    previewSource.setData({
      type: 'FeatureCollection',
      features: previewFeatures,
    });
  }, [drawMode, polygonPoints, boxStart, boxPreview, completePolygon]);

  // Undo the last placed polygon vertex
  const undoLastVertex = () => {
    setPolygonPoints((prev) => prev.slice(0, -1));
  };

  // Center pin marker for Radius AOI
  const updateRadiusCenterMarker = useCallback((lat, lng, radiusKm) => {
    const map = mapInstance.current;
    if (!map) return;

    if (radiusMarkerRef.current) {
      radiusMarkerRef.current.remove();
      radiusMarkerRef.current = null;
    }

    const el = document.createElement('div');
    el.className = 'radius-center-pin';
    el.style.width = '26px';
    el.style.height = '26px';
    el.style.borderRadius = '50%';
    el.style.background = '#2563eb';
    el.style.color = '#ffffff';
    el.style.fontSize = '12px';
    el.style.fontWeight = '700';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.border = '2px solid #ffffff';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
    el.style.cursor = 'crosshair';
    el.style.pointerEvents = 'none';
    el.title = `Center: ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E (${radiusKm} km radius)`;
    el.innerText = '📍';

    const marker = new Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(map);

    radiusMarkerRef.current = marker;
  }, []);

  // Clear current drawing
  const clearCurrentDrawing = useCallback(() => {
    setPolygonPoints([]);
    setBoxStart(null);
    setBoxPreview(null);
    setRadiusCenter(null);
    radiusCenterRef.current = null;
    if (radiusMarkerRef.current) {
      radiusMarkerRef.current.remove();
      radiusMarkerRef.current = null;
    }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    const map = mapInstance.current;
    if (map && map.getStyle()) {
      const src = map.getSource('draw-preview-source');
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    }
  }, []);

  // Handle Point & Radius Selection
  const handleMapClickPoint = useCallback((lat, lng, radiusKm) => {
    const radKm = Number(radiusKm) || 2;
    setRadiusCenter({ lat, lng });
    radiusCenterRef.current = { lat, lng };

    const newGeom = createCircularPolygon(lat, lng, radKm);
    const approxArea = Math.round(Math.PI * radKm * radKm * 100) / 100;

    setGeometry(newGeom);
    setAoiAreaApprox(approxArea);
    setAoiName(`Radial Buffer (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E, r=${radKm}km)`);

    renderAoiOnMap(newGeom);
    updateRadiusCenterMarker(lat, lng, radKm);
  }, [renderAoiOnMap, updateRadiusCenterMarker]);

  useEffect(() => {
    handleMapClickPointRef.current = handleMapClickPoint;
  }, [handleMapClickPoint]);

  // Handle Radius Change (re-evaluates current center without duplicate layers or stale geometry)
  const handleRadiusChange = useCallback((newRadiusKm) => {
    const r = Number(newRadiusKm) || 2;
    setClickRadiusKm(r);
    const center = radiusCenterRef.current;
    if (center && center.lat != null && center.lng != null) {
      handleMapClickPoint(center.lat, center.lng, r);
    }
  }, [handleMapClickPoint]);

  // Select Preset Hotspot
  const selectPreset = (preset) => {
    const newGeom = {
      type: 'Polygon',
      coordinates: [preset.coords],
    };
    setGeometry(newGeom);
    setAoiName(preset.name);
    clearCurrentDrawing();
    renderAoiOnMap(newGeom);
  };

  // Upload Geotagged Photo and Extract GPS for AOI
  const handleAoiPhotoUpload = async (file) => {
    if (!file) return;
    setPhotoUploading(true);
    setPhotoError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('buffer_meters', (clickRadiusKm * 1000).toString());

    try {
      const res = await fetch('/api/analysis/geotagged-photo', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to inspect photo');

      if (!data.has_gps) {
        setPhotoError('No GPS EXIF metadata found in this photo. Please click the map or use manual coordinates.');
        setPhotoInfo({ filename: file.name, hasGps: false });
        return;
      }

      const { latitude, longitude } = data.coordinates;
      setPhotoInfo({
        filename: file.name,
        hasGps: true,
        lat: latitude,
        lng: longitude,
        altitude: data.coordinates.altitude_m,
        camera: data.photo_metadata?.camera_model || data.photo_metadata?.camera_make,
        date: data.photo_metadata?.capture_date,
        thumbnail: data.photo_metadata?.thumbnail_base64,
        geeData: data,
      });

      handleMapClickPoint(latitude, longitude, clickRadiusKm);
      setAoiName(`Field Photo AOI: ${file.name} (${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°)`);
    } catch (err) {
      setPhotoError(err.message || 'Error processing photo');
    } finally {
      setPhotoUploading(false);
    }
  };

  // Manage GEE Raster Tile Overlay
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.getStyle()) return;

    const sourceId = 'aoi-gee-source';
    const layerId = 'aoi-gee-layer';

    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    if (
      activeLayer === 'none' ||
      !analysisResult ||
      !analysisResult.tile_layers ||
      !analysisResult.tile_layers[activeLayer]
    ) {
      return;
    }

    const tileUrl = analysisResult.tile_layers[activeLayer];
    try {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: 'Google Earth Engine &copy; Copernicus Sentinel-2',
      });

      // Place underneath the AOI polygon boundary line so the outline stays crisp
      const beforeId = map.getLayer('aoi-line') ? 'aoi-line' : undefined;
      map.addLayer(
        {
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': layerOpacity,
            'raster-fade-duration': 200,
          },
        },
        beforeId
      );
    } catch (e) {
      console.warn('MapLibre: Failed adding AOI raster layer:', e);
    }
  }, [activeLayer, layerOpacity, analysisResult]);

  // Execute End-to-End Analysis Pipeline
  const runAOIAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    setPipelineStep(1);

    const t1 = setTimeout(() => setPipelineStep(2), 1100);
    const t2 = setTimeout(() => setPipelineStep(3), 2400);

    try {
      const payload = {
        geometry,
        start_year: startYear,
        end_year: endYear,
        start_month: startMonth,
        end_month: endMonth,
        region_name: aoiName,
      };

      const { data, error: apiErr } = await apiPost('/analysis/aoi', payload);
      clearTimeout(t1);
      clearTimeout(t2);

      if (apiErr) {
        setError(apiErr);
        setAnalyzing(false);
        return;
      }

      setPipelineStep(4);
      setTimeout(() => {
        setAnalysisResult(data);
        setAnalyzing(false);
        if (data.tile_layers && data.tile_layers.true_color) {
          setActiveLayer('true_color');
        }
      }, 500);
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setError(err.message || 'An unexpected error occurred during AOI analysis.');
      setAnalyzing(false);
    }
  };

  // Navigate to formal audit report with this custom AOI data
  const handleGenerateAoiReport = () => {
    if (!analysisResult) return;
    const aoiReportData = {
      region_name: aoiName,
      geometry,
      area_km2: aoiAreaApprox,
      start_year: startYear,
      end_year: endYear,
      start_month: startMonth,
      end_month: endMonth,
      source: analysisResult.source,
      is_live: analysisResult.is_live,
      is_demo: analysisResult.is_demo,
      summary: {
        total_area_km2: aoiAreaApprox,
        vegetation_loss_km2: analysisResult.summary?.vegetation_loss_km2 || 0,
        disturbance_km2: analysisResult.summary?.disturbance_km2 || 0,
        water_expansion_km2: analysisResult.summary?.water_expansion_km2 || 0,
        net_ndvi_change: analysisResult.summary?.net_ndvi_change || 0,
        net_ndbi_change: analysisResult.summary?.net_ndbi_change || 0,
        net_ndwi_change: analysisResult.summary?.net_ndwi_change || 0,
        dominant_risk: analysisResult.summary?.dominant_risk || 'Environmental Shift',
        risk_score: analysisResult.ml_result?.risk_score || 0,
        risk_level: analysisResult.ml_result?.risk_level || 'Low',
      },
      ml_result: analysisResult.ml_result,
      yearly_progression: analysisResult.yearly_progression,
      features_extracted: analysisResult.features_extracted,
      environmental_metrics: analysisResult.environmental_metrics || [],
      tile_layers: analysisResult.tile_layers || {},
    };

    try {
      sessionStorage.setItem('geovision_custom_aoi_report', JSON.stringify(aoiReportData));
    } catch (e) {
      console.warn('Failed saving AOI report to sessionStorage:', e);
    }

    navigate('/reports', { state: { aoiReportData } });
  };

  // Color helper for risk
  const getRiskColor = (lvl) => {
    if (lvl === 'High') return 'text-red-600 bg-red-50 border-red-200';
    if (lvl === 'Medium') return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getRiskBadgeColor = (score) => {
    if (score >= 70) return '#ef4444';
    if (score >= 40) return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div className="p-6 max-w-[1550px] mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 bg-brand-50 text-brand-600 rounded-xl text-xl">🎯</span>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 tracking-tight">
                Interactive Area of Interest (AOI) Intelligence
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Draw custom polygons or bounding boxes on the map ➔ Extract live Copernicus Sentinel-2 MSI data via Google Earth Engine ➔ Run Random Forest ML risk inference.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {geeStatus === 'connected' ? (
            <div
              id="gee-status-badge"
              className="px-3.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2"
              title="Backend Google Earth Engine service is authenticated and connected"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Earth Engine Connected
            </div>
          ) : geeStatus === 'unavailable' ? (
            <div
              id="gee-status-badge"
              className="px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-2"
              title="Backend Google Earth Engine is offline/unauthenticated. Analysis runs in demo calibration mode."
            >
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Demo Mode — Live GEE Unavailable
            </div>
          ) : (
            <div
              id="gee-status-badge"
              className="px-3.5 py-1.5 rounded-lg bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-600 flex items-center gap-2"
              title="Checking Google Earth Engine connection status..."
            >
              <span className="w-2 h-2 rounded-full bg-gray-400"></span>
              GEE Status Unverified
            </div>
          )}
          <div className="px-3.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
            🌲 Random Forest Model (15 Features)
          </div>
        </div>
      </div>

      {/* Preselected Module Focus Banner */}
      {preselectedModule && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-indigo-950 shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-indigo-100 rounded-lg text-base">🎯</span>
            <div>
              <div className="font-bold flex items-center gap-2">
                <span>Interactive Studio Focus: {preselectedModule.toUpperCase()}</span>
                <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  Preconfigured
                </span>
              </div>
              <p className="text-indigo-800 text-xs mt-0.5">
                Target layer preselected. Draw an arbitrary polygon or select a national preset anywhere across India to run live satellite extraction and multi-sensor inference.
              </p>
            </div>
          </div>
          <Link
            to={`/${preselectedModule}`}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-indigo-300 hover:bg-indigo-100/50 text-indigo-700 font-semibold transition-all"
          >
            ← Back to {preselectedModule.charAt(0).toUpperCase() + preselectedModule.slice(1)} Module
          </Link>
        </div>
      )}

      {/* Main Grid: Left Column (Map & Controls) / Right Column (Deep Intelligence Results) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: AOI Drawing Toolset & Leaflet Map (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
            {/* Step 1 Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span>📍</span> Step 1: Draw or Choose Area of Interest
              </h2>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-md font-semibold border ${
                  aoiAreaApprox > 2500 || aoiAreaApprox < 0.05
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  Area: <strong>{aoiAreaApprox} km²</strong>
                </span>
                <span className="text-[11px] text-gray-400 font-mono">
                  {geometry?.coordinates?.[0]?.length ? `${geometry.coordinates[0].length - 1} vertices` : '0 vertices'}
                </span>
              </div>
            </div>

            {/* Drawing Mode Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                onClick={() => {
                  setDrawMode('polygon');
                  clearCurrentDrawing();
                }}
                className={`py-2 px-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  drawMode === 'polygon'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-50 text-gray-700 hover:bg-surface-100 border border-gray-200'
                }`}
              >
                <span>✏️</span> Draw Poly
              </button>

              <button
                onClick={() => {
                  setDrawMode('rectangle');
                  clearCurrentDrawing();
                }}
                className={`py-2 px-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  drawMode === 'rectangle'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-50 text-gray-700 hover:bg-surface-100 border border-gray-200'
                }`}
              >
                <span>📐</span> Draw Box
              </button>

              <button
                id="draw-mode-radius-btn"
                onClick={() => {
                  setDrawMode('radius');
                  clearCurrentDrawing();
                  if (radiusCenterRef.current) {
                    handleMapClickPoint(radiusCenterRef.current.lat, radiusCenterRef.current.lng, clickRadiusKm);
                  } else {
                    renderAoiOnMap(null);
                  }
                }}
                className={`py-2 px-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  drawMode === 'radius'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-50 text-gray-700 hover:bg-surface-100 border border-gray-200'
                }`}
              >
                <span>⭕</span> Radius
              </button>

              <button
                onClick={() => {
                  setDrawMode('preset');
                  clearCurrentDrawing();
                }}
                className={`py-2 px-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  drawMode === 'preset'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-surface-50 text-gray-700 hover:bg-surface-100 border border-gray-200'
                }`}
              >
                <span>⭐</span> Presets
              </button>

              <button
                onClick={() => {
                  setDrawMode('photo');
                  clearCurrentDrawing();
                }}
                className={`py-2 px-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 col-span-2 sm:col-span-1 ${
                  drawMode === 'photo'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                }`}
              >
                <span>📸</span> Photo Geotag
              </button>
            </div>

            {/* Drawing Mode Instruction Banner */}
            {drawMode === 'polygon' && (
              <div className="p-3 bg-brand-50/70 rounded-xl border border-brand-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-brand-900 font-medium">
                  <span className="w-2 h-2 rounded-full bg-brand-600 animate-pulse"></span>
                  <span>
                    Click anywhere on the map to place vertices (<strong>{polygonPoints.length} placed</strong>, min 3). Click <strong>✔ Complete</strong> or vertex #1 when done.
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={polygonPoints.length < 3}
                    onClick={completePolygon}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all shadow-sm ${
                      polygonPoints.length >= 3
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    ✔ Complete Polygon ({polygonPoints.length})
                  </button>
                  <button
                    disabled={polygonPoints.length === 0}
                    onClick={undoLastVertex}
                    className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-all"
                    title="Undo last point"
                  >
                    ↩ Undo
                  </button>
                  <button
                    onClick={clearCurrentDrawing}
                    className="px-2.5 py-1.5 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-lg font-medium transition-all"
                    title="Clear current points"
                  >
                    🗑 Clear
                  </button>
                </div>
              </div>
            )}

            {drawMode === 'rectangle' && (
              <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span>
                    {boxStart
                      ? 'Corner 1 set! Now move cursor and click corner 2 to form the bounding rectangle.'
                      : 'Click corner 1 anywhere on the map, then click the opposite corner to draw a box.'}
                  </span>
                </div>
                {boxStart && (
                  <button
                    onClick={() => {
                      setBoxStart(null);
                      setBoxPreview(null);
                    }}
                    className="px-2.5 py-1 bg-white border border-amber-300 text-amber-800 rounded-lg font-bold"
                  >
                    Cancel Box
                  </button>
                )}
              </div>
            )}

            {drawMode === 'radius' && (
              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                  <span className="text-emerald-900 font-medium">
                    {radiusCenter
                      ? `📍 Circular AOI: ${clickRadiusKm} km radius centered at ${radiusCenter.lat.toFixed(4)}°N, ${radiusCenter.lng.toFixed(4)}°E. Click map to reposition.`
                      : `👉 Click anywhere on the map to place a ${clickRadiusKm} km circular AOI buffer.`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 font-medium">Radius:</span>
                  {[2, 5, 10, 15, 20].map((r) => (
                    <button
                      key={r}
                      id={`radius-option-${r}km`}
                      onClick={() => handleRadiusChange(r)}
                      className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                        clickRadiusKm === r
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      {r} km
                    </button>
                  ))}
                  {radiusCenter && (
                    <button
                      onClick={() => {
                        clearCurrentDrawing();
                        renderAoiOnMap(null);
                      }}
                      className="px-2 py-1 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-md font-medium text-[11px] transition-all ml-1"
                      title="Clear circular AOI"
                    >
                      🗑 Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {drawMode === 'preset' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESET_AOIS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => selectPreset(preset)}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      aoiName === preset.name
                        ? 'border-brand-500 bg-brand-50/80 shadow-sm ring-1 ring-brand-500'
                        : 'border-gray-200 bg-white hover:bg-surface-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-gray-900">{preset.name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">{preset.desc}</p>
                  </button>
                ))}
              </div>
            )}

            {drawMode === 'photo' && (
              <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📸</span>
                    <span className="font-bold text-indigo-950">Field Photo GPS Extraction</span>
                  </div>
                  <Link
                    to="/field-photo"
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1"
                  >
                    Open Full Photo Deep-Dive &rarr;
                  </Link>
                </div>
                <p className="text-[11px] text-indigo-900/80">
                  Upload a field photo or drone snapshot. GeoVision AI extracts its EXIF GPS coordinates, locks the satellite over the site, and sets a circular AOI buffer for Sentinel-2 analysis.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input
                    ref={aoiPhotoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleAoiPhotoUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <button
                    disabled={photoUploading}
                    onClick={() => aoiPhotoInputRef.current?.click()}
                    className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    {photoUploading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Extracting GPS & Earth Engine...
                      </>
                    ) : (
                      <>
                        <span>📤</span> Select Geotagged Photo
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1.5 text-indigo-900 text-xs">
                    <span className="font-semibold">Buffer:</span>
                    {[1, 2, 5].map((r) => (
                      <button
                        key={r}
                        onClick={() => {
                          setClickRadiusKm(r);
                          if (photoInfo && photoInfo.hasGps) {
                            handleMapClickPoint(photoInfo.lat, photoInfo.lng, r);
                          }
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          clickRadiusKm === r
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>

                {photoError && (
                  <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-[11px]">
                    ⚠️ {photoError}
                  </div>
                )}

                {photoInfo && photoInfo.hasGps && (
                  <div className="p-3 bg-white rounded-xl border border-indigo-100 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {photoInfo.thumbnail && (
                        <img
                          src={photoInfo.thumbnail}
                          alt="Field preview"
                          className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                        />
                      )}
                      <div>
                        <div className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                          <span>✔</span> GPS Locked: {photoInfo.lat.toFixed(5)}°, {photoInfo.lng.toFixed(5)}°
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          {photoInfo.camera || 'Field Camera'} • {photoInfo.date || 'Recent Survey'}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded-md">
                      AOI Ready
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Interactive Leaflet Map Container */}
            <div className="relative">
              {/* Raster Layer Switcher Bar (Appears when GEE results available) */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-surface-50 rounded-xl border border-gray-200 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <span>🛰️</span> Earth Engine Rasters:
                  </span>
                  {!analysisResult && (
                    <span className="text-[11px] text-gray-400 italic">
                      (Run analysis to generate Sentinel-2 overlays)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Basemap Switcher */}
                  <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-gray-200 text-xs shadow-xs">
                    <span className="text-[10px] text-gray-500 font-mono font-semibold">BASE:</span>
                    <select
                      value={basemapKey}
                      onChange={(e) => handleBasemapChange(e.target.value)}
                      className="bg-transparent text-gray-800 text-xs focus:outline-none cursor-pointer font-medium"
                      title="Select Basemap Style"
                    >
                      {getBasemapOptions().map((opt) => (
                        <option key={opt.id} value={opt.id} disabled={!opt.available}>
                          {opt.label} {!opt.available ? '(Key Required)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {analysisResult?.tile_layers && (
                    <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
                      <span className="text-[11px] text-gray-500 font-medium">Opacity:</span>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={layerOpacity}
                        onChange={(e) => setLayerOpacity(parseFloat(e.target.value))}
                        className="w-20 accent-brand-600 h-1.5 cursor-pointer"
                      />
                      <span className="text-gray-700 font-mono text-[11px]">
                        {Math.round(layerOpacity * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {analysisResult?.tile_layers && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-white rounded-xl border border-gray-200 mb-2 shadow-xs">
                  {GEE_LAYERS.map((lyr) => (
                    <button
                      key={lyr.key}
                      onClick={() => setActiveLayer(lyr.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                        activeLayer === lyr.key
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <span>{lyr.icon}</span>
                      <span>{lyr.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Map Canvas */}
              {mapError && (
                <div className="p-3 mb-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚠️</span>
                    <span>
                      <strong>Map display notice:</strong> {mapError}. Drawing presets and coordinate tools remain fully functional.
                    </span>
                  </div>
                  <button
                    onClick={() => setMapError(null)}
                    className="text-amber-800 underline hover:text-amber-950 font-semibold text-xs"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              <div
                ref={mapRef}
                style={{ width: '100%', height: '520px', minHeight: '520px', position: 'relative' }}
                className="w-full rounded-xl overflow-hidden border border-gray-300 shadow-inner z-0 bg-slate-100"
              />
            </div>

            {/* Selected AOI Coordinate Information Summary */}
            <div className="p-3 bg-surface-50 rounded-xl border border-gray-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <span className="font-bold text-gray-800">Target AOI: {aoiName}</span>
                <p className="text-[11px] text-gray-500 font-mono">
                  Coordinates: {geometry?.coordinates?.[0]?.length || 0} nodes | First Node: [{geometry?.coordinates?.[0]?.[0]?.[0] ?? 0}, {geometry?.coordinates?.[0]?.[0]?.[1] ?? 0}]
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(geometry, null, 2));
                  alert('GeoJSON coordinates copied to clipboard!');
                }}
                className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg text-gray-600 font-medium transition-all text-[11px] self-start sm:self-auto shrink-0"
              >
                📋 Copy GeoJSON
              </button>
            </div>

            {/* Temporal Window & Launch Pipeline Trigger */}
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Baseline Year</label>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="w-full text-xs font-medium bg-surface-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:border-brand-500"
                  >
                    <option value={2023}>2023</option>
                    <option value={2024}>2024</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Target Year</label>
                  <select
                    value={endYear}
                    onChange={(e) => setEndYear(Number(e.target.value))}
                    className="w-full text-xs font-medium bg-surface-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:border-brand-500"
                  >
                    <option value={2026}>2026 (Latest)</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">Start Month</label>
                  <select
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    className="w-full text-xs font-medium bg-surface-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:border-brand-500"
                  >
                    <option value={1}>January (Dry)</option>
                    <option value={6}>June (Monsoon)</option>
                    <option value={10}>October (Post-Monsoon)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-500 block mb-1">End Month</label>
                  <select
                    value={endMonth}
                    onChange={(e) => setEndMonth(Number(e.target.value))}
                    className="w-full text-xs font-medium bg-surface-50 border border-gray-200 rounded-lg p-2 text-gray-800 focus:outline-none focus:border-brand-500"
                  >
                    <option value={4}>April (Pre-Monsoon)</option>
                    <option value={9}>September (End Monsoon)</option>
                    <option value={12}>December (Winter)</option>
                  </select>
                </div>
              </div>

              {/* Big Action Button */}
              <button
                disabled={analyzing}
                onClick={runAOIAnalysis}
                className={`w-full py-3.5 px-4 rounded-xl text-sm font-bold text-white transition-all flex items-center justify-center gap-2 shadow-sm ${
                  analyzing
                    ? 'bg-brand-400 cursor-wait'
                    : 'bg-gradient-to-r from-brand-600 to-emerald-600 hover:from-brand-700 hover:to-emerald-700 hover:shadow-md'
                }`}
              >
                {analyzing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Extracting Sentinel-2 & Running ML Model...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Run Google Earth Engine Analysis & NDVI Extraction</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Execution Progress & Deep Intelligence Results (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Progress / Status Card while executing */}
          {analyzing && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-brand-200 space-y-4 animate-pulse">
              <h3 className="text-sm font-bold text-brand-900 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-600 animate-ping"></span>
                Executing Real-Time Geospatial Intelligence Pipeline
              </h3>

              <div className="space-y-3 text-xs">
                <div
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    pipelineStep >= 1
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span>{pipelineStep > 1 ? '✅' : '🛰️'}</span>
                  <span>1. Parsing AOI polygon & sampling Copernicus Sentinel-2 MSI</span>
                </div>

                <div
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    pipelineStep >= 2
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span>{pipelineStep > 2 ? '✅' : '🌍'}</span>
                  <span>2. Google Earth Engine spatial reduction (B2-B12, NDVI, NDWI, NDBI)</span>
                </div>

                <div
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    pipelineStep >= 3
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span>{pipelineStep > 3 ? '✅' : '🧠'}</span>
                  <span>3. Running 15-feature Random Forest ML inference & explainability</span>
                </div>

                <div
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    pipelineStep >= 4
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold'
                      : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                >
                  <span>{pipelineStep >= 4 ? '✅' : '🎨'}</span>
                  <span>4. Compiling raster tiles & ecological risk breakdown</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-red-800 text-xs space-y-2">
              <p className="font-bold flex items-center gap-2 text-sm text-red-900">
                <span>⚠️</span> AOI Analysis Encountered an Error
              </p>
              <p>{error}</p>
            </div>
          )}

          {/* Empty state before running */}
          {!analyzing && !analysisResult && !error && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center space-y-3">
              <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center text-3xl mx-auto">
                📐
              </div>
              <h3 className="text-base font-bold text-gray-800">Ready to Analyze AOI</h3>
              <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                Draw a custom polygon, bounding box, or choose a preset hotspot on the map. Then click <strong>Run Google Earth Engine Analysis</strong> to extract multi-year Sentinel-2 NDVI, NDWI, and NDBI indices.
              </p>
            </div>
          )}

          {/* Detailed Analysis Results Panel */}
          {analysisResult && (
            <div className="space-y-4">
              {/* Report Generation Action Banner */}
              <div className="bg-gradient-to-r from-brand-600 via-indigo-600 to-emerald-600 rounded-2xl p-4 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="space-y-0.5 text-center sm:text-left">
                  <div className="flex flex-wrap items-center gap-2 mb-1 justify-center sm:justify-start">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/90 bg-white/20 px-2 py-0.5 rounded-full inline-block">
                      Analysis Completed
                    </span>
                    {analysisResult.is_live && !analysisResult.is_demo ? (
                      <span
                        id="aoi-provenance-banner-badge"
                        className="text-[10px] font-bold uppercase tracking-wider bg-emerald-400/30 text-emerald-100 border border-emerald-300/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-300"></span>
                        Live Satellite Analysis
                      </span>
                    ) : (
                      <span
                        id="aoi-provenance-banner-badge"
                        className="text-[10px] font-bold uppercase tracking-wider bg-amber-400/30 text-amber-100 border border-amber-300/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span>
                        Synthetic / Demo Analysis
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold">Formal Environmental Audit Report Ready</h4>
                  <p className="text-xs text-white/90">
                    Generate an audit report for this {aoiAreaApprox} km² footprint with PDF, CSV, and GeoJSON export.
                  </p>
                </div>
                <button
                  id="generate-aoi-report-btn"
                  onClick={handleGenerateAoiReport}
                  className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-surface-50 text-brand-900 rounded-xl font-extrabold text-xs shadow hover:shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                >
                  <span>📄</span>
                  <span>Generate Report for This AOI</span>
                  <span>&rarr;</span>
                </button>
              </div>

              {/* Data Provenance & Transparency Notice if not live satellite data */}
              {(!analysisResult.is_live || analysisResult.is_demo) && (
                <div
                  id="aoi-demo-transparency-notice"
                  className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900 shadow-sm"
                >
                  <span className="text-base p-1 bg-amber-100 rounded-lg shrink-0">ℹ️</span>
                  <div className="space-y-0.5">
                    <div className="font-bold text-amber-950 flex items-center gap-2">
                      <span>Demo Mode — Synthetic Feature Calibration</span>
                      <span className="text-[10px] bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">
                        Synthetic Source
                      </span>
                    </div>
                    <p className="text-amber-800 text-[11px] leading-relaxed">
                      Google Earth Engine is not active in this backend deployment. The Random Forest model scored synthetic calibration features rather than live satellite-derived spectral reflectance.
                    </p>
                    {analysisResult.source && (
                      <div className="text-[10px] text-amber-700 font-mono mt-1 pt-1 border-t border-amber-200/60">
                        Data Source: {analysisResult.source}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ML Risk Score & Prediction Card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        Machine Learning Decision
                      </span>
                      {analysisResult.is_live && !analysisResult.is_demo ? (
                        <span
                          id="aoi-result-source-badge"
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Live Sentinel-2
                        </span>
                      ) : (
                        <span
                          id="aoi-result-source-badge"
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Synthetic / Demo
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mt-0.5">
                      {analysisResult.ml_result.label}
                    </h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold border ${getRiskColor(
                      analysisResult.ml_result.risk_level
                    )}`}
                  >
                    {analysisResult.ml_result.risk_level} Risk
                  </span>
                </div>

                {/* Score Gauge & Probability */}
                <div className="grid grid-cols-2 gap-4 items-center">
                  <div className="p-4 bg-surface-50 rounded-xl text-center border border-gray-100">
                    <span className="text-[11px] font-medium text-gray-500 block">Calculated Risk Score</span>
                    <div className="text-3xl font-extrabold mt-1" style={{ color: getRiskBadgeColor(analysisResult.ml_result.risk_score) }}>
                      {analysisResult.ml_result.risk_score === 0 && analysisResult.ml_result.probability > 0
                        ? (analysisResult.ml_result.probability * 100).toFixed(1)
                        : analysisResult.ml_result.risk_score}
                      <span className="text-xs text-gray-400 font-normal"> / 100</span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold mt-1 block ${
                        analysisResult.ml_result.risk_score < 40
                          ? 'text-emerald-600'
                          : analysisResult.ml_result.risk_score < 70
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {analysisResult.ml_result.risk_score < 40 ? '✓ Minimal / Stable' : analysisResult.ml_result.risk_score < 70 ? '⚠ Moderate Concern' : '🚨 High Risk'}
                    </span>
                  </div>

                  <div className="p-4 bg-surface-50 rounded-xl text-center border border-gray-100">
                    <span className="text-[11px] font-medium text-gray-500 block">Disturbance Probability</span>
                    <div className="text-3xl font-extrabold text-brand-600 mt-1">
                      {Math.round(analysisResult.ml_result.probability * 1000) / 10}%
                    </div>
                  </div>
                </div>

                {/* Environmental Shifts Breakdown */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg bg-red-50/70 border border-red-100">
                    <span className="text-[10px] text-red-600 block font-semibold">Vegetation Loss</span>
                    <strong className="text-sm text-red-800 font-bold block mt-0.5">
                      {analysisResult.summary.vegetation_loss_km2} km²
                    </strong>
                    <span className="text-[10px] text-red-500 font-mono">
                      ΔNDVI: {analysisResult.summary.net_ndvi_change > 0 ? '+' : ''}
                      {analysisResult.summary.net_ndvi_change}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-100">
                    <span className="text-[10px] text-amber-700 block font-semibold">Land Disturbance</span>
                    <strong className="text-sm text-amber-900 font-bold block mt-0.5">
                      {analysisResult.summary.disturbance_km2} km²
                    </strong>
                    <span className="text-[10px] text-amber-600 font-mono">
                      ΔNDBI: {analysisResult.summary.net_ndbi_change > 0 ? '+' : ''}
                      {analysisResult.summary.net_ndbi_change}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-100">
                    <span className="text-[10px] text-blue-700 block font-semibold">Water Extent</span>
                    <strong className="text-sm text-blue-900 font-bold block mt-0.5">
                      {analysisResult.summary.water_expansion_km2} km²
                    </strong>
                    <span className="text-[10px] text-blue-600 font-mono">
                      ΔNDWI: {analysisResult.summary.net_ndwi_change > 0 ? '+' : ''}
                      {analysisResult.summary.net_ndwi_change}
                    </span>
                  </div>
                </div>
              </div>

              {/* Multi-Year Progression Line Chart */}
              {analysisResult.yearly_progression && analysisResult.yearly_progression.length > 0 && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      📈 Multi-Year Spectral Index Trajectory (Sentinel-2)
                    </h4>
                    <span className="text-[11px] text-gray-400">Surface Medians</span>
                  </div>

                  <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={analysisResult.yearly_progression}
                        margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                        <YAxis domain={[-0.4, 0.7]} tick={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{
                            fontSize: '11px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                        <Line
                          type="monotone"
                          dataKey="ndvi_mean"
                          name="NDVI (Canopy Health)"
                          stroke="#16a34a"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ndbi_mean"
                          name="NDBI (Bare Soil/Built)"
                          stroke="#ea580c"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="ndwi_mean"
                          name="NDWI (Water/Moisture)"
                          stroke="#0284c7"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Explainable AI: Top Contributing Features Bar Chart */}
              {analysisResult.ml_result.top_features && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                      🔬 Explainable AI: Top Predictor Contributions
                    </h4>
                    <span className="text-[11px] text-gray-400">Random Forest Weights</span>
                  </div>

                  <div className="h-44 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={analysisResult.ml_result.top_features.slice(0, 6)}
                        layout="vertical"
                        margin={{ top: 5, right: 20, left: 45, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="2 2" horizontal={false} stroke="#f8fafc" />
                        <XAxis type="number" domain={[0, 0.45]} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="feature" tick={{ fontSize: 10 }} width={75} />
                        <Tooltip
                          formatter={(val, name, item) => [
                            `${Math.round(val * 1000) / 10}% importance (Value: ${item.payload.value})`,
                            item.payload.description,
                          ]}
                          contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                        />
                        <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                          {analysisResult.ml_result.top_features.slice(0, 6).map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={index === 0 ? '#2563eb' : index === 1 ? '#3b82f6' : '#93c5fd'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Verification & Advisory Note */}
              <div className="bg-surface-900 text-white rounded-2xl p-5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-brand-400 flex items-center gap-1.5">
                    <span>🛡️</span> Prescribed Advisory Protocol
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    Status: {analysisResult.is_live && !analysisResult.is_demo ? 'Live Observation' : 'Reference / Demonstration'}
                  </span>
                </div>
                <p className="text-gray-300 leading-relaxed">
                  {analysisResult.ml_result.risk_level === 'High'
                    ? 'Immediate ground survey recommended. High probability of canopy loss and surface disturbance detected between baseline and comparison periods.'
                    : analysisResult.ml_result.risk_level === 'Medium'
                    ? 'Schedule routine follow-up satellite pass. Spectral shifts observed in moisture and canopy indices.'
                    : 'Normal ecological index range. Continue standard periodic observation cycle.'}
                </p>
                <div className="pt-2 border-t border-surface-700 flex items-center justify-between text-[11px] text-gray-400">
                  <span title={analysisResult.source}>Source: {analysisResult.source?.length > 40 ? `${analysisResult.source.substring(0, 40)}...` : analysisResult.source}</span>
                  <span>Sensor: {analysisResult.is_live && !analysisResult.is_demo ? 'Sentinel-2 L2A (Harmonized)' : 'Synthetic Calibration Dataset'}</span>
                </div>
              </div>

              {/* Bottom Generate Report Action Button */}
              <button
                onClick={handleGenerateAoiReport}
                className="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>📄</span>
                <span>Generate Formal Audit Report for This AOI</span>
                <span>&rarr;</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
