# Backend — Smart Lunch Routing

Express + TypeScript + TiDB Cloud MySQL-compatible API using
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
MySQL pool    connection config (`src/database/`)
  ↓
TiDB Cloud    credentials via environment variables, never in source
```

- **MVC** organizes HTTP/data flow (routes → controllers → models).
- **Service layer** holds application workflows (controller → service → model).
- **Domain layer** holds business rules and routing algorithms
  (`domain/delivery/`, `domain/routing/`).
- **TiDB Cloud** is the runtime MySQL-compatible database; all connection values come from environment variables.

Example CRUD flow (no Domain needed):

```
POST /api/customers → CustomerController → CustomerService → CustomerModel → TiDB
```

Example planning flow (Domain involved):

```
POST /api/route-plans/generate → RoutePlanController → RoutePlanningService
  → OsrmTableProvider (or Haversine fallback) → cluster → sequence
  → deadline gate → cost → RoutePlanModel → TiDB
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
- `POST /api/auth/login` creates an owner or rider session; `GET /api/auth/me` checks it; `POST /api/auth/logout` revokes it.
- `PUT /api/auth/password` lets a signed-in rider change their own password.
- `GET /api/my-jobs?date=YYYY-MM-DD` returns only the signed-in rider's selected jobs.
- `POST /api/my-jobs/:jobId/stops/:orderId/deliver` checks rider ownership inside the delivery transaction.
- `PUT /api/riders/:id/password` lets an owner set or reset a rider password.
- `PUT /api/riders/:id/account` lets an owner set a unique rider username and optional new password; it revokes existing sessions.

Without DB credentials, DB-backed routes answer 503; bad `planDate` answers
400; infeasible/no-order generations answer 422. Docs: `docs/distance-domain.md`,
`docs/routing-pipeline.md`.

## Configuration

Copy `.env.example` to `.env`, then fill in local values. Do not commit `.env`.

Required TiDB Cloud runtime variables:

```env
DB_HOST=
DB_PORT=4000
DB_USER=
DB_PASSWORD=
DB_NAME=smart_lunch_route
DB_SSL=true
DB_SSL_CA_PATH=./certs/isrgrootx1.pem
```

Use the application database user for runtime. Do not use TiDB root/admin as
`DB_USER` in `.env`. The CA file should be the TiDB Cloud CA certificate; see
[certs/README.md](certs/README.md).

## Database setup

Copy `.env.example` to `.env`, fill in the database values, then apply the
migrations in order. Migration 003 marks generated orders so the clear
endpoint cannot delete real orders. `database/schema.sql` is a reference
schema for a fresh database; do not run it together with migrations 001–003,
because it already contains `orders.is_simulated`.

```powershell
npm.cmd run db:migrate
npm.cmd run db:migrate:routing
npm.cmd run db:migrate:simulation
npm.cmd run db:migrate:cost-formula
npx.cmd tsx scripts/run-sql.ts database/migrations/005_order_route_geometry.sql
npm.cmd run db:init-settings
```

Apply the account migration once before deploying the login UI. It checks existing columns, so it also works on databases that already have `admin_users` and `riders.password_hash`:

```powershell
npm.cmd run db:migrate:accounts
npm.cmd run db:create-owner
```

`db:create-owner` prompts for the username and password without echoing either value. It refuses to overwrite an existing owner. Passwords are bcrypt hashes at cost 10; plaintext passwords are not written to the repository. The account migration gives existing riders a unique `rider_<id>` username. The owner can change it from the rider management page and set a rider's initial password there; riders can change their own password after login. Numeric rider IDs remain accepted during the UI rollout. Account or password changes revoke existing rider sessions.

All customer, order, route-plan, rider-management and settings endpoints require an owner session. Rider job endpoints require a rider session. Sessions expire after 12 hours. Deploy backend and frontend together after running the migration; an old frontend cannot call the newly protected API.

`npm.cmd run db:prune-drafts` previews generated/rejected plans older than 30 days. `npm.cmd run db:prune-drafts -- --apply` deletes only those drafts. Selected plans are excluded, and plans with completed deliveries cannot be deleted through the API. The old `deliveries` table is not used by runtime code; the reference schema no longer creates it. Remove an existing empty table only with a database account that has `DROP` privilege.

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
5. Verify `GET /api/health`, then log in and call a DB-backed endpoint with the returned bearer token.

For CLI deployment, run from this backend directory after signing in:

```powershell
npx.cmd vercel
npx.cmd vercel --prod
```

## Authoritative business rules

- Order: 1–3 boxes. Rider: at most 3 ORDERS (no box-capacity rule).
- Start 11:30, deadline 12:30, fallback speed 30 km/h (all from `shop_settings`).
- Revenue = boxes × 65, food = boxes × 40, rider delivery per job
  = 15 + 2 × routeKm × boxes in job, profit = revenue − food − delivery.
- Haversine = approximate straight-line fallback; OSRM = preferred road source
  (Leaflet + OpenStreetMap render the map; no Google APIs).

## Reused logic

- Haversine distance ported from `src/app/core/delivery.service.ts`
  (now `R = 6371.0088 km`, validated coordinates).
- Grouping limit of 3 orders/rider preserved as `MAX_ORDERS_PER_RIDER`
  (orders only — no box-capacity rule exists).
- Cost/deadline values sourced from `shop_settings`
  (65/40 THB, 15 + 2×km×boxes, 11:30→12:30, 30 km/h).

## Open TODOs

Legacy migration notes, live OSRM verification (unit tests mock HTTP), richer alternative-plan strategies. See code
`TODO` comments and `docs/routing-pipeline.md`.


