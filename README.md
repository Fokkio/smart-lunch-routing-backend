# Backend — Smart Lunch Routing

Express + TypeScript + MySQL (`mysql2/promise`) API using
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

The backend follows the controller/data-access separation taught in the
NodeJS Web API (TS) vault, with service and domain layers retained for
non-trivial business rules:

```
src/
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

Backend (the health endpoint works without a database; DB routes return 503 until env is set):

```powershell
cd BackEnd\smart-lunch-routing-backend
npm.cmd install
copy .env.example .env
npm.cmd run dev
```

Other backend commands:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

Live OSRM verification (opt-in, real network, never part of `npm test`):

```powershell
npm.cmd run verify:live-osrm
```

Health check: `GET http://localhost:3000/api/health`

## Endpoints

- `GET/POST /api/customers`, `GET/PUT/DELETE /api/customers/:id`
- `GET /api/customers?search=สมชาย` searches any part of the stored name
- `GET /api/customers/nearby?lat=&lng=&radiusKm=` (`radiusKm` defaults to 1)
- `GET/POST /api/orders` (`?status=&date=&customerId=` supported), `GET/PUT/DELETE /api/orders/:id`
- `GET /api/orders/nearby?lat=&lng=&radiusKm=` (`radiusKm` defaults to 2)
- `POST /api/orders/simulate` with optional `{ "count": 25, "orderDate": "YYYY-MM-DD" }`
- `DELETE /api/orders/simulated` deletes only rows created by the simulation endpoint
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

## Database setup

Copy `.env.example` to `.env`, fill in the database values, then apply the
migrations in order. Migration 003 marks generated orders so the clear
endpoint cannot delete real orders.

```powershell
npm.cmd run db:migrate
npm.cmd run db:migrate:routing
npm.cmd run db:migrate:simulation
npm.cmd run db:seed
```

`CORS_ORIGIN` accepts a comma-separated allowlist. If the database provider
requires a CA certificate, use `DB_SSL_CA` for Vercel (PEM text, optionally
with `\\n`) or `DB_SSL_CA_PATH` for a local certificate file.

## Deploy to Vercel

No custom `vercel.json` is needed. `src/app.ts` exports the Express app as the
default export for Vercel, while `src/server.ts` remains the local port
listener.

When importing the repository in Vercel:

1. Set **Root Directory** to `BackEnd/smart-lunch-routing-backend`.
2. Leave Framework Preset, Build Command, and Output Directory on automatic
   detection. Node.js 20+ is declared in `package.json`.
3. Add all `DB_*` values and `CORS_ORIGIN` to Production and Preview as needed.
4. Apply migrations from a trusted local/admin environment before sending
   traffic to the deployment. Do not run migrations inside an API request.
5. Verify `GET /api/health`, then a DB-backed endpoint such as
   `GET /api/customers`.

For CLI deployment, run from this backend directory after signing in:

```powershell
npx.cmd vercel
npx.cmd vercel --prod
```

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
