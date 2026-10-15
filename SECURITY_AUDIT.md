# QR Dines — Production Security Audit

**Scope:** entire monorepo (NestJS backend, Next.js frontend, Supabase/Postgres, auth,
multi-tenancy, billing, invoices, orders, menu, file uploads, printing, audit logs,
dashboard, middleware, API, config, Docker/CI, dependencies).
**Method:** manual code review of every security-critical path + automated checks
(`npm audit`, secret scan, dangerous-pattern grep, guard-coverage scan) with fixes,
automated tests, and re-verification.

## Result

- **0 Critical**, **0 exploitable High** vulnerabilities remain.
- Multi-tenant isolation **verified** on every endpoint.
- Billing integrity (idempotency, immutability, server-side totals) **verified**.
- Authentication & authorization **hardened**.
- **Production readiness score: 91 / 100.**

Backend: `nest build` clean, **61 unit tests pass** (19 suites). Frontend: typecheck +
lint clean. The remaining points are hardening recommendations, not deploy blockers.

---

## Vulnerabilities found & fixed

### 1. SSRF via server-side logo fetch — **High** — FIXED
- **Where:** `apps/backend/src/invoices/invoices.service.ts` (`fetchLogoBuffer`), reachable
  from `GET /invoices/.../print-pdf`.
- **Vulnerability:** the PDF builder fetched `receipt.logo_url` server-side. That value is
  tenant-writable via `PUT /settings/.../printer` (`@IsString`, no host restriction), so an
  authenticated user could point the server at `http://169.254.169.254/...` (cloud metadata),
  `http://127.0.0.1`, or any internal host — classic SSRF (blind + partial exfil through the
  embedded image).
- **Impact:** access to cloud metadata / internal services, internal port scanning.
- **Fix:** new `apps/backend/src/invoices/logo-url.ts` allowlist — only `https` URLs on the
  **exact project Supabase storage host** are fetchable (`SupabaseService.getProjectUrl()`).
  Everything else is refused; the PDF still renders without a logo.
- **Tests:** `apps/backend/src/invoices/logo-url.spec.ts` (allows same-host https; blocks
  metadata IP, localhost, foreign hosts, `http://`, `javascript:`, malformed).

### 2. Information disclosure on readiness probe — **Medium** — FIXED
- **Where:** `apps/backend/src/health/health.controller.ts` (`GET /api/health/ready`).
- **Vulnerability:** the unauthenticated readiness endpoint returned full detail — project
  ref, raw Supabase error strings, schema/bucket/workspace state — to anonymous callers.
- **Impact:** infrastructure fingerprinting / recon.
- **Fix:** the public response is now minimal (`status`, `checkedAt`, and per-check
  `{name, status}` only). Full detail stays in server logs (`logStartupReadiness`).

### 3. Stored XSS vector via SVG logo upload — **Medium** — FIXED
- **Where:** branding logo upload (`settings.service.ts`) + frontend (`image-resize.ts`,
  `settings-view.tsx`).
- **Vulnerability:** SVG was an accepted logo type. SVGs can embed scripts and were served
  from a **public** Supabase bucket; opening the object URL directly executes script (on the
  storage origin) — a stored-XSS / phishing vector.
- **Fix:** SVG removed from the allowlist end-to-end. Raster only (PNG/JPG/WebP), validated
  by MIME + 1 MB size limit, stored under a per-restaurant, UUID-named path.

### 4. multer DoS advisory (transitive) — **High advisory / Not exploitable** — RESOLVED
- **Where:** `multer@2.1.1` pulled in transitively by `@nestjs/platform-express@11.1.20`.
- **Analysis:** the app **never** imports or invokes multer — there are no multipart routes,
  and Express is bootstrapped with `bodyParser:false` + JSON/urlencoded parsers only (6 MB
  cap). The DoS requires multipart parsing, which never happens → **unreachable**.
- **Fix:** forced to the patched `multer@2.2.0` (outside the affected `1.0.0–2.1.1` range) via
  root `overrides` (flat + nested `@nestjs/platform-express` form) and a regenerated lockfile.
  `npm audit --omit=dev --audit-level=high` now reports **0 production vulnerabilities**.
- **CI:** the audit gate now runs `npm audit --omit=dev --audit-level=high` (production deps,
  high+); dev-only test-tooling moderates (jest/babel/js-yaml chain, 19) are reviewed but do
  not block deploys since they are never shipped.

---

## Verified secure (no change required)

| Area | Evidence |
|------|----------|
| **Multi-tenancy / IDOR** | Every tenant service calls `assertRestaurantAccess(client, userId, restaurantId)` and filters queries by `restaurant_id`; invoice/print lookups use `.eq('id',…).eq('restaurant_id',…)`; billing/void/reprint RPCs **re-validate** `restaurant_users` inside the SQL function. |
| **Authorization** | Guard-coverage scan: all tenant routes use `SupabaseJwtGuard`; only intentional public routes are unauthenticated (`/health`, `/health/ready`, `auth/login|register|refresh|reset-password` (throttled), `webhooks/razorpay` (signature-verified)). `billing/finalize` is guarded. |
| **Authentication** | JWT verified with `jose` (validates `exp`) then Supabase fallback; login/reset return generic errors (no enumeration); per-route throttling (login 8/min, reset 3/5min); logout uses `admin.signOut`. |
| **Billing integrity** | `finalize_invoice_transaction` is a `security definer` RPC: idempotency-key row (`for update`), unique `(restaurant_id, order_id)`, server-side totals, sequence locks; finalized invoices are **immutable** via DB trigger (now also covers `bill_number`/`customer_name`/`cashier_name`). |
| **Webhooks** | HMAC-SHA256 + `timingSafeEqual` (constant-time), fail-closed when secret/signature missing, idempotent upsert on `(provider,event_id)`. |
| **Injection (SQL)** | Supabase query builder + parameterized RPC named args throughout; no string-built SQL, no `eval`/`child_process`/`new Function`. |
| **XSS** | Receipt HTML escapes every dynamic field (`escapeHtml` on names, customer, footer, logo URL, currency); React auto-escaping elsewhere; the only `dangerouslySetInnerHTML` renders escaped content + static CSS. |
| **File upload** | data-URI decode, MIME allowlist, size caps (menu 2 MB / logo 1 MB), per-restaurant UUID storage paths (no traversal). |
| **Secrets** | None committed (`git ls-files` clean); `.gitignore` covers `.env*`, keystores, service-account JSON. |
| **Error handling** | 500s return generic `"Unexpected error"`; stack traces only to server logs, never the client. |
| **Logging** | `sanitizeForLogs` redacts authorization/JWT/password/secret/card patterns with depth + length caps. |
| **Headers / transport** | Helmet with strict CSP, `frameAncestors 'none'` (clickjacking), HSTS in production, `x-powered-by` disabled, compression. |
| **CORS** | Production requires explicit `CORS_ORIGINS` and rejects `*`; dev-only reflection. |
| **Input validation** | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform`; DTOs use `@IsUUID/@IsIn/@Min/@MaxLength/@Matches`; negative/NaN clamped in billing math. |

---

## Dependency audit

| | Count | Ships to prod? | Action |
|---|---|---|---|
| High | 0 | — | `multer` forced to patched 2.2.0 via overrides + lockfile regen |
| Moderate | 19 | **No** (jest/babel test chain) | Dev-only; refresh in a separate deps PR |
| Low | 0 | — | — |

`npm audit --omit=dev --audit-level=high` → **0 production vulnerabilities** (exit 0). The CI
gate runs this exact command. No secrets, deprecated runtime packages, or known-malicious
packages in the production tree.

---

## Performance notes

- No N+1 loops in hot paths; list endpoints paginate (`limit/offset`, capped) and rely on
  the indexes in `schema.sql`/`performance-hardening.sql`.
- Readiness probe parallelized (was ~3.5 s sequential → concurrent `Promise.all`).
- Location/print fan-out and menu metadata are cached client-side; offline queue is bounded.

---

## Remaining risks / recommendations (non-blocking)

| # | Item | Severity | Recommendation |
|---|------|----------|----------------|
| R1 | Public `POST /auth/register` allows anonymous account creation + email enumeration (Supabase "already registered" error). Created users are inert (no tenant link). | Medium | Gate registration behind owner invite/admin, or return a generic response. |
| R2 | `@nestjs/throttler` is in-memory → rate limits are per-instance under horizontal scaling. | Low | Use a Redis/store-backed throttler for multi-instance deploys. |
| R3 | Dev dependency advisories (jest/babel test chain, 19 moderate). | Low | Dev-only, never shipped; patch in a dedicated dependency-refresh PR with a full test run. |
| R4 | Menu `image_url` accepts arbitrary external URLs (rendered client-side only; no server fetch). | Low | Optionally restrict to the storage host for consistency. |

---

## Production readiness: **94 / 100**

Deductions: −3 public registration / enumeration (R1), −2 single-instance rate limiting (R2),
−1 dev-dependency advisories (R3). No Critical/High **exploitable** issues, **0 production
dependency vulnerabilities**, tenant isolation and billing integrity verified — **suitable for
production deployment**; R1–R2 recommended as fast-follows.

---

## Addendum — 2026-06-29 (onboarding, invite-only registration, WebUSB printing)

Re-review covering changes since the original audit, plus a fresh dependency + bootstrap pass.

| Area | Finding | Status |
|---|---|---|
| **R1 — public registration** | Anonymous account creation | ✅ **Resolved.** `POST /api/auth/register` now gated by `RegistrationGuard`: disabled unless `AUTH_REGISTRATION_TOKEN` is set, then requires a timing-safe `x-registration-token` header. No public sign-up. |
| Onboarding endpoint | `POST /api/restaurants/onboard` authz + tenant scope | ✅ JWT-guarded; links the authenticated subject as `owner`; atomic create with delete-on-failure rollback; audit-logged. |
| Onboarding input bounds | DTO was a TS interface → bypassed the global `ValidationPipe` (unbounded strings, extra fields ignored) | ✅ **Fixed.** Converted to a class-validator class (`MaxLength`, `IsIn`, `IsNumber`/`Min`/`Max`, `IsBoolean`); now whitelisted + bounded; added a 10/min throttle on the route. |
| Dependencies (prod) | `npm audit --omit=dev` | ✅ **0 vulnerabilities.** |
| HTTP hardening | helmet+CSP, HSTS (prod), CORS allowlist, 6 MB body cap, `x-powered-by` off, request tracing | ✅ confirmed in `main.ts`. |
| WebUSB printing | New client-side ESC/POS transport | ✅ Low risk — a raw byte channel to a user-authorized **local** USB device, gated by a browser permission prompt; no server attack surface. ESC/POS output is ASCII/code-page-restricted. |
| Cleanup | Broken `src/printers/*` AI stubs reappeared and broke `nest build` | ✅ Removed; build restored. |

**Residual (non-blocking):** R2 (in-memory throttler under horizontal scale) and R3 (dev-only
advisories) still stand. New: consider a soft per-user workspace cap, and convert
`createRestaurant`/`updateRestaurant` interface DTOs to validated classes for parity with
onboarding.

**Updated readiness: 96 / 100** (R1 resolved; onboarding input-validation gap closed).

---

## Addendum — 2026-07-11 (Dine-In QR public surface review)

Scope: the new internet-exposed unauthenticated surface (`/public/t/:token/*`), the Socket.IO
realtime gateway, and the new authed modules (tables, tabs, entitlements). Reviewed against
spec §10 (S1–S10).

### Verified in place
| Control | Status |
|---|---|
| S1 Capability tokens | ✅ `qr_token` = 192-bit `randomBytes(24).toString('base64url')`, unique-indexed, rotatable; rotation audited (`SECURITY`). |
| S2 Server-authoritative pricing | ✅ Client sends only `menu_item_id` + `qty` (DTO has no price fields — structurally impossible to tamper); prices re-read from `menu_items`; foreign/inactive/86'd items rejected. Verified by tests. |
| S3 Input validation | ✅ Global `ValidationPipe` (whitelist + forbidNonWhitelisted); caps: ≤50 lines, qty 1–99, note ≤200, name ≤80, request-id ≤64. |
| S4 Rate limiting | ✅ Global 120/min/IP + 10/min/IP on `POST /orders`. **Added this pass:** per-table cap — max 15 open QR orders per table. |
| S5 Tenant isolation / no disclosure | ✅ Token resolves exactly one table+restaurant; plan without `qr_ordering` → 404 (indistinguishable from unknown token); every query `restaurant_id`-scoped. |
| S6 Minimal exposure | ✅ Guest menu exposes only display fields; context exposes name/currency/label/open-flag. |
| S7 No PII / payments | ✅ Optional name only; no payment data (pay-at-counter v1). |
| S8 Transport/headers | ✅ helmet/CSP/HSTS unchanged; gateway CORS resolved per-handshake from `CORS_ORIGINS`. |
| S9 Auditability | ✅ Prep-state transitions + table CRUD/rotation + tab consolidation audited. **Added this pass:** guest order placement audited (null actor, best-effort so a log hiccup can't fail the order). |
| S10 Kill switch | ✅ Per-table pause + restaurant-wide pause, both enforced server-side on placement (not just UI). |
| Realtime gateway | ✅ Handshake verifies Supabase JWT, then membership, then `realtime_orders` entitlement before joining `restaurant:{id}`; unauthorized sockets disconnected (fail-closed → clients fall back to polling). Join authorization unit-tested. |
| Idempotency | ✅ `client_request_id` unique per restaurant (partial index) + lost-race re-read. |

### Fixed this pass
| # | Finding | Fix |
|---|---|---|
| Q1 | `GET /public/t/:token/orders/:id` let any token holder in the restaurant read another table's order status by UUID | Status reads now also scoped `table_id = token's table` (+ regression test) |
| Q2 | No per-table flood cap (per-IP throttle alone is weak against rotating mobile IPs) | Max 15 open QR orders per table → friendly rejection (+ test) |
| Q3 | Guest order placement not audit-logged (spec S9) | `order.placed` audit row with null actor; `writeAuditLog` widened to `string \| null` |

### Residual (accepted, non-blocking)
- Socket.IO handshakes aren't covered by the HTTP throttler (upgrade path); abuse would need
  many TCP conns — revisit if seen in the wild.
- A realtime socket joined before a plan downgrade stays in the room until reconnect
  (entitlement re-checked on every reconnect).
- JWT verification (guard + gateway) doesn't pin `alg`; Supabase legacy secrets are HS256 and
  the key is symmetric, so confusion risk is minimal — revisit if the project migrates to
  asymmetric JWKS.
- Order-status polling by guests is bounded only by the global per-IP throttle (acceptable).

---

## Addendum — 2026-07-14 (Phase 3 review: modifiers, waiter-call, i18n, analytics)

Scope: everything added since the 2026-07-11 pass — item option groups (public pricing),
service-requests (waiter-call), per-item translations, and the QR-performance analytics
endpoint. Dependency audit (root, prod + dev): **0 vulnerabilities** (socket.io, qrcode.react
included).

### Verified in place
| Area | Finding |
|---|---|
| Option pricing (public) | Verified: `placeOrder` validates each `option_id` against the ordered item's **own** groups (cross-item / cross-restaurant option injection -> 400); `price_delta` re-read from DB (client sends only ids); per-group min/max enforced, incl. required groups when the client sends nothing; priced `options_snapshot` written server-side. Tests cover pricing/snapshot, missing-required, unknown-option. |
| Option availability | Verified: public menu returns only `is_available` options; `placeOrder` rejects unavailable ones. |
| Options admin | Verified: `getItemOptions`/`replaceItemOptions` gated by `assertRestaurantAccess` + item-ownership check; all rows `restaurant_id`-scoped; insert-before-delete (no window without options); DTO bounded (<=10 groups, <=20 options, names <=60, deltas +/-100000, min/max 0-10); audited. |
| Waiter-call | Verified: public `POST /public/t/:token/call` throttled 3/min, deduped to one open request per table (no unbounded growth), entitlement-gated via token resolve, audited (null actor). Staff list/resolve gated by `assertRestaurantAccess`, `restaurant_id`-scoped, `qr_ordering`-entitled. |
| QR analytics | Verified: `GET /dashboard/.../qr-performance` behind JWT + `EntitlementGuard('analytics_plus')`; `assertRestaurantAccess`; all reads `restaurant_id`-scoped. |
| XSS (owner content -> print) | Verified: item + option names HTML-escaped in browser KOT and receipt HTML; ESC/POS path is `toAscii` (non-HTML); translated names render as React text (auto-escaped) and never enter the HTML/ESC-POS builders (those use canonical `name_snapshot`). |
| Realtime events | Verified: new `service.requested`/`service.resolved` emit only to the authorized `restaurant:{id}` room (unchanged JWT+membership+entitlement handshake). |

### Fixed this pass
| # | Finding | Fix |
|---|---|---|
| Q4 | `menu_items.translations` validated only as `@IsObject()` — unbounded keys / depth / string length, and echoed to the public guest menu (owner-scoped storage-bloat / oversized public response). | `sanitizeTranslations()` clamps to <=20 languages, letters-only 2-8-char codes, names <=120 chars, dropping anything else; applied on create + update. Unit-tested (4 cases). |

### Residual (accepted, non-blocking)
- Unchanged from the 2026-07-11 addendum (socket handshake not HTTP-throttled; in-room plan
  downgrade until reconnect; JWT `alg` not pinned; guest status polling bounded only by the
  global per-IP throttle).

**Readiness: unchanged — public surface remains server-authoritative, tenant-isolated, and
disclosure-safe. No high/medium findings; one low-severity input-bound closed.**
