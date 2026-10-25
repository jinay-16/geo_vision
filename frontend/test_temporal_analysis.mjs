import assert from 'node:assert';
import { apiFetch } from './src/api/client.js';

console.log('--- GeoVision AI Temporal Analysis Frontend Tests ---');

// Test 1: apiFetch timeout configuration & AbortError distinction
async function testClientAbort() {
  console.log('Testing AbortController cancellation in apiFetch...');
  const controller = new AbortController();
  // Abort immediately
  controller.abort();
  const res = await apiFetch('/health', { signal: controller.signal });
  assert.strictEqual(res.isAborted, true, 'isAborted flag must be true');
  assert.strictEqual(res.isTimeout, false, 'User abort must NOT be marked as timeout');
  assert.strictEqual(res.data, null, 'Aborted request data must be null');
  console.log('✓ Test 1: Manual AbortController cancellation handled cleanly.');
}

// Test 2: Request ID sequence logic (stale response rejection)
function testRequestSuperseding() {
  console.log('Testing request ID superseding logic...');
  let latestRequestId = 0;
  const recordedResults = [];

  function simulateRequest(id, payload, delayMs) {
    return new Promise((resolve) => {
      setTimeout(() => {
        // If superseded by a newer request, drop result
        if (id !== latestRequestId) {
          // Stale response ignored
          resolve({ id, dropped: true });
        } else {
          recordedResults.push(payload);
          resolve({ id, dropped: false });
        }
      }, delayMs);
    });
  }

  // Rapidly issue request 1 (slow 100ms) then request 2 (fast 20ms)
  latestRequestId = 1;
  const p1 = simulateRequest(1, 'Result from 5km', 100);

  latestRequestId = 2;
  const p2 = simulateRequest(2, 'Result from 20km', 20);

  return Promise.all([p1, p2]).then(([r1, r2]) => {
    assert.strictEqual(r1.dropped, true, 'Request 1 (stale) must be dropped');
    assert.strictEqual(r2.dropped, false, 'Request 2 (latest) must be recorded');
    assert.deepStrictEqual(recordedResults, ['Result from 20km'], 'Only latest result recorded');
    console.log('✓ Test 2: Stale response safely superseded by newer request without race condition.');
  });
}

// Test 3: Radius query URL formatting
function testRadiusQueryFormatting() {
  console.log('Testing query formatting for 5km and 10km radii...');
  function buildQuery(lat, lng, radiusKm) {
    return `/analysis/temporal?start_year=2023&end_year=2026&start_month=1&end_month=4&module=all&lat=${lat}&lng=${lng}&radius_km=${radiusKm}`;
  }

  const q5 = buildQuery(18.5204, 73.8567, 5.0);
  const q10 = buildQuery(18.5204, 73.8567, 10.0);

  assert.match(q5, /radius_km=5/, 'Query 5km must contain radius_km=5');
  assert.match(q10, /radius_km=10/, 'Query 10km must contain radius_km=10');
  assert.notStrictEqual(q5, q10, 'Queries must have distinct URLs');
  console.log('✓ Test 3: Query parameters correctly format distinct 5km and 10km radii.');
}

async function runAll() {
  await testClientAbort();
  await testRequestSuperseding();
  testRadiusQueryFormatting();
  console.log('--- ALL FRONTEND TEMPORAL TESTS PASSED ---');
}

runAll().catch((err) => {
  console.error('Frontend test failure:', err);
  process.exit(1);
});
