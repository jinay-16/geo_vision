/**
 * GeoVision AI — Geometry Utilities
 * Provides spherical geodesic circle and polygon calculation functions.
 */

/**
 * Generate a geodesic circular polygon GeoJSON geometry from center (lat, lng) and radius in km.
 * Uses 64 segments for a smooth, high-fidelity boundary with closed ring coordinates.
 *
 * @param {number} lat - Latitude in degrees
 * @param {number} lng - Longitude in degrees
 * @param {number} radiusKm - Radius in kilometres
 * @param {number} points - Number of circle segments (default: 64)
 * @returns {Object} GeoJSON Polygon geometry object with coordinates and metadata
 */
export function createCircularPolygon(lat, lng, radiusKm, points = 64) {
  const radiusMeters = radiusKm * 1000;
  const earthRadius = 6378137;
  const coords = [];
  const latRad = (lat * Math.PI) / 180;

  for (let i = 0; i < points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const dLat = (radiusMeters * Math.sin(angle)) / earthRadius;
    const dLng = (radiusMeters * Math.cos(angle)) / (earthRadius * Math.cos(latRad));
    const pLat = lat + (dLat * 180) / Math.PI;
    const pLng = lng + (dLng * 180) / Math.PI;
    coords.push([Number(pLng.toFixed(5)), Number(pLat.toFixed(5))]);
  }
  // Ensure the polygon ring is explicitly closed
  coords.push([coords[0][0], coords[0][1]]);

  return {
    type: 'Polygon',
    coordinates: [coords],
    radius_meters: radiusMeters,
    radius_km: radiusKm,
    center: [Number(lng.toFixed(5)), Number(lat.toFixed(5))],
  };
}
