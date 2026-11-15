# EcoRoute Fleet — Carbon Emission & Telemetry Web Platform

EcoRoute Fleet is a full-stack fleet carbon emission ($\text{CO}_2$) monitoring, telemetry audit, and emissions-aware multi-stop route planning platform built with React, TypeScript, Tailwind CSS, Express, and Leaflet.

## Default Manager Access

- **Manager Name:** Laiba Asghar
- **Email:** `laiba.asghar@ecoroute.com`
- **Password:** `demo1234` (override via `MANAGER_DEMO_PASSWORD`)

> A scoped driver credential (`driver.pk094@ecoroute.com` / `driver1234`) is also seeded for testing mobile app API integration (`TRUCK_PK_094` only).

## Key Architecture & Security Features

1. **Authentication & RBAC (`src/server/auth.ts`)**:
   - Scrypt salted password verification and HMAC-SHA256 stateless JWT Bearer tokens.
   - Strict `manager` and `driver` role enforcement; unauthenticated requests receive `401` and unauthorised truck/admin access receives `403`.
   - Demo tamper/reset endpoints (`/api/integrity/tamper`, `/api/seed/reset`) are disabled in production unless `ALLOW_DEMO_TOOLS=true`.
   - Explicit CORS allowlist registered prior to all API routes.

2. **Deduplicated, Validated Telemetry & SHA-256 Hash Chains (`src/server/api.ts`, `src/server/hashchain.ts`)**:
   - Idempotent ingestion via unique `eventId` (or `Idempotency-Key` header) prevents duplicate $\text{CO}_2$ and distance counting.
   - Strict validation on GPS (`lat` in `[-90, 90]`, `lon` in `[-180, 180]`, finite numbers, `0` supported), timestamps, OBD metrics, and separation of `distanceDeltaKm` vs monotonic `odometerKm` (ambiguous `distanceKm` rejected).
   - Every accepted packet appends to an ordered per-truck SHA-256 hash chain and updates an HMAC-SHA256 signed `ChainAnchor`.
   - Includes `POST /api/telemetry/mqtt-bridge` for EMQX / HiveMQ Cloud HTTP webhooks.

3. **Emissions-Aware Road Network Genetic Algorithm (`src/server/ga.ts`)**:
   - Uses Dijkstra pathfinding over a verified 10-city Pakistan highway/motorway network graph (explicit error on unsupported cities).
   - Deterministic seeded 40-generation Genetic Algorithm with Tournament Selection, Order Crossover (OX), Elitism, and swap mutation.
   - Accounts for cargo mass (`+18%` per 10 t), terrain gradient, congestion multipliers, and junction idling fuel burn, and returns baseline comparisons (Input Order, Shortest Path, Nearest Neighbour, Exact Permutation Optimum).

4. **Persistence, Caching & Offline Outbox (`src/server/db.ts`, `src/utils/offlineStore.ts`)**:
   - Server state persists atomically to disk (`data/ecoroute-db.json` locally, `/tmp/ecoroute-db.json` on Vercel) with optional Upstash/Vercel KV REST sync and manager backup/restore (`/api/admin/backup`, `/api/admin/restore`).
   - Client API responses are cached locally for resilience, and failed writes queue in IndexedDB with exponential backoff retry until acknowledged by the server.

## Commands

```bash
npm install
npm run lint      # TypeScript typecheck (tsc --noEmit)
npm test          # Automated backend & GA verification suite
npm run build     # Production Vite frontend build
npm run dev       # Development server on port 3000
npm start         # Production server (NODE_ENV=production)
npm run clean     # Cross-platform build artifact cleanup
```

## Vercel Deployment

The repository includes `vercel.json` and serverless entry `/api/index.ts` routing `/api/*` to the Express backend and serving the Vite SPA from `dist/`.
Set `AUTH_SECRET`, `ECOROUTE_ANCHOR_SECRET`, and optionally `KV_REST_API_URL` / `KV_REST_API_TOKEN` in your Vercel project environment variables.

See `docs/contract.json` for the complete REST, fuel log, telemetry, credit, and hash-chain contract.
