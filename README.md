# Load tests (k6)

Scenarios for validating QR Dines under expected peak load. Run against **staging**, never
production. Install k6: `brew install k6` (or https://k6.io/docs/get-started/installation/).

## Scenarios

| Script | Path | What it stresses |
|--------|------|------------------|
| `health.js` | `GET /api/health` | Stack baseline (event loop, proxy, TLS) — no auth/DB |
| `guest-read.js` | `GET /api/public/t/:token` + `/menu` | Dominant public read path (QR scan → menu) |
| `order-place.js` | `POST /api/public/t/:token/orders` | Write path (order insert) |

## Prerequisites

- A staging backend URL and a **real table QR token** (`tables.qr_token` for a seeded restaurant).
- For `order-place.js`, the restaurant's menu must have at least one item.

```bash
export BASE_URL="https://staging-api.qrdines.com/api"
export TABLE_TOKEN="<a real qr_token>"
```

## Run

```bash
k6 run loadtest/health.js
k6 run --env BASE_URL="$BASE_URL" --env TABLE_TOKEN="$TABLE_TOKEN" loadtest/guest-read.js
k6 run --env BASE_URL="$BASE_URL" --env TABLE_TOKEN="$TABLE_TOKEN" loadtest/order-place.js
```

## ⚠️ Rate limiting is per-IP

Throttling is keyed by client IP (global default 600/min; `POST /orders` is 10/min). From a
**single** k6 runner you will hit those limits and measure the rate limiter, not the app. For a
real load test either:

- run **distributed** (k6 Cloud, or several runners behind different egress IPs), or
- temporarily raise/disable throttling in the **staging** environment (never production).

## Reading results / pass criteria

Each script sets `thresholds`; k6 exits non-zero if they're breached.

- `http_req_duration p(95)` — read paths < 500 ms, writes < 800 ms.
- `http_req_failed rate` — < 1% (reads), < 2% (writes), excluding intentional 429s.
- Watch the **Supabase** dashboard during the run: DB CPU, connection count (PostgREST pool),
  and slow queries. If p95 climbs with connection saturation, size up the Supabase compute/pooler
  (see `docs/DEPLOYMENT.md` → Scaling & connection pooling). 23 covering indexes already exist in
  `apps/backend/supabase/performance-hardening.sql`; a slow query under load points at a gap there.
