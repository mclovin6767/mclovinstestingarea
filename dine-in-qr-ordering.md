# PRD & Technical Spec — Dine-In QR Ordering (Tier)

**Status:** Draft v1 · **Product:** QR Dines · **Type:** New subscription tier + feature
**Stack:** NestJS (backend) · Next.js 15 App Router (frontend) · Supabase (Postgres/Auth/Storage)
**Depends on:** existing POS (menu, orders, invoices, KOT, WebUSB printing, dashboard, invite-only onboarding)

---

## 0. Decisions (confirmed)
- **Tier name:** **Dine-In QR** (distinct from the product "QR Dines").
- **Payments:** **pay-at-counter only for v1** — the QR flow ends at "order placed"; payment stays on the existing POS. No online payments, no payment gateway, **out of PCI scope**. Order and (future) payment records are kept **separable** so pay-at-table can be added later without a rewrite.

---

## 1. TL;DR

Add a **Dine-In QR Ordering** tier. Each table gets a printed QR code; a guest scans it, browses the
restaurant's live menu, adds items to a cart, and places an order **without logging in**. The order
lands in the POS as an **incoming order**, can **auto-print a KOT**, and staff move it through
`accepted → preparing → ready → served`, then bill it with the existing billing flow.

The feature ships behind a **plan/entitlement system** so it is unlocked only for restaurants on the
Dine-In QR (or higher) plan, and is **additive** — basic-POS customers are unaffected.

Two foundations are built first: (a) **plans + entitlements** gating, and (b) a **public,
token-scoped, internet-exposed ordering surface** with its own security model.

---

## 2. Problem statement

Basic-POS restaurants still take dine-in orders manually (waiter → paper/verbal → POS), which is slow
at peak hours, error-prone, and staff-intensive. Guests increasingly expect to self-order from their
phone. Today QR Dines has no self-ordering capability and no way to monetize higher tiers. Not solving
this leaves upsell revenue on the table and cedes ground to QR-ordering competitors (which are a
common paid add-on in this market).

---

## 3. Goals & success metrics

### Goals (outcomes)
- **G1 — Monetize a higher tier:** convert a meaningful share of active POS restaurants to the paid
  Dine-In QR tier.
- **G2 — Reduce order-taking effort:** let guests self-order so staff handle exceptions, not data entry.
- **G3 — Faster table turns:** shorten "seated → order placed" time vs. manual ordering.
- **G4 — Clean, reusable gating:** a plan/entitlement layer that supports 3–4 tiers now and repackaging later without code churn.

### Success metrics
**Leading (days–weeks)**
| Metric | Target | Stretch | Measurement |
|---|---|---|---|
| Eligible restaurants that enable QR ordering ≤30d | 40% | 60% | `tables` rows + first published QR per restaurant |
| QR order placement success rate | ≥98% | ≥99.5% | `POST /public/t/:token/orders` 2xx ÷ attempts |
| Guest scan → order-placed (median) | <3 min | <2 min | client event `scan` → `order_placed` |
| Staff accept time (median) | <90 s | <45 s | `placed` → `accepted` timestamp delta |

**Lagging (weeks–months)**
| Metric | Target | Measurement |
|---|---|---|
| POS → Dine-In QR upgrade rate | ≥15% of eligible in 1 quarter | subscription plan change events |
| Net MRR added by the tier | (business target) | subscription revenue |
| Retention lift for QR-enabled restaurants | +X pts vs. non-QR | cohort retention |
| Share of dine-in orders placed via QR (in enabled restaurants) | ≥30% | `orders.source='qr'` ÷ dine-in orders |

---

## 4. Non-goals (v1)

- **N1 — In-app payment / pay-at-table.** v1 is **pay-at-counter**; no payment gateway, so we stay out of PCI scope. (Future tier.)
- **N2 — Running tab / multi-round ordering per table.** v1 = one submitted order per scan. Merging multiple QR orders into one bill is **Phase 2**.
- **N3 — Item modifiers / variants / combos** (e.g., "no onions", size). v1 uses the existing flat menu. (Phase 3.)
- **N4 — Real-time push (Socket.IO/WebSocket).** v1 uses **polling** for staff visibility; realtime is a fast-follow.
- **N5 — A separate customer app / separate deploy.** v1 ships the guest surface as a **route group inside the existing Next.js app**, isolated for later extraction.
- **N6 — Self-serve plan checkout / billing automation (Stripe/Razorpay).** v1 plan assignment is **admin/manual**; automated subscription billing is a separate initiative.
- **N7 — Waiter-call, reviews, loyalty, multi-language menu.** Out of scope; noted as P2.

---

## 5. Personas & user stories

**Guest (diner, unauthenticated, on their phone)**
- As a guest, I scan the table QR so that I can see this restaurant's menu without installing anything or logging in.
- As a guest, I add items with quantities and an optional note so that I can order exactly what I want.
- As a guest, I place my order and see a confirmation with a live status so that I know the kitchen received it.
- As a guest, if the restaurant isn't accepting QR orders (closed/paused/plan off), I see a clear message instead of a broken page.

**Cashier / floor staff (authenticated POS user)**
- As staff, I see incoming QR orders in a live queue so that I can act on them quickly.
- As staff, I accept an order (auto-printing a KOT to the kitchen) so that preparation starts.
- As staff, I move an order through preparing → ready → served so that the floor knows its state.
- As staff, I bill a table's QR order through the existing billing flow so that nothing about checkout changes.

**Owner / admin (authenticated)**
- As an owner, I create tables and print their QR codes so that each table can order.
- As an owner, I turn QR ordering on/off (globally or per table) so that I control when it's live.
- As an owner on the basic plan, I see a locked "Dine-In QR" section with an upgrade prompt so that I know the feature exists and how to get it.
- As an owner, I can rotate a table's QR token so that a leaked/last-printed code can be invalidated.

---

## 6. Scope & phasing

- **Phase 0 — Entitlement spine (P0 foundation):** plans + subscriptions + entitlement resolution + backend `EntitlementGuard` + frontend `FeatureGate`. No guest-visible change; basic POS keeps working.
- **Phase 1 — QR ordering MVP (P0):** tables + QR generation, public ordering surface, place order, staff incoming queue (polling), KOT auto-print, status transitions, bill via existing flow. Entitlement-gated.
- **Phase 2 — P1 fast-follows:** running tab per table, pause ordering, realtime (Socket.IO), item 86-ing (availability), QR print sheet, order cancel/edit.
- **Phase 3 — P2 future:** pay-at-table, modifiers/variants, multi-language, waiter-call, QR funnel analytics.

---

## 7. Requirements

### 7.1 Plans & entitlements — **P0**

**Behavior:** A restaurant has exactly one active subscription mapping to a plan. Features gate on
**entitlements** derived from the plan, never on hardcoded plan names.

- Plans (initial): `starter` (basic POS), `dine_in_qr` (adds QR ordering), `pro` (QR + higher limits/analytics). (Exact names/prices = business decision, see Open Questions.)
- Entitlements are a single source of truth, e.g. `qr_ordering`, `tables`, `max_tables`, `kot`, `realtime_orders`, `analytics_plus`.
- Enforced on **both** ends: backend guard (authoritative) + frontend gate (UX).

**Acceptance criteria**
- [ ] Given a restaurant on `starter`, when it calls any QR/tables admin or public endpoint, then it receives 403 (admin) / 404 (public) and no data leaks.
- [ ] Given a restaurant upgraded to `dine_in_qr`, when it reloads the app, then the "Dine-In QR" nav + pages become available without a redeploy.
- [ ] Given a restaurant is downgraded, when a guest scans an existing QR, then ordering is disabled gracefully (friendly message, no 500).
- [ ] Entitlements resolve from `plan → entitlements` map; adding a 4th plan requires only a data/config change, not feature-code edits.

### 7.2 Tables & QR codes — **P0**

- CRUD tables (`label`, optional `seats`, `is_active`) scoped per restaurant; enforce `max_tables` from entitlements.
- Each table has an **opaque `qr_token`** (≥128 bits entropy, URL-safe). QR encodes `https://<app>/t/<token>`.
- Admin can **rotate** a token (invalidates the old printed code) and **download/print** the QR (single + bulk sheet — bulk is P1).

**Acceptance criteria**
- [ ] Given the plan allows N tables, when the owner creates the N+1th, then it's rejected with an upgrade prompt.
- [ ] Given a table, when the owner views it, then a scannable QR (PNG/SVG) resolving to `/t/<token>` is downloadable.
- [ ] Given a token is rotated, when a guest scans the **old** QR, then they get "This code is no longer active."

### 7.3 Public guest ordering surface — **P0**

Route group `app/(order)/t/[token]` (no auth). Flow: resolve table → menu → cart → place → status.

- `GET /public/t/:token` → restaurant name + branding (logo, colours), table label, and an `ordering_open` flag.
- `GET /public/t/:token/menu` → active categories + items (name, price, food type, image). No internal/cost fields.
- `POST /public/t/:token/orders` → `{ items:[{menu_item_id, qty, note?}], customer_name?, note?, idempotency_key }`. **Server recomputes all prices/taxes.** Creates an `order` (`source='qr'`, `table_id`, `prep_state='placed'`).
- `GET /public/t/:token/orders/:order_id` → prep status for guest polling.

**Acceptance criteria**
- [ ] Given a valid token + open ordering, when a guest submits ≥1 valid item, then an order is created and a confirmation with `order_id` + live status is shown.
- [ ] Given the client sends a manipulated price, when the order is placed, then the server ignores it and computes the authoritative total from `menu_items`.
- [ ] Given an item id that doesn't belong to this restaurant or is inactive, when submitted, then the order is rejected with a clear error and nothing is created.
- [ ] Given a duplicate submit with the same `idempotency_key`, when retried, then exactly one order exists.
- [ ] Given `ordering_open=false` (closed/paused/plan off), when the guest loads the page, then they see a friendly closed state and cannot submit.

### 7.4 Staff visibility, order lifecycle & KOT — **P0**

- Incoming-orders queue in the POS: `GET /restaurants/:id/orders?source=qr&prep_state=placed`, polled every 5–10s.
- Transitions (staff): `accept` → `preparing` → `ready` → `served`; plus `cancel` (with reason). Each writes an audit log.
- On **accept** (or on placement if "auto-accept" setting is on), a **KOT prints** via the existing KOT pipeline to the configured printer.
- Billing is unchanged: staff bill the table's order(s) through the existing finalize→invoice flow; `orders.source='qr'` feeds dashboard metrics.

**Acceptance criteria**
- [ ] Given a new QR order, when staff have the POS open, then it appears in the incoming queue within one poll interval (≤10s).
- [ ] Given "auto-print KOT on QR order" is on, when an order is placed, then a KOT prints once (idempotent — no duplicate on re-poll/retry).
- [ ] Given an order, when staff advance its state, then the guest's status page reflects the new state on next poll.
- [ ] Given a served QR order, when billed, then it produces a normal invoice and counts in dashboard revenue with `source='qr'`.

### 7.5 Nice-to-have — **P1**
- Running tab: multiple QR orders per table session merge into one bill.
- Pause ordering (per restaurant / per table) with a toggle.
- Realtime staff updates (Socket.IO) replacing/augmenting polling.
- Menu item availability ("86" an item) reflected instantly in the guest menu.
- Bulk QR print sheet (all tables on one page).

### 7.6 Future considerations — **P2** (design for, don't build)
- Pay-at-table (payment gateway; keep order + payment records separable now).
- Item modifiers/variants/combos (keep `order_items` shape extensible).
- Multi-language menu, waiter-call, guest ratings, QR-funnel analytics (`analytics_plus`).

---

## 8. System design

### 8.1 Codebase layout (monorepo — additive, isolated for later extraction)
```
apps/backend/src/
  billing-plans/        NEW  plans, subscriptions, entitlements, EntitlementGuard, @RequiresEntitlement
  tables/               NEW  admin CRUD + QR token + rotate
  ordering/             NEW  PUBLIC token-scoped guest endpoints (no JWT)
  orders/               EXT  add source/table_id/prep_state + staff transition endpoints
apps/frontend/src/
  app/(order)/t/[token]/   NEW  public guest surface (no AuthGate, own layout)
  app/(app)/orders/incoming/  NEW  staff incoming queue
  app/(app)/tables/        NEW  admin tables + QR management
  features/ordering/       NEW  guest components (menu, cart, status)
  features/tables/         NEW  admin components
  components/feature-gate.tsx  NEW  <FeatureGate feature="qr_ordering">
```
Rationale: one deploy, shared design system / `types/domain.ts` / API client; route groups give the
guest surface a no-auth layout and independent code-splitting. Physical isolation makes a future
`apps/order` extraction (separate domain/scale/team) a lift-and-shift, not a rewrite.

### 8.2 Data model (new + changes; idempotent migration, matches existing conventions)
**New**
- `plans(code pk, name, price_inr numeric, billing_period text, entitlements jsonb, is_active bool)`.
- `subscriptions(id, restaurant_id fk unique, plan_code fk→plans, status text, current_period_start, current_period_end, trial_ends_at, created_at, updated_at)` — one active per restaurant.
- `tables(id, restaurant_id fk, label text, seats int null, qr_token text unique, is_active bool default true, created_at)` — index on `qr_token`.

**Changed**
- `orders`: add `source text default 'pos'` (`pos|qr`), `table_id uuid null fk→tables`, `prep_state text null` (`placed|accepted|preparing|ready|served|cancelled`), `customer_note text null`. Existing `status` (billing lifecycle) untouched → **backward compatible**.
- Index `orders(restaurant_id, source, prep_state, created_at desc)` for the incoming queue.
- Reuse `audit_logs` (category `ORDER`) for placement + transitions.

### 8.3 API surface
**Admin (JWT + `@RequiresEntitlement`)**
- `GET /plans`, `GET /restaurants/:id/subscription`, `POST /restaurants/:id/subscription` (admin/manual set).
- `POST|GET|PATCH /restaurants/:id/tables`, `POST /restaurants/:id/tables/:tid/rotate-token`, `GET /restaurants/:id/tables/:tid/qr`.
- `GET /restaurants/:id/orders?source=qr&prep_state=…`, `POST /restaurants/:id/orders/:oid/(accept|preparing|ready|served|cancel)`.

**Public (no JWT, token-scoped, rate-limited, entitlement-gated)**
- `GET /public/t/:token`, `GET /public/t/:token/menu`, `POST /public/t/:token/orders`, `GET /public/t/:token/orders/:order_id`.

### 8.4 Entitlement gating mechanics
- `PLAN_ENTITLEMENTS: Record<PlanCode, Entitlements>` in `billing-plans/entitlements.ts` (authoritative, cached).
- `EntitlementGuard` + `@RequiresEntitlement('qr_ordering')` decorator (mirrors `SupabaseJwtGuard`), resolving the restaurant's active subscription → entitlements → allow/deny.
- Public endpoints resolve entitlement via the token's restaurant; deny → 404 (no existence disclosure).
- Frontend receives entitlements in the session/restaurant payload; `<FeatureGate>` gates nav + pages and renders upsell when locked.

### 8.5 Realtime approach
- v1: **polling** (`GET …/orders?source=qr&prep_state=placed`) every 5–10s; support `ETag`/`If-None-Match` to keep it cheap. A subtle chime/badge on new orders.
- P1: Socket.IO room per restaurant for push; polling stays as fallback.

---

## 9. Non-functional requirements

- **Performance:** guest menu load < 1.5s p95; order placement < 800ms p95; new order visible to staff ≤ one poll interval (≤10s).
- **Reliability:** order submission is **idempotent** (client `idempotency_key`); KOT auto-print is idempotent (no duplicate tickets on retry/re-poll).
- **Scalability:** stateless backend; indexed `qr_token` + incoming-queue index; polling bounded + ETag-cacheable.
- **Availability / degradation:** guest surface shows retry on transient failure; ordering-closed and plan-off render friendly states, never 500s.
- **Usability/A11y:** guest page is mobile-first, fast on 3G/4G, accessible (labels, focus, contrast), works on iOS Safari + Android Chrome (no WebUSB/desktop deps on the guest side).
- **Maintainability:** feature isolated in the modules/route groups above; entitlements data-driven; migrations idempotent; unit tests for pricing, entitlement guard, order state machine.
- **Observability:** reuse request tracing + audit logs; add counters for scans, placements, failures.

---

## 10. Security requirements (public, unauthenticated, internet-exposed surface)

- **S1 — Capability tokens:** `qr_token` is opaque, ≥128-bit entropy, URL-safe, non-enumerable, and **rotatable**. Treated as a bearer capability scoped to exactly one `restaurant + table`.
- **S2 — Server-authoritative pricing:** never trust client amounts; recompute price/tax from `menu_items`. Reject items not owned by the restaurant or inactive.
- **S3 — Strict input validation:** global `ValidationPipe` (whitelist + forbidNonWhitelisted) on all public DTOs; cap items-per-order, qty-per-line, and note length.
- **S4 — Rate limiting & abuse control:** `@nestjs/throttler` per token + per IP, stricter on `POST orders`; per-table max open orders and min interval between orders; body-size cap (existing 6 MB). CAPTCHA/human-check is P2 if abuse appears.
- **S5 — Entitlement/tenant isolation:** token resolves one tenant; every query scoped by that `restaurant_id`; plan-off → 404 (no disclosure). No cross-tenant enumeration.
- **S6 — Minimal data exposure:** guest responses expose only what's needed to order (menu display fields); no cost, supplier, internal ids beyond what's required, or other tenants' data.
- **S7 — No PII / no payments in v1:** customer name optional; no card data (out of PCI scope). Notes are free-text but length-capped and (P2) profanity/spam-filtered.
- **S8 — Transport & headers:** HTTPS only; existing `helmet` CSP applies; CORS allows the guest app origin; HSTS in prod.
- **S9 — Auditability:** log order placement + every state transition (`audit_logs`, category `ORDER`) with correlation id.
- **S10 — Kill switch:** per-restaurant and per-table "pause ordering" so a compromised/abused table can be shut off instantly without deleting data.

---

## 11. Analytics & instrumentation
- Client events: `qr_scan`, `menu_view`, `add_to_cart`, `order_placed`, `order_failed`.
- Server events: order placement, state transitions, KOT print result, entitlement denials.
- Dashboards: adoption (restaurants w/ QR live), QR order share, success rate, scan→placed time, staff accept time, tier conversion.

---

## 12. Rollout & backward compatibility
- Everything behind entitlement flags + idempotent migrations → **zero impact on basic-POS customers**.
- Ship Phase 0 (entitlements) dark first; seed all existing restaurants to `starter` so nothing changes.
- Phase 1 behind a per-restaurant enable; pilot with 2–3 friendly restaurants before GA.
- Feature-branch per slice → PR into `master`; each slice independently verifiable (`nest build` + tests, frontend `tsc`/`lint`/`build`).

---

## 13. Open questions
- ~~**Payments:** confirm v1 is pay-at-counter only.~~ **RESOLVED — pay-at-counter only for v1** (see §0).
- ~~**Tier name.**~~ **RESOLVED — "Dine-In QR"** (see §0).
- **KOT trigger (product):** auto-fire KOT on placement vs. on staff accept? *(Proposed: a per-restaurant setting, default auto-accept + print for speed.)* — non-blocking.
- **Single order vs running tab in v1 (product):** *(Proposed: single order v1, tab in Phase 2.)* — confirm.
- **Plan names, prices, limits, trial (business):** exact tiers/entitlement values. — blocking for launch, not for build.
- **Subscription billing (business/eng):** manual/admin-set in v1, or integrate a gateway (Stripe/Razorpay) now? *(Assumed manual v1.)* — non-blocking for the ordering feature.
- **Guest identity/anti-abuse (eng):** is per-IP + per-table throttling enough, or do we need light verification (e.g., table PIN shown on the physical placard)? — non-blocking; revisit if abused.
- **Static vs dynamic QR (product):** static printed token v1. *(Assumed.)*

---

## 14. Definition of done (v1 / Phase 1)
- [ ] Plans + subscriptions + entitlements live; existing restaurants seeded to `starter`; basic POS unaffected.
- [ ] `EntitlementGuard` + `<FeatureGate>` gate all QR/tables surfaces; downgrade disables gracefully.
- [ ] Admin can create tables, view/download QR, rotate tokens, respecting `max_tables`.
- [ ] Guest can scan → menu → cart → place order (server-priced, idempotent) → see live status; closed/plan-off states are friendly.
- [ ] Staff incoming queue (polling) shows new QR orders ≤10s; accept/preparing/ready/served/cancel work and reflect to the guest.
- [ ] KOT auto-prints once per order (idempotent) via the existing pipeline.
- [ ] Billing a QR order produces a normal invoice; dashboard counts `source='qr'`.
- [ ] Security bar met: server pricing, rate limits, token entropy/rotation, plan-off 404, audit logs, pause kill-switch.
- [ ] Verification green: backend build + tests (entitlement guard, pricing, order state machine), frontend `tsc`/`lint`/`build`.

---

## 15. Risks & mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Abuse/spam on the public order endpoint | Junk orders, kitchen noise | Rate limits, per-table caps, pause kill-switch, (P2) CAPTCHA/table PIN |
| Duplicate KOTs / duplicate orders on retry | Wasted paper, wrong prep | Idempotency keys (order + print), server dedupe |
| Guests order while item unavailable | Guest disappointment, refunds | P1 item 86-ing; v1 staff can cancel with reason |
| Polling load at scale | Backend cost | Bounded interval + ETag; move to Socket.IO in P1 |
| Scope creep (payments/tab/modifiers) | Slips launch | Hard non-goals N1–N7; parking lot; phase gates |
| Naming collision ("QR Dines" tier vs product) | Internal + customer confusion | **Decided:** tier named **"Dine-In QR"**, distinct from the product |
