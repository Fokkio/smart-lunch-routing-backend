/**
 * Live OSRM verification (opt-in, NEVER part of `npm test`).
 *
 * Usage: `npm run verify:live-osrm`
 *
 * Uses the application's real infrastructure classes against a REAL
 * OSRM service (OSRM_BASE_URL, or the public demo-server development
 * default owned by src/config/env.ts — a dev convenience, NOT production
 * infrastructure). Makes exactly 2 live calls (1 Table + 1 Route).
 *
 * Coordinates come from the repository (the database is not reachable in
 * this environment): shop = route-planner DEFAULT_SHOP, cross-checked
 * against frontend SHOP (src/app/core/models.ts) and the seed row
 * (database/seeds/001_seed.sql). Customers = seed + demo-data points.
 */
import { config } from '../src/config/env';
import type { Coordinate } from '../src/domain/routing/coordinate';
import { HaversineDistanceCalculator } from '../src/domain/routing/haversine-distance-calculator';
import { DEFAULT_SHOP } from '../src/domain/routing/route-planner';
import { FallbackDistanceCalculator, fetchTravelMatrixWithFallback } from '../src/infrastructure/routing/fallback-routing';
import { OsrmClient } from '../src/infrastructure/routing/osrm.client';
import { OsrmDistanceCalculator } from '../src/infrastructure/routing/osrm-distance-calculator';
import { OsrmTableProvider } from '../src/infrastructure/routing/osrm-matrix.provider';
import { OsrmRouteProvider } from '../src/infrastructure/routing/osrm-route.provider';

const SHOP: Coordinate = { latitude: 16.24631, longitude: 103.25286 };
// Seed + demo-data customer coordinates (repo sources, see header).
const CUSTOMERS: Array<{ id: string; coordinate: Coordinate }> = [
  { id: 'SEED-1', coordinate: { latitude: 16.2469, longitude: 103.2531 } },
  { id: 'SEED-2', coordinate: { latitude: 16.2457, longitude: 103.2542 } },
  { id: 'SEED-3', coordinate: { latitude: 16.2475, longitude: 103.2518 } },
  { id: 'DEMO-c-01', coordinate: { latitude: 16.25141, longitude: 103.24958 } },
  { id: 'DEMO-c-03', coordinate: { latitude: 16.24334, longitude: 103.26061 } },
];

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  console.log(`OSRM base URL: ${config.osrm.baseUrl} (timeout ${config.osrm.timeoutMs}ms)`);
  // Shop coordinate verified against the repository (not invented here).
  check(
    'shop coordinate matches repo (16.24631, 103.25286)',
    DEFAULT_SHOP.lat === 16.24631 && DEFAULT_SHOP.lng === 103.25286,
  );

  const client = new OsrmClient(config.osrm.baseUrl, 30000);
  const table = new OsrmTableProvider(client);
  const points = [{ id: 'SHOP', coordinate: SHOP }, ...CUSTOMERS];
  const matrix = await table.fetchMatrix(points);

  check('table dimensions 6x6', matrix.distancesKm.length === 6 && matrix.distancesKm.every((r) => r.length === 6));
  check('point ordering preserved', matrix.pointIds.join(',') === points.map((p) => p.id).join(','));
  let sane = true;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const km = matrix.distancesKm[i]![j]!;
      const min = matrix.durationsMinutes[i]![j]!;
      if (i === j) { if (km !== 0 || min !== 0) sane = false; continue; }
      if (!(km > 0) || !(min > 0) || !Number.isFinite(km) || !Number.isFinite(min)) sane = false;
    }
  }
  check('all off-diagonal distances/durations positive and finite', sane);
  check('source ROAD, approximate false', matrix.source === 'ROAD' && matrix.approximate === false);

  // Road vs Haversine comparison (sanity evidence, no strict assertions on roads).
  const haversine = new HaversineDistanceCalculator();
  console.log('\nFrom | To | Haversine km | Road km | Road min');
  let suspicious = 0;
  for (const customer of CUSTOMERS) {
    const h = (await haversine.calculate(SHOP, customer.coordinate)).distanceKm;
    const idx = points.findIndex((p) => p.id === customer.id);
    const roadKm = matrix.distancesKm[0]![idx]!;
    const roadMin = matrix.durationsMinutes[0]![idx]!;
    console.log(`SHOP | ${customer.id} | ${h.toFixed(3)} | ${roadKm.toFixed(3)} | ${roadMin.toFixed(2)}`);
    if (!(roadKm > 0) || (h > 0 && roadKm / h > 10)) suspicious++;
  }
  check('no suspicious road/Haversine ratios', suspicious === 0);

  // Live route geometry: Shop → SEED-1 → SEED-2.
  const route = await new OsrmRouteProvider(client).fetchRoute([
    SHOP, CUSTOMERS[0]!.coordinate, CUSTOMERS[1]!.coordinate,
  ]);
  check('geometry is LineString', route.geometry?.type === 'LineString');
  check('geometry has >1 coordinate', (route.geometry?.coordinates.length ?? 0) > 1);
  const first = route.geometry!.coordinates[0]!;
  check('GeoJSON order [longitude, latitude]', first[0] > 100 && first[1] < 30, `[${first[0]}, ${first[1]}]`);
  check('route distance/duration positive', route.distanceKm > 0 && route.durationMinutes > 0);

  // Fallback: unreachable OSRM must activate identifiable Haversine fallback.
  const dead = new OsrmClient('http://127.0.0.1:9', 3000);
  const fbMatrix = await fetchTravelMatrixWithFallback(
    [{ id: 'SHOP', coordinate: SHOP }, { id: 'A', coordinate: CUSTOMERS[0]!.coordinate }],
    { tableProvider: new OsrmTableProvider(dead), settings: { riderSpeedKmh: 30 } },
  );
  check(
    'matrix fallback identifiable',
    fbMatrix.source === 'HAVERSINE' && fbMatrix.approximate === true && !!fbMatrix.fallbackReason,
    `${fbMatrix.source}/${fbMatrix.fallbackReason}`,
  );
  const fbSingle = await new FallbackDistanceCalculator(
    new OsrmDistanceCalculator(dead),
    { riderSpeedKmh: 30 },
  ).calculate(SHOP, CUSTOMERS[0]!.coordinate);
  check(
    'single fallback identifiable',
    fbSingle.source === 'HAVERSINE' && fbSingle.approximate === true && !!fbSingle.fallbackReason,
    `${fbSingle.source}/${fbSingle.fallbackReason}`,
  );

  console.log(failures === 0 ? '\nLIVE OSRM VERIFICATION: ALL PASS' : `\nLIVE OSRM VERIFICATION: ${failures} FAILURE(S)`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(`FAIL  live verification crashed: ${(error as Error).message}`); process.exitCode = 1; });
