import { useState, useRef, useEffect, useCallback } from 'react';
import { Map, NavigationControl, FullscreenControl, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
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
  CartesianGrid,
} from 'recharts';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/tiff',
];

export default function FieldPhotoAnalysis() {
  const [photoFile, setPhotoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  const [manualCoordMode, setManualCoordMode] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [bufferMeters, setBufferMeters] = useState(1000);
  const [activeLayer, setActiveLayer] = useState('true_color');
  const [dragOver, setDragOver] = useState(false);
  const [selectedSampleName, setSelectedSampleName] = useState(null);
  const [rasterOpacity, setRasterOpacity] = useState(0.85);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [rasterTileState, setRasterTileState] = useState('idle'); // 'idle' | 'requested' | 'loading' | 'loaded' | 'failed'

  const fileInputRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerInstanceRef = useRef(null);
  const previewUrlRef = useRef(previewUrl);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  // Sample presets for instant testing
  const SAMPLES = [
    {
      name: 'Mulshi Ghats Forest Canopy Loss Site',
      lat: 18.5124,
      lng: 73.5218,
      desc: 'Western Ghats dense canopy buffer with recorded tree clearing.',
    },
    {
      name: 'PCMC North Quarry & Bare-Soil Expansion',
      lat: 18.6642,
      lng: 73.8315,
      desc: 'Quarrying, excavation and industrial bare-soil exposure zone.',
    },
    {
      name: 'Khadakwasla Basin Shoreline & Riparian Buffer',
      lat: 18.4385,
      lng: 73.7621,
      desc: 'Water reservoir boundary and seasonal shoreline shift zone.',
    },
  ];

  const basemapKeyRef = useRef(DEFAULT_BASEMAP_ID);
  const [basemapKey, setBasemapKey] = useState(DEFAULT_BASEMAP_ID);
  useEffect(() => {
    basemapKeyRef.current = basemapKey;
  }, [basemapKey]);

  const analysisResultRef = useRef(analysisResult);
  useEffect(() => {
    analysisResultRef.current = analysisResult;
  }, [analysisResult]);

  const activeLayerRef = useRef(activeLayer);
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  const manualLatRef = useRef(manualLat);
  useEffect(() => {
    manualLatRef.current = manualLat;
  }, [manualLat]);

  const manualLngRef = useRef(manualLng);
  useEffect(() => {
    manualLngRef.current = manualLng;
  }, [manualLng]);

  const bufferMetersRef = useRef(bufferMeters);
  useEffect(() => {
    bufferMetersRef.current = bufferMeters;
  }, [bufferMeters]);

  const manualCoordModeRef = useRef(manualCoordMode);
  useEffect(() => {
    manualCoordModeRef.current = manualCoordMode;
  }, [manualCoordMode]);

  const rasterOpacityRef = useRef(rasterOpacity);
  useEffect(() => {
    rasterOpacityRef.current = rasterOpacity;
  }, [rasterOpacity]);

  // ── Setup & restore buffer + raster layers on style load ──────────
  const setupPhotoLayers = useCallback((map) => {
    if (!map || !map.isStyleLoaded()) return;

    try {
      if (!map.getSource('photo-buffer-source')) {
        map.addSource('photo-buffer-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      if (!map.getLayer('photo-buffer-fill')) {
        map.addLayer({
          id: 'photo-buffer-fill',
          type: 'fill',
          source: 'photo-buffer-source',
          paint: {
            'fill-color': '#60a5fa',
            'fill-opacity': 0.18,
          },
        });
      }

      if (!map.getLayer('photo-buffer-line')) {
        map.addLayer({
          id: 'photo-buffer-line',
          type: 'line',
          source: 'photo-buffer-source',
          paint: {
            'line-color': '#2563eb',
            'line-width': 2,
            'line-dasharray': [4, 4],
          },
        });
      }

      // Determine if coordinates exist — NEVER default to Pune
      const res = analysisResultRef.current;
      const mLat = parseFloat(manualLatRef.current);
      const mLng = parseFloat(manualLngRef.current);
      let lat = null;
      let lng = null;

      if (res?.coordinates?.latitude != null && res?.coordinates?.longitude != null) {
        lat = res.coordinates.latitude;
        lng = res.coordinates.longitude;
      } else if (
        manualCoordModeRef.current &&
        !isNaN(mLat) &&
        !isNaN(mLng) &&
        mLat >= -90 &&
        mLat <= 90 &&
        mLng >= -180 &&
        mLng <= 180
      ) {
        lat = mLat;
        lng = mLng;
      }

      const bm = bufferMetersRef.current;
      const bufferSrc = map.getSource('photo-buffer-source');

      if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
        const points = [];
        const earthRadius = 6378137;
        for (let i = 0; i <= 36; i++) {
          const angle = (i * 2 * Math.PI) / 36;
          const dLat = (bm * Math.sin(angle)) / earthRadius;
          const dLng = (bm * Math.cos(angle)) / (earthRadius * Math.cos((lat * Math.PI) / 180));
          const pLat = lat + (dLat * 180) / Math.PI;
          const pLng = lng + (dLng * 180) / Math.PI;
          points.push([pLng, pLat]);
        }

        if (bufferSrc) {
          bufferSrc.setData({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [points],
            },
          });
        }
      } else if (bufferSrc) {
        bufferSrc.setData({ type: 'FeatureCollection', features: [] });
      }

      // Re-apply GEE raster layer if active
      const lyr = activeLayerRef.current;
      const tileUrl = res?.satellite_analysis?.tile_layers?.[lyr];
      const sourceId = 'photo-gee-source';
      const layerId = 'photo-gee-layer';

      if (tileUrl) {
        setRasterTileState((prev) => (prev === 'loaded' ? 'loaded' : 'requested'));
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: 'Google Earth Engine &copy; Copernicus Sentinel-2',
          });
        }
        if (!map.getLayer(layerId)) {
          const beforeId = map.getLayer('photo-buffer-line') ? 'photo-buffer-line' : undefined;
          map.addLayer(
            {
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: {
                'raster-opacity': rasterOpacityRef.current,
                'raster-fade-duration': 200,
              },
            },
            beforeId
          );
        }
      } else {
        setRasterTileState('idle');
      }
    } catch (err) {
      console.warn('MapLibre: Failed adding photo layers on style load:', err);
    }
  }, []);

  const handleBasemapChange = (newKey) => {
    const safeKey = resolveSafeBasemapId(newKey);
    setBasemapKey(safeKey);
    basemapKeyRef.current = safeKey;
    const map = mapInstance.current;
    if (!map) return;

    try {
      setMapLoaded(false);
      map.setStyle(getBasemapStyle(safeKey));
      map.once('style.load', () => {
        setMapLoaded(true);
        setupPhotoLayers(map);
        map.resize();
      });
    } catch (err) {
      console.error('Failed to change photo map basemap style:', err);
      setMapLoaded(false);
      map.setStyle(getBasemapStyle('osm'));
      map.once('style.load', () => {
        setMapLoaded(true);
        setupPhotoLayers(map);
        map.resize();
      });
    }
  };

  // Initialize MapLibre map (overview center on India, not Pune)
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    let resizeTimer1;
    let resizeTimer2;
    let resizeTimer3;
    let ro;

    try {
      const initialKey = resolveSafeBasemapId(basemapKeyRef.current);
      const map = new Map({
        container: mapRef.current,
        style: getBasemapStyle(initialKey),
        center: [78.9629, 20.5937], // India national overview
        zoom: 4.5,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
      });
      mapInstance.current = map;

      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      map.addControl(new FullscreenControl(), 'top-right');

      map.on('load', () => {
        setMapLoaded(true);
        setupPhotoLayers(map);
        map.resize();
      });

      // Track GEE Sentinel-2 raster tile lifecycle
      map.on('sourcedata', (e) => {
        if (e.sourceId === 'photo-gee-source' && e.isSourceLoaded) {
          setRasterTileState('loaded');
        }
      });

      map.on('dataloading', (e) => {
        if (e.sourceId === 'photo-gee-source') {
          setRasterTileState((prev) => (prev === 'loaded' ? 'loaded' : 'loading'));
        }
      });

      resizeTimer1 = setTimeout(() => {
        mapInstance.current?.resize();
      }, 150);
      resizeTimer2 = setTimeout(() => {
        mapInstance.current?.resize();
      }, 450);
      resizeTimer3 = setTimeout(() => {
        mapInstance.current?.resize();
      }, 900);

      if (typeof window !== 'undefined' && window.ResizeObserver && mapRef.current) {
        ro = new ResizeObserver(() => {
          mapInstance.current?.resize();
        });
        ro.observe(mapRef.current);
      }

      // Handle window resize
      const handleWinResize = () => {
        mapInstance.current?.resize();
      };
      window.addEventListener('resize', handleWinResize);

      // Allow clicking on map to place/move coordinates pin in manual mode
      map.on('click', (e) => {
        if (manualCoordModeRef.current) {
          setManualLat(e.lngLat.lat.toFixed(6));
          setManualLng(e.lngLat.lng.toFixed(6));
        }
      });

      map.on('error', (e) => {
        if (e.sourceId === 'photo-gee-source' || e.error?.message?.includes('photo-gee')) {
          console.warn('MapLibre: Failed loading photo GEE tile:', e.error);
          setRasterTileState('failed');
        } else {
          const status = e?.error?.status;
          if ((status === 401 || status === 403) && basemapKeyRef.current !== 'osm') {
            console.warn(`Tile provider auth error (${status}), falling back to OpenStreetMap`);
            handleBasemapChange('osm');
          } else if (e?.error?.status === 404 || e?.error?.message?.includes('tile')) {
            console.warn('MapLibre tile notice in FieldPhotoAnalysis:', e.error);
          }
        }
      });
    } catch (err) {
      console.error('Error initializing MapLibre in FieldPhotoAnalysis:', err);
    }

    return () => {
      clearTimeout(resizeTimer1);
      clearTimeout(resizeTimer2);
      clearTimeout(resizeTimer3);
      if (ro) ro.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', () => mapInstance.current?.resize());
      }
      if (markerInstanceRef.current) {
        markerInstanceRef.current.remove();
        markerInstanceRef.current = null;
      }
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [setupPhotoLayers]);

  // Update map marker, buffer circle, and tile overlay when coordinates or analysisResult change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    const mLat = parseFloat(manualLat);
    const mLng = parseFloat(manualLng);
    const hasResultCoords =
      analysisResult?.coordinates?.latitude != null &&
      analysisResult?.coordinates?.longitude != null;
    const hasManualCoords =
      manualCoordMode &&
      !isNaN(mLat) &&
      !isNaN(mLng) &&
      manualLat !== '' &&
      manualLng !== '' &&
      mLat >= -90 &&
      mLat <= 90 &&
      mLng >= -180 &&
      mLng <= 180;

    let targetLat = null;
    let targetLng = null;
    let coordSource = null;

    if (hasResultCoords) {
      targetLat = analysisResult.coordinates.latitude;
      targetLng = analysisResult.coordinates.longitude;
      const isExif =
        analysisResult.has_gps &&
        (!analysisResult.evidence_classification?.coordinate_source ||
          analysisResult.evidence_classification.coordinate_source.includes('EXIF'));
      coordSource = isExif ? 'exif' : 'manual';
    } else if (hasManualCoords) {
      targetLat = mLat;
      targetLng = mLng;
      coordSource = 'manual';
    }

    // Only render marker and buffer circle if valid coordinates exist — NO default Pune marker!
    if (targetLat != null && targetLng != null && !isNaN(targetLat) && !isNaN(targetLng)) {
      map.flyTo({ center: [targetLng, targetLat], zoom: 14, duration: 600 });
      setTimeout(() => map.resize(), 150);

      // Remove existing marker
      if (markerInstanceRef.current) {
        markerInstanceRef.current.remove();
        markerInstanceRef.current = null;
      }

      // Custom marker styled differently for EXIF vs Manual coordinates
      const pinEl = document.createElement('div');
      pinEl.className = 'custom-photo-pin';
      pinEl.style.width = '34px';
      pinEl.style.height = '34px';
      pinEl.style.borderRadius = '50%';
      pinEl.style.border = '3px solid white';
      pinEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.35)';
      pinEl.style.display = 'flex';
      pinEl.style.alignItems = 'center';
      pinEl.style.justifyContent = 'center';
      pinEl.style.fontSize = '16px';
      pinEl.style.cursor = 'pointer';

      let popupHtml = '';
      if (coordSource === 'exif') {
        pinEl.style.background = '#059669'; // Emerald green
        pinEl.innerText = '📸';
        popupHtml = `
          <div style="font-family:sans-serif;font-size:12px;">
            <div style="font-weight:bold;color:#065f46;margin-bottom:2px;">📸 EXIF GPS Extracted</div>
            <div>${targetLat.toFixed(6)}°, ${targetLng.toFixed(6)}°</div>
            <div style="font-size:10px;color:#6b7280;margin-top:2px;">Embedded Camera/Drone Metadata</div>
          </div>
        `;
      } else {
        pinEl.style.background = '#d97706'; // Amber / gold
        pinEl.innerText = '📍';
        popupHtml = `
          <div style="font-family:sans-serif;font-size:12px;">
            <div style="font-weight:bold;color:#92400e;margin-bottom:2px;">📍 Manually Placed Location</div>
            <div>${targetLat.toFixed(6)}°, ${targetLng.toFixed(6)}°</div>
            <div style="font-size:10px;color:#6b7280;margin-top:2px;">User-specified coordinates / Pin</div>
          </div>
        `;
      }

      const popup = new Popup({ offset: 16 }).setHTML(popupHtml);

      const marker = new Marker({ element: pinEl })
        .setLngLat([targetLng, targetLat])
        .setPopup(popup)
        .addTo(map);

      markerInstanceRef.current = marker;

      // Generate circle buffer polygon (36 segments)
      const points = [];
      const earthRadius = 6378137;
      for (let i = 0; i <= 36; i++) {
        const angle = (i * 2 * Math.PI) / 36;
        const dLat = (bufferMeters * Math.sin(angle)) / earthRadius;
        const dLng = (bufferMeters * Math.cos(angle)) / (earthRadius * Math.cos((targetLat * Math.PI) / 180));
        const pLat = targetLat + (dLat * 180) / Math.PI;
        const pLng = targetLng + (dLng * 180) / Math.PI;
        points.push([pLng, pLat]);
      }

      const bufferSrc = map.getSource('photo-buffer-source');
      if (bufferSrc) {
        bufferSrc.setData({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [points],
          },
        });
      }
    } else {
      // Clear marker and buffer circle if no coordinates exist
      if (markerInstanceRef.current) {
        markerInstanceRef.current.remove();
        markerInstanceRef.current = null;
      }
      const bufferSrc = map.getSource('photo-buffer-source');
      if (bufferSrc) {
        bufferSrc.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // GEE Tile overlay
    const sourceId = 'photo-gee-source';
    const layerId = 'photo-gee-layer';
    const tileUrl = analysisResult?.satellite_analysis?.tile_layers?.[activeLayer];

    try {
      const currentSource = map.getSource(sourceId);
      if (map.getLayer(layerId) && currentSource && currentSource.tiles && currentSource.tiles[0] === tileUrl) {
        map.setPaintProperty(layerId, 'raster-opacity', rasterOpacity);
      } else {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        if (tileUrl) {
          setRasterTileState((prev) => (prev === 'loaded' ? 'loaded' : 'requested'));
          map.addSource(sourceId, {
            type: 'raster',
            tiles: [tileUrl],
            tileSize: 256,
            attribution: 'Google Earth Engine &copy; Copernicus Sentinel-2',
          });

          const beforeId = map.getLayer('photo-buffer-line') ? 'photo-buffer-line' : undefined;
          map.addLayer(
            {
              id: layerId,
              type: 'raster',
              source: sourceId,
              paint: {
                'raster-opacity': rasterOpacity,
                'raster-fade-duration': 200,
              },
            },
            beforeId
          );
        } else {
          setRasterTileState('idle');
        }
      }
    } catch (e) {
      console.warn('MapLibre: Error updating photo GEE raster layer:', e);
      if (tileUrl) setRasterTileState('failed');
    }
  }, [analysisResult, activeLayer, manualLat, manualLng, manualCoordMode, bufferMeters, rasterOpacity, mapLoaded]);

  // Execute upload and satellite analysis
  const executeAnalysis = async (fileToUpload, fallbackLatVal = null, fallbackLngVal = null, isDemoMode = false) => {
    if (!fileToUpload) return;
    setAnalyzing(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('buffer_meters', bufferMeters);
    formData.append('start_year', 2023);
    formData.append('end_year', 2026);
    formData.append('demo', isDemoMode ? 'true' : 'false');

    if (fallbackLatVal != null && fallbackLngVal != null && fallbackLatVal !== '' && fallbackLngVal !== '') {
      formData.append('fallback_lat', fallbackLatVal);
      formData.append('fallback_lng', fallbackLngVal);
    }

    try {
      const res = await fetch('/api/analysis/geotagged-photo', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || `Analysis request failed (${res.status})`);
      }

      setAnalysisResult(data);
      if (!data.has_gps) {
        setManualCoordMode(true);
      } else {
        // If EXIF GPS found, populate manual inputs as reference but keep manual mode off
        if (data.coordinates?.latitude != null && data.coordinates?.longitude != null) {
          setManualLat(data.coordinates.latitude.toFixed(6));
          setManualLng(data.coordinates.longitude.toFixed(6));
        }
        setManualCoordMode(false);
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze photo');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileSelect = (file) => {
    if (!file) return;

    // Validate file size (max 25MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Selected photo exceeds the maximum size limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB. Please choose a smaller file.`);
      return;
    }

    // Validate file type
    const fileType = file.type ? file.type.toLowerCase() : '';
    const fileName = file.name ? file.name.toLowerCase() : '';
    const hasValidExt = /\.(jpe?g|png|webp|tiff?)$/i.test(fileName);
    const hasValidMime = ALLOWED_IMAGE_TYPES.includes(fileType) || fileType.startsWith('image/');

    if (!hasValidExt && !hasValidMime) {
      setError('Unsupported file type. Please upload a JPEG, PNG, TIFF, or WebP image.');
      return;
    }

    setError(null);
    setSelectedSampleName(null);
    setAnalysisResult(null); // Clear previous results to eliminate stale state
    setRasterTileState('idle');
    setPhotoFile(file);

    // Clean up previous preview URL to prevent memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    // If manual coordinates are already typed, pass them along as fallback
    const mLat = parseFloat(manualLat);
    const mLng = parseFloat(manualLng);
    const hasValidManual =
      manualCoordMode &&
      !isNaN(mLat) &&
      !isNaN(mLng) &&
      manualLat !== '' &&
      manualLng !== '' &&
      mLat >= -90 &&
      mLat <= 90 &&
      mLng >= -180 &&
      mLng <= 180;

    executeAnalysis(
      file,
      hasValidManual ? mLat : null,
      hasValidManual ? mLng : null,
      false
    );
  };

  const handleManualAnalyzeSubmit = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Please provide valid latitude (-90 to 90) and longitude (-180 to 180) coordinates.');
      return;
    }
    if (!photoFile) {
      setError('Please upload a ground photo first.');
      return;
    }
    setError(null);
    setSelectedSampleName(null);
    setAnalysisResult(null); // Clear previous results to eliminate stale state
    setRasterTileState('idle');
    executeAnalysis(photoFile, lat, lng, false);
  };

  const handleSampleSelect = async (sample) => {
    setError(null);
    setSelectedSampleName(sample.name);
    setAnalysisResult(null); // Clear previous results to eliminate stale state
    setRasterTileState('idle');
    setManualCoordMode(true);
    setManualLat(sample.lat.toString());
    setManualLng(sample.lng.toString());

    // Generate a quick canvas placeholder image as a mock field photo
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 600, 400);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('GeoVision AI Field Verification', 40, 60);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '15px sans-serif';
    ctx.fillText(sample.name, 40, 100);
    ctx.fillText(`Target: ${sample.lat}° N, ${sample.lng}° E`, 40, 130);
    ctx.fillText('Ground verification image sample', 40, 160);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const mockFile = new File([blob], `${sample.name.replace(/\s+/g, '_')}.jpg`, { type: 'image/jpeg' });
      setPhotoFile(mockFile);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(mockFile));
      executeAnalysis(mockFile, sample.lat, sample.lng, true);
    }, 'image/jpeg');
  };

  const meta = analysisResult?.photo_metadata || {};
  const sat = analysisResult?.satellite_analysis || {};
  const comp = sat?.composite_risk || {};
  const evidence = analysisResult?.evidence_classification || {};

  const isExifGps =
    analysisResult?.has_gps &&
    (!evidence.coordinate_source || evidence.coordinate_source.includes('EXIF'));

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📸</span>
            <h1 className="text-2xl font-bold text-gray-900">Field Photo Geotag Intelligence</h1>
            <span className="bg-brand-100 text-brand-700 font-bold px-2.5 py-0.5 rounded-full text-xs">
              Field-to-Satellite Verification
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Upload any ground photo or drone snapshot. GeoVision AI extracts the EXIF GPS coordinates, locks the satellite over the exact site, and performs live Sentinel-2 environmental analysis.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <span>📤</span> Upload Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileSelect(e.target.files[0]);
              }
              // Reset file input value to allow re-uploading same file if desired
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3 text-red-800 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Quick Test Samples */}
      <div className="bg-surface-50 rounded-xl p-4 border border-gray-200/70">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
          <span>⚡</span> Or test instantly with a simulated field sample:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SAMPLES.map((s, idx) => {
            const isSelected = selectedSampleName === s.name;
            return (
              <button
                key={idx}
                onClick={() => handleSampleSelect(s)}
                className={`text-left p-3 rounded-xl border transition-all shadow-xs group cursor-pointer ${
                  isSelected
                    ? 'bg-brand-50/80 border-brand-500 ring-2 ring-brand-300'
                    : 'bg-white hover:bg-brand-50/40 border-gray-200 hover:border-brand-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className={`font-bold text-xs ${isSelected ? 'text-brand-800' : 'text-gray-800 group-hover:text-brand-700'}`}>
                    {s.name}
                  </div>
                  {isSelected && (
                    <span className="text-[10px] bg-brand-600 text-white font-bold px-1.5 py-0.5 rounded">Active</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">{s.desc}</div>
                <div className="text-[10px] font-mono text-brand-600 mt-1.5 flex items-center justify-between">
                  <span>📍 {s.lat.toFixed(4)}°, {s.lng.toFixed(4)}°</span>
                  <span className="text-[10px] text-gray-400 font-sans">Simulated Site</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dual-View Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Ground Photo & EXIF Metadata (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-sm font-bold text-gray-800 flex items-center justify-between border-b border-gray-100 pb-3">
              <span className="flex items-center gap-2">
                <span>📱</span> 1. Ground Photo & EXIF GPS
              </span>
              {analysisResult && (
                isExifGps ? (
                  <span className="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded text-xs flex items-center gap-1">
                    <span>✔</span> EXIF GPS Locked
                  </span>
                ) : analysisResult.has_gps ? (
                  <span className="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded text-xs flex items-center gap-1">
                    <span>📍</span> Manual Coordinates
                  </span>
                ) : (
                  <span className="bg-gray-100 text-gray-600 font-semibold px-2 py-0.5 rounded text-xs flex items-center gap-1">
                    <span>⚠️</span> No GPS Metadata
                  </span>
                )
              )}
            </h2>

            {/* Photo Preview / Dropzone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-xl overflow-hidden border-2 border-dashed transition-all cursor-pointer min-h-[240px] flex items-center justify-center ${
                dragOver
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-gray-200 hover:border-brand-400 bg-gray-50'
              }`}
            >
              {previewUrl ? (
                <div className="relative w-full h-[260px] bg-black">
                  <img
                    src={previewUrl}
                    alt="Field Inspection Preview"
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded">
                    Click to replace photo (max 25MB)
                  </div>
                </div>
              ) : (
                <div className="text-center p-6 space-y-2">
                  <div className="text-4xl">📸</div>
                  <div className="text-xs font-bold text-gray-800">
                    Drop your field photo here, or click to browse
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Supports JPG, PNG, WebP with GPS metadata (max 25MB)
                  </p>
                </div>
              )}
            </div>

            {/* Coordinate Source and Manual Override Toggle */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-gray-500 font-medium">Coordinate Input:</span>
              <button
                type="button"
                onClick={() => setManualCoordMode(!manualCoordMode)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                  manualCoordMode
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {manualCoordMode ? '📍 Manual Pin Mode Active' : '✏️ Set Location Manually'}
              </button>
            </div>

            {/* Extracted Metadata Grid */}
            {analysisResult && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-surface-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">
                      Latitude ({isExifGps ? 'EXIF' : 'Target'})
                    </span>
                    <div className="font-mono font-bold text-gray-900 mt-0.5">
                      {analysisResult.coordinates?.latitude != null
                        ? `${analysisResult.coordinates.latitude.toFixed(6)}°`
                        : manualLat
                        ? `${parseFloat(manualLat).toFixed(6)}°`
                        : 'Not Set'}
                    </div>
                  </div>
                  <div className="bg-surface-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">
                      Longitude ({isExifGps ? 'EXIF' : 'Target'})
                    </span>
                    <div className="font-mono font-bold text-gray-900 mt-0.5">
                      {analysisResult.coordinates?.longitude != null
                        ? `${analysisResult.coordinates.longitude.toFixed(6)}°`
                        : manualLng
                        ? `${parseFloat(manualLng).toFixed(6)}°`
                        : 'Not Set'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-surface-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">Capture Device</span>
                    <div className="font-medium text-gray-800 mt-0.5 truncate">
                      {meta.camera_model || meta.camera_make || 'Standard GPS Camera'}
                    </div>
                  </div>
                  <div className="bg-surface-50 p-2.5 rounded-lg border border-gray-100">
                    <span className="text-[10px] text-gray-500 uppercase font-semibold">Capture Time</span>
                    <div className="font-medium text-gray-800 mt-0.5 truncate">
                      {meta.capture_date || 'Recent Field Survey'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Location Input Box (Shown when GPS missing OR manual mode active) */}
            {(manualCoordMode || (analysisResult && !analysisResult.has_gps)) && (
              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-2.5">
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span>📍</span> Manual Location Placement
                  </span>
                  <span className="text-[10px] bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded font-mono">
                    Click map to place pin
                  </span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Click on the satellite map or enter coordinates directly below to analyze this site:
                </p>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Latitude (-90 to 90)</label>
                    <input
                      type="number"
                      step="any"
                      value={manualLat}
                      onChange={(e) => setManualLat(e.target.value)}
                      placeholder="e.g. 19.0760"
                      className="w-full p-2 border border-amber-300 rounded text-xs bg-white text-gray-900"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="text-[10px] font-bold text-amber-900 block mb-0.5">Longitude (-180 to 180)</label>
                    <input
                      type="number"
                      step="any"
                      value={manualLng}
                      onChange={(e) => setManualLng(e.target.value)}
                      placeholder="e.g. 72.8777"
                      className="w-full p-2 border border-amber-300 rounded text-xs bg-white text-gray-900"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleManualAnalyzeSubmit}
                  disabled={analyzing || !photoFile}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                >
                  <span>🚀</span> Analyze Site at Manual Coordinates
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Satellite Map & Layer Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <span>🛰️</span> 2. Copernicus Sentinel-2 Satellite View
              </h2>

              {/* Basemap, Layer & Opacity Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Basemap Switcher */}
                <div className="flex items-center gap-1 bg-surface-50 px-2 py-1 rounded-xl border border-gray-200 text-xs">
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

                {/* Layer Selector */}
                <div className="flex items-center gap-1 bg-surface-50 p-1 rounded-xl border border-gray-200 text-xs">
                  {[
                    { key: 'true_color', label: 'True Color (RGB)' },
                    { key: 'false_color', label: 'False Color (CIR)' },
                    { key: 'ndvi_change', label: 'NDVI Delta' },
                    { key: 'disturbance', label: 'Disturbance' },
                  ].map((l) => (
                    <button
                      key={l.key}
                      onClick={() => setActiveLayer(l.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        activeLayer === l.key
                          ? 'bg-brand-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                {/* Opacity Slider */}
                <div className="flex items-center gap-1.5 bg-surface-50 px-2.5 py-1 rounded-xl border border-gray-200 text-xs">
                  <span className="text-[10px] text-gray-500 font-mono font-semibold">OPACITY:</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={rasterOpacity}
                    onChange={(e) => setRasterOpacity(parseFloat(e.target.value))}
                    className="w-14 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-600"
                    title={`Satellite Layer Opacity: ${Math.round(rasterOpacity * 100)}%`}
                  />
                  <span className="text-[10px] font-mono text-gray-700 w-7 text-right">
                    {Math.round(rasterOpacity * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* MapLibre Map Container with Overlays */}
            <div className="relative">
              <div
                ref={mapRef}
                style={{ height: '420px', minHeight: '420px', width: '100%', position: 'relative' }}
                className="w-full rounded-xl overflow-hidden border border-gray-200 relative z-0 bg-slate-100"
              />

              {/* Informative Status Overlays */}
              {!analysisResult && !analyzing && (
                <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm text-xs text-gray-700 flex items-center gap-2 max-w-sm pointer-events-none">
                  <span>📍</span>
                  <span>Awaiting photo or sample selection — Select a sample above or upload a photo to inspect with Sentinel-2 satellite imagery.</span>
                </div>
              )}

              {/* Raster Tile Status Overlay */}
              {analysisResult && rasterTileState === 'loaded' && (
                <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-emerald-300 shadow-sm text-xs text-emerald-900 flex items-center gap-2 font-medium pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Sentinel-2 Level-2A ({activeLayer.replace('_', ' ').toUpperCase()}) Active • {Math.round(rasterOpacity * 100)}% Opacity</span>
                </div>
              )}

              {analysisResult && (rasterTileState === 'requested' || rasterTileState === 'loading') && (
                <div className="absolute top-3 left-3 z-10 bg-blue-50/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-blue-300 shadow-sm text-xs text-blue-900 flex items-center gap-2 font-medium pointer-events-none">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                  <span>Fetching Sentinel-2 Level-2A ({activeLayer.replace('_', ' ').toUpperCase()}) Satellite Tiles...</span>
                </div>
              )}

              {analysisResult && rasterTileState === 'failed' && (
                <div className="absolute top-3 left-3 z-10 bg-red-50/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-red-300 shadow-sm text-xs text-red-900 flex items-center gap-2 max-w-sm pointer-events-none">
                  <span>⚠️</span>
                  <span>Sentinel-2 Tile Request Failed — Retaining Base Cartography & Site Inspection Buffer</span>
                </div>
              )}

              {analysisResult && rasterTileState === 'idle' && !analysisResult.satellite_analysis?.tile_layers?.[activeLayer] && (
                <div className="absolute top-3 left-3 z-10 bg-amber-50/95 backdrop-blur-md px-3 py-1.5 rounded-lg border border-amber-300 shadow-sm text-xs text-amber-900 flex items-center gap-2 max-w-sm pointer-events-none">
                  <span>ℹ️</span>
                  <span>Sentinel-2 satellite overlay unavailable for this scene • Displaying base cartography & site buffer.</span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-gray-500 pt-1 gap-1">
              <span>
                Center:{' '}
                {analysisResult?.coordinates?.latitude != null
                  ? `${analysisResult.coordinates.latitude.toFixed(4)}°, ${analysisResult.coordinates.longitude.toFixed(4)}° (${isExifGps ? 'EXIF' : 'Manual'})`
                  : manualLat && manualLng
                  ? `${parseFloat(manualLat).toFixed(4)}°, ${parseFloat(manualLng).toFixed(4)}° (Manual Pin)`
                  : 'No coordinates selected'}
              </span>
              <span className="font-mono">
                Inspection Buffer: {bufferMeters}m ({analysisResult?.coordinates?.area_km2 || '3.14'} km²)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Evidence Classification & Regulatory Integrity Banner */}
      {analysisResult && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚖️</span>
              <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Evidence Integrity & Regulatory Classification
              </span>
            </div>
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              isExifGps ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {isExifGps ? '📷 EXIF Geotagged Image' : '📍 Manual Geographic Input'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-700 pt-1">
            <div className="bg-white p-3 rounded-xl border border-slate-200/70">
              <span className="font-bold text-slate-900 block mb-0.5">Ground Photo Observation:</span>
              <p className="text-[11px] text-slate-600">
                {evidence.ground_evidence || 'Ground-level visual observation snapshot at the recorded coordinates.'}
              </p>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200/70">
              <span className="font-bold text-slate-900 block mb-0.5">Satellite Remote Sensing Evidence:</span>
              <p className="text-[11px] text-slate-600">
                {evidence.satellite_evidence || 'Multi-temporal Sentinel-2 surface reflectance observations.'}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-200/60">
            {evidence.regulatory_caveat ||
              'Provisional screening assessment. Ground photos provide spatial and visual context but do not independently prove illegal deforestation or mining without corroborating statutory permits and ground survey validation.'}
          </p>
        </div>
      )}

      {/* Analysis Results Dashboard */}
      {analyzing ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100 space-y-3">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
          <h3 className="text-base font-bold text-gray-900">Querying Copernicus Sentinel-2 & Google Earth Engine</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Extracting multi-temporal surface reflectance for coordinates, computing vegetation indices, and running Random Forest inference...
          </p>
        </div>
      ) : analysisResult && analysisResult.has_gps ? (
        analysisResult.satellite_analysis ? (
          <div className="space-y-6">
            {/* Source & Mode Integrity Badge */}
            <div className="flex items-center justify-between bg-white rounded-xl p-3.5 border border-gray-100 shadow-xs">
              <div className="flex items-center gap-2">
                {sat.is_live ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Live Earth Engine Analysis
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    Demonstration Mode (Synthetic)
                  </span>
                )}
                <span className="text-xs text-gray-500 hidden sm:inline">
                  Source: {sat.source}
                </span>
              </div>
              <span className="text-xs text-gray-400 font-mono">
                Window: {sat.analysis_window}
              </span>
            </div>

            {/* Key Findings KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Risk Gauge */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Composite Risk</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className={`text-3xl font-extrabold ${
                    comp.risk_score >= 70 ? 'text-red-600' : comp.risk_score >= 40 ? 'text-amber-500' : 'text-emerald-600'
                  }`}>
                    {comp.risk_score || 0}
                  </span>
                  <span className="text-sm font-semibold text-gray-400">/ 100</span>
                  <span className={`ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    comp.risk_level === 'High' ? 'bg-red-100 text-red-700' : comp.risk_level === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {comp.risk_level} Risk
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{comp.label || 'Multi-indicator environmental assessment'}</p>
              </div>

              {/* ML Probability */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">ML Disturbance Model</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-extrabold text-brand-700">
                    {((sat.ml_inference?.probability || 0) * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">{sat.ml_inference?.label}</p>
              </div>

              {/* NDVI Change */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Canopy Delta (NDVI)</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className={`text-3xl font-extrabold ${
                    (sat.spectral_indices?.ndvi_net_change || 0) < 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}>
                    {(sat.spectral_indices?.ndvi_net_change || 0) > 0 ? '+' : ''}
                    {sat.spectral_indices?.ndvi_net_change?.toFixed(4)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Baseline {sat.spectral_indices?.ndvi_baseline_2023} → Current {sat.spectral_indices?.ndvi_current_2026}
                </p>
              </div>

              {/* Footprint */}
              <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Disturbance Footprint</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-extrabold text-gray-900">
                    {sat.physical_impact_footprint?.vegetation_loss_km2 || 0}
                  </span>
                  <span className="text-sm font-semibold text-gray-500">km²</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Primary Driver: {sat.physical_impact_footprint?.dominant_driver}
                </p>
              </div>
            </div>

            {/* Time Series Trend & Verification Recommendation */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Historical Progression */}
              <div className="lg:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span>📈</span> Multi-Year Sentinel-2 Spectral Progression
                </h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sat.yearly_progression || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
                      <YAxis domain={[-0.3, 0.6]} stroke="#64748b" fontSize={12} />
                      <Tooltip />
                      <Line type="monotone" dataKey="ndvi_mean" name="NDVI (Canopy)" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="ndbi_mean" name="NDBI (Disturbance)" stroke="#d97706" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="ndwi_mean" name="NDWI (Moisture)" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recommended Field Verification Action */}
              <div className="lg:col-span-5 bg-gradient-to-br from-surface-900 to-surface-800 text-white rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-brand-400 uppercase tracking-wider mb-2">
                    <span>📋</span> Operational Field Protocol
                  </div>
                  <h4 className="text-lg font-bold">Recommended Verification Action</h4>
                  <p className="text-xs text-gray-300 mt-2 leading-relaxed">
                    {sat.recommended_action}
                  </p>
                </div>

                <div className="space-y-2 pt-4 border-t border-surface-700 text-xs">
                  <div className="flex justify-between text-gray-400">
                    <span>Data Source</span>
                    <span className="font-semibold text-gray-200">{sat.source || (sat.is_live ? 'Copernicus Sentinel-2 Harmonized' : 'Synthetic Demonstration Engine')}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Field Verification Required</span>
                    <span className="font-semibold text-emerald-400">Yes (Scientific Standard)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <span>⚠️</span> Live Satellite Observation Extraction Unavailable
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              {analysisResult.satellite_error || 'Google Earth Engine was unable to extract cloud-free Sentinel-2 observations for this ground coordinate.'}
            </p>
            <p className="text-xs text-gray-600">
              Field photo GPS coordinates (<strong>{analysisResult.coordinates?.latitude?.toFixed(5)}°N, {analysisResult.coordinates?.longitude?.toFixed(5)}°E</strong>) remain plotted on the map.
            </p>
            <div className="pt-2">
              <button
                onClick={() => executeAnalysis(photoFile, analysisResult.coordinates?.latitude, analysisResult.coordinates?.longitude, true)}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                Simulate Calibration Demo at this Site
              </button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
