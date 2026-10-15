# QR Dines — Swiggy & Zomato Integration Roadmap

Make QR Dines the **single screen for every order channel** — dine-in QR + Swiggy + Zomato (+ more) —
with one menu pushed everywhere and unified, channel-split reporting. Today a restaurant juggles three
tablets, maintains the menu in three places, and can't see total revenue; this closes that gap.

**Decisions locked (2026-09-10):**
- **Middleware: UrbanPiper (Hub).** One REST API covering catalogue, availability, order relay +
  status, and webhooks — it already holds the Swiggy/Zomato partnerships, so we integrate **once**
  instead of building/maintaining two gated direct integrations.
- **Order ingestion first** (highest daily value, reuses the most existing code).
- **Included in Pro** (headline upgrade driver; we absorb the per-outlet UrbanPiper cost).

**Effort key:** `S` ≤ 1 day · `M` ~2–4 days · `L` ~1–2 weeks. Each item lists _what · why · effort ·
depends-on · acceptance_.

**Reuse note:** the Cashfree pay-at-table work ([[qr-dines-pay-at-table]]) already built the exact
primitives this needs — a **raw-body + signature-verified webhook** with an **idempotent claim**
against duplicate deliveries, the `orders`/`order_items`/`prep_state` model, the incoming-orders board,
KOT printing, socket.io fan-out, and the `daily_metrics` channel-split pattern (`pay_online` bucket).

---

## Phase 0 — UrbanPiper access (EXTERNAL PREREQUISITE — gates everything)

- **P0.1 · Get an UrbanPiper Hub account + link outlets** · `L` (business/BD, not engineering)
  - _What:_ Sign up for UrbanPiper Hub, onboard each restaurant's Swiggy + Zomato outlets, obtain
    **API credentials + webhook signing secret + sandbox** and their **order-webhook + status-update
    API contract**.
  - _Why:_ Swiggy/Zomato APIs are partner-gated; UrbanPiper is the one door. **Nothing below can be
    validated without this** — the code can be built against their docs but must be sandbox-verified.
  - _Depends-on:_ nothing (do this first).
  - _Acceptance:_ a sandbox order can be pushed from UrbanPiper and their status API accepts an ack.
  - ⚠️ Claude cannot obtain these credentials — this is a signup/partnership step for the team.

---

## Phase 1 — Order ingestion (MVP) — the biggest win

Aggregator orders land on the existing board, fire KOTs, and staff accept/reject/advance with status
relayed back. Deliberately needs **no menu mapping** — items are snapshotted from the order payload.

- **P1.1 · Schema** · `S`
  - _What:_ extend `orders.source` to `swiggy`/`zomato`; add `external_order_id`, `channel`,
    `order_type` (delivery/pickup), `channel_payload jsonb`. New `channel_integrations` table (per
    restaurant → provider + per-aggregator outlet/store IDs + status), RLS deny-all.
  - _Why:_ tie an incoming UrbanPiper order to a restaurant + dedupe it.
  - _Acceptance:_ migration applied via the SQL Editor / pooler connstring (local `npm run migrate`
    DNS-fails on `db.<ref>.supabase.co`); columns present in the A2 readiness guard if code-required.

- **P1.2 · `UrbanPiperService` (isolated gateway)** · `M` · depends P0.1
  - _What:_ config from env (fail-soft when unset), **webhook signature verification**, `acknowledgeOrder`
    + `updateOrderStatus` (relay confirmed/preparing/ready/cancelled back to UrbanPiper). Mirror
    `CashfreePaymentsService`.
  - _Why:_ keep every aggregator/gateway detail in one provider-agnostic place.
  - ⚠️ **Apply the Cashfree webhook lesson:** verify against the secret UrbanPiper actually signs with,
    and validate the exact signature scheme + payload against their sandbox before trusting it.
  - _Acceptance:_ unit tests for signature accept/tamper/no-secret; a sandbox webhook verifies.

- **P1.3 · Order webhook + creation** · `M` · depends P1.1, P1.2
  - _What:_ `POST /api/webhooks/urbanpiper` (raw body mounted in `main.ts`, signature-verified) →
    map store → `restaurant_id` → create `orders` (`source=channel`, `prep_state='placed'`,
    `status='open'`) + `order_items` snapshotted from the payload → emit `orders.changed` → fire KOT.
    **Idempotent** on `external_order_id` via the pending→processing claim pattern.
  - _Why:_ the core value — aggregator orders on one board.
  - _Acceptance:_ a duplicate webhook creates exactly one order; the order shows on the incoming board.

- **P1.4 · Board + status relay** · `M` · depends P1.3
  - _What:_ incoming-orders board shows `swiggy`/`zomato` orders with a **channel badge** + accept/reject;
    advancing `prep_state` (accepted→preparing→ready) relays the status back to UrbanPiper (best-effort).
    KOT gets a channel label.
  - _Why:_ staff work all channels from one screen; the aggregator stays in sync.
  - _Acceptance:_ accepting/rejecting + marking ready reflects on the aggregator side (sandbox).

- **P1.5 · Pro entitlement gate** · `S` · depends P1.3
  - _What:_ a `channel_orders` entitlement, on for **Pro**; gate ingestion + board on it.
  - _Acceptance:_ a non-Pro restaurant's channel is inert; Pro sees the orders.

- **P1.6 · Tests + e2e** · `S`
  - _What:_ gateway unit tests + a webhook idempotency test + an e2e that mocks an UrbanPiper order and
    asserts it renders on the board (mirror `guest-pay.spec.ts`).

**Phase 1 total ≈ 1–2 weeks of engineering** once P0.1 is done.

---

## Phase 2 — Menu push / sync · `L` · depends Phase 1

- Map the QR Dines menu (categories, items, options, veg/non-veg, price, GST) → UrbanPiper's catalogue;
  one-click publish; persist external item-id mappings (`menu_items.external_refs jsonb`).
- Handle aggregator menu-schema quirks (variants, add-ons, packaging charges, tax handling).
- _Acceptance:_ editing an item in QR Dines and publishing reflects on Swiggy + Zomato.

## Phase 3 — Availability / "86" sync · `S`–`M` · depends Phase 2

- The existing **`is_available` 86 toggle** pushes an item out-of-stock to Swiggy/Zomato in real time;
  a store online/offline switch pauses a channel.
- _Why:_ drives down cancellations (the #1 aggregator penalty). _Acceptance:_ 86 an item → it hides on
  both aggregators within seconds.

## Phase 4 — Unified reporting · `M` · depends Phase 1

- Aggregator sales in the dashboard, **split by channel** (dine-in / QR / Swiggy / Zomato) — extend
  `daily_metrics` + `payment_mix` exactly like the `pay_online` bucket.
- Track the **~18–25% aggregator commission** → surface **net payout** per channel.
- _Acceptance:_ the dashboard shows per-channel gross, commission, and net for a date range.

## Phase 5 — Advanced (later, as demand appears)

- Rider/delivery status tracking on the order.
- Item-level cancellations / partial refunds from the aggregator.
- Promotions / coupon sync.
- Multi-outlet channel management + bulk menu operations.

---

## Cross-cutting concerns

- **Idempotency & ordering:** aggregators retry webhooks; dedupe on `external_order_id`, reuse the
  claim pattern. Handle out-of-order status callbacks.
- **State reconciliation:** map aggregator order states ↔ our `prep_state`; define the canonical
  mapping once.
- **Deploy safety (A4):** every new column via a migration applied **before** the code deploys; read
  new columns softly on always-on paths (as done for `payment_status`/`pay_online`).
- **Observability:** webhook success/failure + status-relay metrics; alert on a spike of rejects.
- **Secrets:** verify webhooks against the secret the provider actually signs with (the Cashfree
  lesson) and sandbox-validate; keep credentials in Render env, never committed.

## Sequencing / milestones

| Milestone | Contents | Gated by |
|---|---|---|
| **M0** | UrbanPiper access + sandbox (Phase 0) | BD/signup |
| **M1** | Order ingestion live on the board (Phase 1) | M0 |
| **M2** | Menu + 86 sync (Phases 2–3) | M1 |
| **M3** | Unified channel reporting (Phase 4) | M1 |
| **M4** | Advanced (Phase 5) | demand |

## Risks

- **Access is the true blocker** — a partnership, not a dev signup (M0). De-risked by UrbanPiper.
- **Menu-schema mapping** is the fiddliest engineering (Phase 2).
- **Commission/payout reconciliation** is genuinely complex (Phase 4+).
- **Per-outlet UrbanPiper cost** is absorbed since it's bundled into Pro — watch the margin.
