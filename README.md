# Backend — Smart Lunch Routing (first pass)

Express + TypeScript + MySQL (`mysql2/promise`) skeleton using
**MVC + Service Layer + Domain Layer**.

สมาชิกทีมที่เพิ่งเริ่มใช้ Git ดูขั้นตอนได้จาก [คู่มือ Git และ GitHub ภาษาไทย](GIT_GUIDE_TH.md)

## Architecture

```
Client (Angular)
  ↓
Routes        HTTP endpoint definitions (`src/routes/`)
  ↓
Controllers   HTTP request/response handling (`src/controllers/`)
  ↓
Services      application/system workflows (`src/services/`)
  ↓
Domain        business rules & algorithms (`src/domain/`)
  ↓           (only when business rules are needed; plain CRUD skips Domain)
Models        database access / persistence (`src/models/`)
  ↓
MySQL         connection config (`src/database/`)
  ↓
Aiven MySQL   credentials via environment variables, never in source
```

- **MVC** organizes HTTP/data flow (routes → controllers → models).
- **Service layer** holds application workflows (controller → service → model).
- **Domain layer** holds business rules and routing algorithms
  (`domain/delivery/`, `domain/routing/`).
- **MySQL** is hosted on Aiven; all connection values come from env vars.

Example CRUD flow (no Domain needed):

```
POST /api/customers → CustomerController → CustomerService → CustomerModel → MySQL
```

Example planning flow (Domain involved):

```
POST /api/route-plans/generate → RoutePlanController → RoutePlanningService
  → OsrmTableProvider (or Haversine fallback) → cluster → sequence
  → deadline gate → cost → RoutePlanModel → MySQL
```

Legacy demo flow (kept, payload-based, no DB):

```
POST /api/deliveries/plan → DeliveryController → DeliveryService → RoutePlanner
```

## Structure

`backend/src/` mirrors the requested `src/` layout, placed under `backend/`
so it does not collide with the existing Angular `src/` app:

```
backend/src/
├── controllers/   customer/order/rider/delivery.controller.ts
├── models/        customer/order/rider/delivery.model.ts
├── routes/        customer/order/rider/delivery.routes.ts
├── services/     customer/order/rider/delivery.service.ts
├── domain/
│   ├── delivery/  capacity-rule.ts (orders only), delivery-rule.ts,
│   │              order-clusterer.ts, deadline-rule.ts, cost-calculator.ts,
│   │              route-plan-assembler.ts
│   └── routing/   coordinate.ts, distance.*.ts, haversine-*.ts,
│                  route-sequencer.ts, route-plan.types.ts,
│                  route-planner.ts (legacy demo)
├── infrastructure/routing/  osrm.client.ts, osrm-*.provider.ts,
│                            fallback-routing.ts, routing.errors.ts
├── database/      mysql.connection.ts
├── middleware/    error-handler.ts
├── config/        env.ts
├── app.ts
└── server.ts
```

## Run locally

Frontend (repo root, unchanged):

```powershell
npm.cmd install
npm.cmd start
```

Backend (first pass — works without a database; DB routes return 503 until env is set):

```powershell
cd backend
npm install
copy .env.example .env
npm run dev
```

Other backend commands:

```powershell
npm test
npm run typecheck
npm run build
npm run start
```

Live OSRM verification (opt-in, real network, never part of `npm test`):

```powershell
npm run verify:live-osrm
```

Health check: `GET http://localhost:3000/api/health`

## Endpoints

- `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id`
- `GET/POST /api/orders` (`?status=&date=` supported), `GET/PUT/DELETE /api/orders/:id`
- `GET/POST /api/riders` (`?available=true` supported), `GET/PUT /api/riders/:id`
- `POST /api/route-plans/generate` `{planDate}` → 201 RoutePlan (new plan each call)
- `POST /api/route-plans/recalculate` `{planDate}` → 201 deterministic alternative plan
- `GET /api/route-plans?date=` → plan summaries
- `GET /api/route-plans/:id` → full plan with jobs, stops, geometry
- `POST /api/route-plans/:id/select` → SELECTED + orders move PENDING → PLANNED
- Legacy demo (kept): `POST /api/deliveries/plan`, `POST /api/deliveries/plan-from-database`

Without DB credentials, DB-backed routes answer 503; bad `planDate` answers
400; infeasible/no-order generations answer 422. Docs: `docs/distance-domain.md`,
`docs/routing-pipeline.md`.

## Authoritative business rules

- Order: 1–3 boxes. Rider: at most 3 ORDERS (no box-capacity rule).
- Start 11:30, deadline 12:30, fallback speed 30 km/h (all from `shop_settings`).
- Revenue = boxes × 65, food = boxes × 40, rider delivery = 15 + 4 × routeKm,
  profit = revenue − food − delivery.
- Haversine = approximate straight-line fallback; OSRM = preferred road source
  (Leaflet + OpenStreetMap render the map; no Google APIs).

## Reused logic

- Haversine distance ported from `src/app/core/delivery.service.ts`
  (now `R = 6371.0088 km`, validated coordinates).
- Grouping limit of 3 orders/rider preserved as `MAX_ORDERS_PER_RIDER`
  (orders only — no box-capacity rule exists).
- Cost/deadline values sourced from `shop_settings`
  (65/40 THB, 15 + 4×km, 11:30→12:30, 30 km/h).

## Open TODOs

Aiven credentials + live verification, live OSRM verification (unit tests
mock HTTP), richer alternative-plan strategies, rider job page. See code
`TODO` comments and `docs/routing-pipeline.md`.
