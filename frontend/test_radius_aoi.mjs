import assert from 'node:assert';
import { createCircularPolygon } from './src/utils/geometry.js';

console.log('Running Radius AOI Frontend Unit Tests...');

// Test 1: Circle generation structure
const lat = 18.5204;
const lng = 73.8567;
const geom2km = createCircularPolygon(lat, lng, 2.0);

assert.strictEqual(geom2km.type, 'Polygon', 'Geometry must be of type Polygon');
assert.strictEqual(geom2km.coordinates.length, 1, 'Must have 1 outer ring');
const ring2km = geom2km.coordinates[0];
assert.strictEqual(ring2km.length, 65, 'Must contain 64 segments + 1 closing vertex (65 total coords)');

// Test 2: Ring closure
assert.deepStrictEqual(ring2km[0], ring2km[ring2km.length - 1], 'Outer ring must be explicitly closed');

// Test 3: Metadata & properties
assert.strictEqual(geom2km.radius_km, 2.0, 'radius_km must be 2.0');
assert.strictEqual(geom2km.radius_meters, 2000.0, 'radius_meters must be 2000');
assert.deepStrictEqual(geom2km.center, [Number(lng.toFixed(5)), Number(lat.toFixed(5))], 'center must match clicked coordinates');

// Test 4: Coordinate bounds
for (const [pLng, pLat] of ring2km) {
  assert(pLng >= -180 && pLng <= 180, `Longitude ${pLng} must be between -180 and 180`);
  assert(pLat >= -90 && pLat <= 90, `Latitude ${pLat} must be between -90 and 90`);
}

// Test 5: Radius scaling
const geom5km = createCircularPolygon(lat, lng, 5.0);
const ring5km = geom5km.coordinates[0];
const span2km = Math.max(...ring2km.map(p => p[0])) - Math.min(...ring2km.map(p => p[0]));
const span5km = Math.max(...ring5km.map(p => p[0])) - Math.min(...ring5km.map(p => p[0]));
const ratio = span2km / span5km;
assert(Math.abs(ratio - 0.4) < 0.01, `Span ratio ${ratio} must be approximately 0.4 (2km/5km)`);

// Test 6: Shoelace area estimation
function shoelaceArea(latLngs) {
  const meanLat = latLngs.reduce((acc, p) => acc + p[0], 0) / latLngs.length;
  const latRad = (meanLat * Math.PI) / 180;
  const kx = 111.32 * Math.cos(latRad);
  const ky = 110.57;
  let areaSum = 0;
  const n = latLngs.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x1 = latLngs[i][1] * kx;
    const y1 = latLngs[i][0] * ky;
    const x2 = latLngs[j][1] * kx;
    const y2 = latLngs[j][0] * ky;
    areaSum += x1 * y2 - x2 * y1;
  }
  return Math.abs(Math.round((areaSum / 2.0) * 100) / 100);
}

const latLngs2km = ring2km.map(([pLng, pLat]) => [pLat, pLng]);
const area2km = shoelaceArea(latLngs2km);
console.log(`Computed 2 km circular area: ${area2km} km² (Theoretical: ${(Math.PI * 4).toFixed(2)} km²)`);
assert(Math.abs(area2km - 12.57) < 0.2, `2 km circle area ${area2km} must be close to 12.57 km²`);

console.log('✓ All Radius AOI Frontend Unit Tests PASSED successfully!');
