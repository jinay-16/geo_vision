/**
 * GeoVision AI — Central Shared Basemap Configuration
 *
 * Provides working, reliable, 100% keyless basemaps across all MapLibre GL instances:
 * - OpenStreetMap Standard (Primary Free Default)
 * - Satellite Imagery (Esri World Imagery)
 * - Dark Canvas (Esri World Dark Gray - reliable keyless Dark Matter alternative)
 * - Light Canvas (Esri World Light Gray - reliable keyless Positron alternative)
 * - Topographic Relief (OpenTopoMap)
 *
 * Provider Terms & CARTO Notice:
 * In 2024, CARTO officially deprecated keyless access on basemaps.cartocdn.com.
 * Unauthenticated requests now return an "API KEY REQUIRED" 256x256 watermark tile.
 * CARTO basemaps are therefore explicitly tagged as requiring an API key, and the
 * platform automatically falls back to OpenStreetMap Standard without watermark errors.
 */

export const DEFAULT_BASEMAP_ID = 'osm';

export const BASEMAP_STYLES = {
  osm: {
    id: 'osm',
    label: 'OpenStreetMap Standard (Default)',
    shortLabel: 'OpenStreetMap',
    icon: '🗺️',
    description: 'Community-maintained worldwide street mapping. 100% free, reliable and keyless.',
    requiresKey: false,
    available: true,
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },

  satellite: {
    id: 'satellite',
    label: 'Satellite Imagery (Esri)',
    shortLabel: 'Satellite',
    icon: '🛰️',
    description: 'High-resolution optical satellite & aerial imagery from Esri World Imagery (Keyless).',
    requiresKey: false,
    available: true,
    style: {
      version: 8,
      sources: {
        'satellite-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution:
            'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        },
      },
      layers: [
        {
          id: 'satellite-tiles-layer',
          type: 'raster',
          source: 'satellite-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },

  dark: {
    id: 'dark',
    label: 'Dark Canvas (Keyless)',
    shortLabel: 'Dark Canvas',
    icon: '🌙',
    description: 'Neutral dark-gray cartography designed for high-contrast environmental overlay inspection (Keyless).',
    requiresKey: false,
    available: true,
    style: {
      version: 8,
      sources: {
        'dark-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        },
      },
      layers: [
        {
          id: 'dark-tiles-layer',
          type: 'raster',
          source: 'dark-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },

  light: {
    id: 'light',
    label: 'Light Canvas (Keyless)',
    shortLabel: 'Light Canvas',
    icon: '☀️',
    description: 'Subtle, minimalist light-gray cartography providing clean context without visual clutter (Keyless).',
    requiresKey: false,
    available: true,
    style: {
      version: 8,
      sources: {
        'light-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
        },
      },
      layers: [
        {
          id: 'light-tiles-layer',
          type: 'raster',
          source: 'light-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },

  topo: {
    id: 'topo',
    label: 'Topographic Relief (OpenTopoMap)',
    shortLabel: 'Topographic',
    icon: '🏔️',
    description: 'Elevation contours and terrain relief shading from OpenTopoMap / SRTM (Keyless).',
    requiresKey: false,
    available: true,
    style: {
      version: 8,
      sources: {
        'topo-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
            'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
            'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution:
            'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a>',
        },
      },
      layers: [
        {
          id: 'topo-tiles-layer',
          type: 'raster',
          source: 'topo-tiles',
          minzoom: 0,
          maxzoom: 17,
        },
      ],
    },
  },

  voyager: {
    id: 'voyager',
    label: 'CARTO Voyager (API Key Required)',
    shortLabel: 'CARTO Voyager',
    icon: '🔒',
    description: 'CARTO requires an authenticated API key since 2024. Watermarked tiles returned if key is missing.',
    requiresKey: true,
    available: false,
    fallbackId: 'osm',
    // Fall back to OSM style to prevent rendering broken watermarked tiles
    style: null,
  },
};

/**
 * Resolves a safe basemap key. If an invalid or key-required key (such as 'voyager')
 * is passed, it returns the verified keyless fallback 'osm'.
 */
export function resolveSafeBasemapId(key) {
  if (!key) return DEFAULT_BASEMAP_ID;
  const cfg = BASEMAP_STYLES[key];
  if (cfg && cfg.available && cfg.style) {
    return key;
  }
  if (key === 'voyager') return 'osm';
  if (key === 'positron') return 'light';
  return DEFAULT_BASEMAP_ID;
}

/**
 * Returns the MapLibre style JSON for a given basemap key.
 * Always guarantees a valid style object.
 */
export function getBasemapStyle(key) {
  const safeKey = resolveSafeBasemapId(key);
  const rawStyle = BASEMAP_STYLES[safeKey]?.style || BASEMAP_STYLES.osm.style;
  return JSON.parse(JSON.stringify(rawStyle));
}

/**
 * Returns basemap options for UI dropdowns.
 */
export function getBasemapOptions() {
  return Object.values(BASEMAP_STYLES);
}
