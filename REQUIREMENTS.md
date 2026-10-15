# QR Dines — Requirements Specification

Multi-tenant restaurant point-of-sale (POS). NestJS API + Next.js 15 web app, backed by
Supabase (Postgres, Auth, Storage). This document captures the **functional** (what the
system does) and **non-functional** (how well it does it) requirements, plus the security
posture verified on 2026-06-29.

Priority key: **M** = must-have, **S** = should-have, **C** = could-have.

---

## 1. Functional Requirements

### FR-1 Authentication & account provisioning
- **FR-1.1 (M)** Accounts are **invite/admin-provisioned only** — there is no public sign-up. `POST /api/auth/register` is disabled unless `AUTH_REGISTRATION_TOKEN` is configured, and then requires a matching `x-registration-token` header (timing-safe compare). Owners are otherwise created via the Supabase dashboard.
- **FR-1.2 (M)** Users log in with email + password and receive a Supabase session (access + refresh JWT).
- **FR-1.3 (M)** The web app verifies/refreshes the session, redirects unauthenticated users to `/login`, and supports logout.
- **FR-1.4 (M)** Protected API routes require a valid Supabase JWT (verified locally via `jose`, falling back to Supabase `getUser`). Login/refresh return only `{ id, email, full_name }`.
- **FR-1.5 (S)** Password reset via email.

### FR-2 Multi-tenancy
- **FR-2.1 (M)** A user may belong to one or more restaurants via `restaurant_users` (role `owner` on creation).
- **FR-2.2 (M)** Every data read/write is scoped to a restaurant the caller belongs to; cross-tenant access is rejected (`assertRestaurantAccess`).
- **FR-2.3 (M)** The web app has an active-workspace concept with a switcher; a user with multiple restaurants can switch between them.

### FR-3 Onboarding
- **FR-3.1 (M)** A logged-in user with no workspace is routed to a guided `/onboarding` wizard (Workspace → Tax & invoicing → Branding → Review) — never a dead-end.
- **FR-3.2 (M)** `POST /api/restaurants/onboard` atomically creates the restaurant, links the owner, seeds default settings (`tax`, `invoice`, `billing`, `contact`), optionally seeds a sample menu, and writes an audit log. Any failure rolls back by deleting the restaurant (cascades clean up dependents).
- **FR-3.3 (S)** An existing owner can create additional workspaces via "+ New workspace" (`/onboarding?new=1`).

### FR-4 Menu management
- **FR-4.1 (M)** CRUD for categories and menu items, scoped per restaurant.
- **FR-4.2 (M)** Items carry name, price, tax rate, food type (`VEG`/`NON_VEG`/`EGG`), and optional dietary tags.
- **FR-4.3 (S)** Item image upload to Supabase Storage (raster only) with thumbnails; soft delete.

### FR-5 Billing / checkout
- **FR-5.1 (M)** Build a cart with quantities, line-level and bill-level discounts (percent/fixed), optional service charge, tax computation, and rounding.
- **FR-5.2 (S)** Optional customer name with recent-customer suggestions (per restaurant, client-side).
- **FR-5.3 (M)** Finalize a bill through a transaction-safe RPC (`finalize_invoice_transaction`) with an idempotency key so retries never double-charge.
- **FR-5.4 (S)** Offline cart draft persistence and a pending-action queue that replays when back online.

### FR-6 Invoicing & numbering
- **FR-6.1 (M)** GST invoice number `YYYY-CODE-NNNNN`, sequential per restaurant.
- **FR-6.2 (M)** A separate, prominent **Bill No** with a configurable reset cadence (never / daily / monthly / yearly), computed in the restaurant's timezone.
- **FR-6.3 (M)** Finalized invoices are immutable (DB trigger); voiding requires a reason; reprints are counted.
- **FR-6.4 (M)** Invoice rendering as thermal receipt HTML and downloadable PDF (A4/A5) with optional logo.

### FR-7 Printing
- **FR-7.1 (M)** Pluggable `PrinterAdapter` architecture with a queue + retry; adapter chosen by the `connection_type` setting, falling back to the browser adapter.
- **FR-7.2 (M)** **Browser adapter** — prints receipt HTML via the browser/OS pipeline (zero install, works on any device incl. iPad).
- **FR-7.3 (S)** **WebUSB adapter** — one-click, silent, fast ESC/POS printing to USB thermal printers on Chromium (Windows + Android): device detection, paper cut, cash-drawer kick, multiple copies. Reports unavailable on Safari/Firefox so the service falls back to the browser adapter.
- **FR-7.4 (S)** Auto-print after billing, a test-print action, and automatic queue retry on transient failure.

### FR-8 Settings & branding
- **FR-8.1 (M)** Edit restaurant profile (name, code, GSTIN, currency, timezone, contact).
- **FR-8.2 (M)** Configure tax rate, invoice prefix/footer, service charge, and bill-number reset.
- **FR-8.3 (M)** Configure printer (connection type, paper width, copies, auto-print, logo, and — for USB — auto-cut and cash drawer).
- **FR-8.4 (S)** Upload/replace/remove a logo (PNG/JPG/WebP, ≤1 MB; SVG intentionally disallowed) to a public storage bucket.

### FR-9 Dashboard
- **FR-9.1 (M)** Show today's sales, order count, average bill, top-selling items, and recent bills, with the "today" boundary computed in the restaurant's timezone.
- **FR-9.2 (S)** Live refresh after a bill is finalized.

### FR-10 Order history
- **FR-10.1 (M)** Paginated invoice list with payment-method and status filters; shows Bill No and customer.

### FR-11 Audit logging
- **FR-11.1 (M)** Immutable audit records for security-relevant events (finalize, settings change, branding change, onboarding, restaurant update) with actor, before/after state, and request correlation.

---

## 2. Non-Functional Requirements

### NFR-1 Security  *(see §3 for current status)*
- **NFR-1.1 (M)** All non-public endpoints require a verified JWT; tenant isolation enforced server-side on every request.
- **NFR-1.2 (M)** All request bodies validated and bounded via a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`); unknown/oversized fields rejected.
- **NFR-1.3 (M)** Secrets supplied only via environment; the server fails fast if required secrets are missing. The Supabase **service-role key is server-only** and never shipped to the client.
- **NFR-1.4 (M)** Defense-in-depth HTTP hardening: `helmet` + CSP, HSTS in production, `x-powered-by` disabled, CORS restricted to an allowlist, request body size capped (6 MB).
- **NFR-1.5 (M)** Rate limiting via throttler — global default plus tighter limits on auth (`register` 5/min, `login` 8/min) and onboarding (10/min).
- **NFR-1.6 (M)** Output encoding: all user-supplied fields are HTML-escaped in receipt rendering; ESC/POS output is restricted to a safe code page.
- **NFR-1.7 (M)** Outbound fetches (PDF logo) restricted by an SSRF allowlist; uploads restricted to raster image types (no SVG → no stored XSS).
- **NFR-1.8 (M)** Registration is invite-only (token-gated, timing-safe) — no anonymous account creation.
- **NFR-1.9 (S)** Dependencies carry **0 known vulnerabilities** at production audit level; CI runs `npm audit --omit=dev`.

### NFR-2 Performance
- **NFR-2.1 (S)** API p95 latency < 300 ms for reads, < 600 ms for finalize, under nominal load.
- **NFR-2.2 (M)** WebUSB receipt print initiates in < 1 s (local, no dialog); browser print opens immediately.
- **NFR-2.3 (S)** Dashboard first meaningful render < 2 s on a warm session; skeletons shown while loading.

### NFR-3 Reliability & availability
- **NFR-3.1 (M)** Billing is transaction-safe and idempotent; partial failures never persist a half-finalized invoice or half-created tenant.
- **NFR-3.2 (S)** Print failures degrade gracefully: queue + retry, with browser/PDF fallback.
- **NFR-3.3 (M)** `/api/health` and readiness probes are exposed; the process enables graceful shutdown hooks and logs a startup readiness summary without crashing.

### NFR-4 Scalability
- **NFR-4.1 (S)** Backend is stateless (JWT auth, no server session) and horizontally scalable behind a proxy (`trust proxy` configurable).
- **NFR-4.2 (S)** Data is partitioned per tenant; sequences and settings are per restaurant.

### NFR-5 Usability & accessibility
- **NFR-5.1 (M)** Responsive across desktop tablet and phone; light + dark themes with no flash on load.
- **NFR-5.2 (S)** Keyboard-navigable interactive controls, ARIA roles/labels on menus and dialogs, visible focus states.
- **NFR-5.3 (S)** Consistent loading skeletons and elegant, actionable error/empty states across all pages.

### NFR-6 Maintainability
- **NFR-6.1 (M)** TypeScript throughout; modular NestJS modules and a pluggable printer interface.
- **NFR-6.2 (M)** Lint clean (ESLint), backend unit tests (Jest) for billing, invoicing, settings, onboarding, and the registration guard; `tsc`/`next build` clean.
- **NFR-6.3 (S)** No dead code or broken stubs in the build set.

### NFR-7 Observability
- **NFR-7.1 (M)** Request tracing with request/correlation IDs; security events (auth failures) recorded as throttled alerts.
- **NFR-7.2 (M)** Immutable audit trail for sensitive mutations (see FR-11).

### NFR-8 Compliance & data
- **NFR-8.1 (M)** GST invoices are immutable once finalized; voids are explicit and reasoned.
- **NFR-8.2 (S)** Minimal PII (optional customer name); customer data is not required to bill.
- **NFR-8.3 (C)** Documented backup/restore for the Postgres database.

### NFR-9 Compatibility
- **NFR-9.1 (M)** Web app supports current Chromium, Safari, and Firefox.
- **NFR-9.2 (M)** WebUSB printing is Chromium-only (desktop + Android); unsupported browsers fall back automatically and the UI states the limitation. No iOS WebUSB.

### NFR-10 Configuration & portability
- **NFR-10.1 (M)** 12-factor configuration via environment variables, validated on boot.
- **NFR-10.2 (S)** The shared client key (`SESSION_CLIENT_KEY`) and registration token are documented in `.env.example`.

---

## 3. Security Review — 2026-06-29

Scope: recent onboarding + invite-only registration + WebUSB printing changes, plus a
dependency and bootstrap-hardening pass.

| Area | Finding | Status |
|---|---|---|
| Dependencies (prod) | `npm audit --omit=dev` | ✅ 0 vulnerabilities |
| HTTP hardening | helmet+CSP, HSTS (prod), CORS allowlist, body cap 6 MB, `x-powered-by` off | ✅ in place |
| Input validation | Global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform) | ✅ in place |
| Onboarding input bounds | Onboard DTO was an interface → bypassed the pipe (unbounded strings) | ✅ **fixed** — converted to a validated class (MaxLength/IsIn/Min/Max) + 10/min throttle |
| Registration | Public sign-up open | ✅ **fixed earlier** — token-gated, timing-safe, disabled by default |
| Tenant isolation | Onboard links the JWT subject as owner; all other routes use `assertRestaurantAccess` | ✅ enforced |
| SSRF / uploads | PDF logo fetch allowlisted; SVG uploads disallowed | ✅ in place |
| WebUSB | Client-side raw byte channel to a user-authorized local device; no server exposure | ✅ low risk |
| Secrets | Service-role key server-only; fail-fast on missing secrets | ✅ in place |

**Residual recommendations (not blocking):**
- Consider a soft cap on workspaces-per-user to limit authenticated abuse (currently throttle-limited).
- `createRestaurant` / `updateRestaurant` still use interface DTOs (manual validation); converting them to validated classes would close the same bound-checking gap as onboarding.
- The print queue persists the full receipt payload (incl. optional customer name) to `localStorage`; acceptable, but note as client-side data-at-rest.
