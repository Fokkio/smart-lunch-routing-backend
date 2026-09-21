# Distance Domain (backend)

Pure domain layer for distance processing. No HTTP, no database, no network —
unit tests run fully offline. Future `RoutePlanner` work will depend on the
`DistanceCalculator` interface here, never on a concrete provider.

```
RoutePlanner ──▶ DistanceCalculator (interface, async)
                       ▲
                       │
              HaversineDistanceCalculator (domain, this pass)
              OSRM provider (infrastructure, future — NOT here)
```

## 1. Coordinate rules

`Coordinate = { latitude, longitude }` (WGS84 degrees).

- latitude: `-90 … 90`, longitude: `-180 … 180` (boundaries accepted).
- `NaN` / `Infinity` / `-Infinity` rejected; invalid values are never
  clamped or coerced.
- `validateCoordinate()` throws `InvalidCoordinateError` before any
  calculation, so bad input can never surface as a meaningless `NaN km`.

## 2. Haversine purpose

`HaversineDistanceCalculator` is the deterministic baseline: unit testing,
fallback calculation, sanity checking, lightweight geographic comparison,
possible future pre-clustering. Earth mean radius `R = 6371.0088 km`
(`EARTH_MEAN_RADIUS_KM`, locked by a unit test).

## 3. Haversine limitations

It returns **straight-line great-circle distance only** — not road-driving
distance, not driving duration (`durationMinutes` stays `undefined` with
`source: 'HAVERSINE'`), not road geometry. Never label it "actual route
distance".

## 4. Why OSRM later

Deliveries must finish by 12:30 after an 11:30 start at ≤30 km/h, so real
road distance/duration matters. The plan is Leaflet + OpenStreetMap for
display and OSRM (or similar) for road distance, duration, and geometry.
No Google Maps / Street View APIs are used.

## 5. Why the abstraction

`DistanceCalculator.calculate(from, to): Promise<DistanceResult>` is
async-compatible because OSRM will need HTTP. The planner will call this
interface without caring whether Haversine, OSRM, or another provider sits
behind it. External providers will live in infrastructure, outside this
pure domain layer.

## 6. Why matrices may be asymmetric

Haversine is symmetric (`A→B = B→A`, zero diagonal), but road routing is
not (one-way roads). `DistanceMatrixBuilder` therefore queries every
ordered pair and never mirrors values; `DistanceMatrix` carries `pointIds`
(input order) + `distancesKm[i][j]` so rows/columns are self-describing.

## 7. How to run tests

```powershell
cd backend
npm test        # vitest run (offline, deterministic)
npm run typecheck
npm run build
```

## 8. Known-answer exam cases

Hard-coded in `src/domain/routing/__tests__/distance-known-answers.fixture.ts`
(R = 6371.0088 km, tolerance 1 mm):

| Case | From | To | Expected km |
|------|------|----|-------------|
| Same point | 16.24631, 103.25286 | 16.24631, 103.25286 | 0 |
| N/S 0.001° | 16.24631, 103.25286 | 16.24731, 103.25286 | 0.1111950802 |
| E/W 0.001° | 16.24631, 103.25286 | 16.24631, 103.25386 | 0.1067548243 |
| Shop-area | 16.24631, 103.25286 | 16.25000, 103.26000 | 0.8656425318 |
| Equator 1° lon | 0, 0 | 0, 1 | 111.1950802335 |
| 1° lat | 0, 0 | 1, 0 | 111.1950802335 |

Shop coordinate verified against the repo (`route-planner.ts`
`DEFAULT_SHOP`, frontend `SHOP` in `src/app/core/models.ts`).

## Remaining TODO (later passes — see `docs/routing-pipeline.md` for what is done)

~~OSRM provider · road distance/duration matrix · route geometry ·
routing-service fallback · clustering · ≤3 orders/rider grouping ·
1–3 stop permutation · deadline validation · cost calculation ·
RoutePlan generation~~ — all implemented; unit tests mock OSRM (no live
verification yet).

Still open: live OSRM verification · live Aiven verification · richer
alternative-plan strategies · rider job page.
