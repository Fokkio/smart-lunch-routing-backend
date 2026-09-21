# Routing Pipeline (backend)

How a `POST /api/route-plans/generate` becomes a persisted RoutePlan.
Boundaries: controllers = HTTP, services = workflow, domain = computation,
infrastructure = OSRM/DB, Angular = presentation.

## OSRM provider (`src/infrastructure/routing/`)

- `OsrmClient` — thin Route/Table HTTP client. Coordinates go out as
  `{longitude},{latitude}`; `AbortController` enforces `OSRM_TIMEOUT_MS`.
  Every failure is a coded `RoutingError`
  (`TIMEOUT | HTTP_ERROR | NO_ROUTE | MALFORMED_RESPONSE`); `undefined`
  never leaks into math.
- `OsrmDistanceCalculator` — `DistanceCalculator` over the Route API.
  OSRM metres/seconds become km (`/1000`) and minutes (`/60`), unrounded.
- `OsrmTableProvider` — ONE Table call (`annotations=distance,duration`)
  for the full N×N matrix (never N² requests). Asymmetry preserved; a
  `null` cell is `NO_ROUTE`.
- `OsrmRouteProvider` — ordered Shop→stops geometry as GeoJSON LineString
  (`overview=full`, `geometries=geojson`, `steps=false`).
- Config lives only in `src/config/env.ts` (`OSRM_BASE_URL`,
  default = public OSRM demo server for development, not production;
  `OSRM_TIMEOUT_MS`, default 8000).

## Fallback (`fallback-routing.ts`)

OSRM → Haversine when the routing service fails. Fallbacks are always
identifiable: `source: 'HAVERSINE'`, `approximate: true`, `fallbackReason`
(`ROUTING_SERVICE_UNAVAILABLE | NO_ROUTE`) — never disguised as road data.
Fallback duration = `(distanceKm / riderSpeedKmh) × 60` with the speed
injected from shop_settings (default 30 km/h), never hardcoded.
Haversine = approximate straight-line fallback; OSRM = preferred source.

## Travel matrix

`TravelMatrix { pointIds, distancesKm, durationsMinutes, source,
approximate, fallbackReason? }` — row/column `i` is `pointIds[i]`
(input order, shop first). The legacy `DistanceMatrix` (distances only)
is unchanged, so old tests still pass.

## Clustering (`domain/delivery/order-clusterer.ts`)

Constraint: **≤ 3 orders per rider; box counts never affect grouping.**
`minimumRiderCount = ceil(N / maxOrdersPerRider)` (1→1, 4→2, 20→7,
21→7, 22→8, 30→10). Heuristic: farthest-point seeds from the shop, then
nearest-seed assignment with free slots; deterministic (id tie-breaks).
`seedOffset` rotates seeding for deterministic "recalculate" alternatives.

## Permutation (`domain/routing/route-sequencer.ts`)

1–3 stops ⇒ all permutations evaluated (1/2/6). Objective: minimum total
duration from the shop; ties → shorter distance → lexicographic order ids.
Nearest-neighbour is NOT used for final sequencing.

## Deadline (`domain/delivery/deadline-rule.ts`)

`finish = start + routeDuration ≤ deadline`, second precision, from
shop_settings (11:30 → 12:30). Exactly-at-deadline is valid; one second
later is not. Any late job ⇒ whole plan infeasible (never saved as valid).

## Cost (`domain/delivery/cost-calculator.ts`)

From shop_settings (65 / 40 / 15 / 4): revenue = boxes×65, food = boxes×40,
per-rider delivery = 15 + 4×routeKm (distance ONLY — the old `15 + 2×km×boxes`
formula is retired), profit = revenue − food − delivery.

## RoutePlan pipeline (`services/route-planning.service.ts`)

Pending orders + customers + settings → points → TravelMatrix (OSRM or
fallback) → min riders → cluster → sequence → deadline gate (more riders
on failure, up to N) → per-job geometry (null when unavailable) →
assemble → validate (all orders exactly once, 1–3/job, unique sequences,
on time) → persist (`route_plans` + `delivery_jobs` + `delivery_job_orders`,
migration 002 adds `routing_source`/`approximate`/`route_geometry`) →
return. Each generate creates a NEW plan; `select` marks SELECTED and moves
its orders PENDING → PLANNED transactionally. Select serializes concurrent
callers per date (`FOR UPDATE` on the target row and the date's plan set);
a second SELECTED plan for the same date is refused with HTTP 409
(`PlanConflictError`) — locking verified by inspection only, not live DB.
Migration runner tolerates already-applied `ADD COLUMN`s (`ER_DUP_FIELDNAME`).

## Verification

```powershell
cd backend
npm run typecheck
npm test     # offline; OSRM is mocked, never called live
npm run build
```
