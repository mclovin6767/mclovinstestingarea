# PRD — Team & Roles (Owner vs Staff) · Pro tier

**Status:** Draft for review
**Author:** (QR Dines)
**Last updated:** 2026-07-14
**Related:** [`dine-in-qr-ordering.md`](./dine-in-qr-ordering.md), [`SECURITY_AUDIT.md`](../../SECURITY_AUDIT.md)

---

## Problem Statement

Today every QR Dines login is effectively an **owner**: `restaurant_users` carries a `role`
column but nothing reads it, and `assertRestaurantAccess()` checks only *membership*, not
*permission*. The Dine-In QR features created day-to-day operators — cashiers billing orders,
kitchen staff working the queue, floor staff on Tabs and waiter-calls — but the **only way to
give them access is to share the owner login**. That login can void invoices, change GST and
pricing, edit the menu, read revenue analytics, and manage the subscription. As a restaurant
adds employees (exactly the Pro-tier customer), this becomes both an operational-safety hole and
a trust blocker to expanding seats.

## Goals

1. Let a Pro restaurant **invite staff** and give them scoped access **without ever sharing the
   owner login** — target: an owner can invite a staff member and have them working the floor in
   under 5 minutes.
2. **Protect money & configuration server-side**: staff cannot void invoices, change
   pricing/tax/settings, read revenue analytics, or manage the team/subscription — enforced by a
   guard on the API, not just hidden in the UI.
3. Make **role separation a Pro differentiator** that drives upgrades: single-owner login stays
   on Starter/Dine-In QR; multi-user teams require Pro.
4. **Zero disruption to existing accounts** — every current link is already `role='owner'`, so
   nothing changes for today's users.

## Non-Goals

- **Custom/granular RBAC** (per-endpoint permission toggles, custom role builder). Two fixed
  roles cover ~95% of restaurants; a permission matrix is premature complexity. *Design for it,
  don't build it.*
- **A `manager` middle tier.** Likely v2 once we see which owner-only powers staff most need
  delegated. The role column is free-text, so adding a third role later is cheap.
- **Shift management, time tracking, tips, or payroll.** Separate product area.
- **SSO / SCIM / directory sync.** Enterprise concern, not this customer.
- **Per-action user attribution beyond the existing audit log.** `audit_logs.actor_user_id`
  already records who did what; a dedicated "staff activity report" is a future consideration.

## Users & Personas

- **Owner** — signs up, runs onboarding, owns billing/config. Wants to hand out limited access
  and keep the till/menu/settings locked.
- **Staff (cashier / floor)** — bills orders, runs Tabs, takes payments. Needs the operational
  surfaces, nothing financial-config.
- **Staff (kitchen)** — works the Kitchen queue and prep states. Needs even less (no billing).
  *v1 treats both staff types as one `staff` role; kitchen-only is a v2 refinement.*

## User Stories

**Owner**
- As an owner, I want to invite a staff member by email so they can work without my login.
- As an owner, I want to see everyone with access to my restaurant and their role, so I can audit
  who can do what.
- As an owner, I want to revoke a staff member's access instantly (e.g. they quit) so they can no
  longer log in to my restaurant.
- As an owner, I want staff to be unable to void bills, change prices, or see my revenue, so a
  mistake or a bad actor can't cost me money.
- As an owner on Starter/Dine-In QR, I want to see that "Team" is a Pro feature so I understand
  what upgrading unlocks.

**Staff**
- As a staff member, I want to accept an invite and log in to the restaurant I was invited to, so
  I can start working.
- As a staff member, I want the app to show only what I'm allowed to do (no locked buttons that
  error), so the interface is clean and unconfusing.
- As a staff member, I want a clear message if I try something owner-only, so I know to ask the
  owner rather than think it's broken.

## Requirements

### Must-Have (P0)

**P0-1 · Role model + per-restaurant resolution**
Use the existing `restaurant_users.role` with two values: `owner`, `staff` (default stays
`owner`). Role is resolved **per active restaurant** (a user can be owner of one and staff of
another), mirroring how entitlements resolve per restaurant.
- *Given* a user linked to restaurant R as `staff`, *when* any request hits an R-scoped endpoint,
  *then* the resolved role for that request is `staff`.
- Unknown/absent role is treated as **least-privilege (`staff`)**, never owner.

**P0-2 · Server-side `@RequiresRole('owner')` guard**
A `RoleGuard` + decorator mirroring `EntitlementGuard`/`@RequiresEntitlement`. Extend
`assertRestaurantAccess` to also return the role (single query). Applied to every owner-only
endpoint. Insufficient role → **403** with a clear code.
- Owner-only (must be enforced): **void invoice**; all **menu** mutations (items, categories,
  options, availability, translations); all **settings** (printer, branding, billing/tax,
  bill-number reset); **tables & QR admin** (create/rotate/pause, restaurant-wide pause);
  **subscription** read/change; **dashboard analytics** (summary, monthly/yearly metrics,
  QR-performance); **team management** (invite/list/role-change/revoke).
- Staff-allowed (no owner gate): **create/finalize invoice (bill)**; **orders** (list, get,
  prep-state transitions); **tabs** (list, checkout); **service-requests** (list, resolve);
  read own restaurant context (name, currency, active plan flags needed for the UI).
- *Given* a `staff` caller, *when* they call `POST …/invoices/:id/void`, *then* 403 and the
  invoice is unchanged.
- *Given* a `staff` caller, *when* they call `POST …/billing` to finalize a normal sale, *then*
  it succeeds.

**P0-3 · `team` entitlement (Pro-gated)**
Add a `team` boolean to the code-authoritative entitlements map — `true` on Pro only. The invite
endpoints sit behind `@RequiresEntitlement('team')` **and** `@RequiresRole('owner')`. On
non-Pro, the team feature 404/locks exactly like other gated features (fail-to-base-plan).
- Cap: **`max_staff = 5` on Pro** (0 on Starter/Dine-In QR), enforced at invite time like
  `max_tables`. Inviting a 6th staff member is rejected with an upgrade-style message.

**P0-4 · Staff invite + join flow**
An owner creates an invite (email + role); the system issues an opaque single-use invite token
(same `crypto.randomBytes` pattern as `qr_token`), stored in a new `restaurant_invites` table
(`id, restaurant_id, email, role, token, status, expires_at, invited_by, created_at`) with an
expiry (e.g. 7 days). The invitee joins via the token:
- If they **already have an account**: accepting links them to the restaurant with the invite's
  role.
- If they **don't**: they sign up *with the invite token*, which bypasses the global
  `AUTH_REGISTRATION_TOKEN` gate for that one invite, then links them.
- On accept: create the `restaurant_users` row (`role` from invite), mark invite `accepted`,
  audit it. A used/expired/revoked token is rejected.
- *Given* a pending invite for staff@x.com as `staff`, *when* staff@x.com accepts, *then* they get
  a `staff` link to that restaurant and the invite is marked accepted.

**P0-5 · Team management (owner)**
Owner can: list members (email, role, joined date) + pending invites; change a member's role
(owner↔staff); revoke a member (delete the link); revoke a pending invite. An owner **cannot
demote/remove themselves if they are the last owner** (guarantee ≥1 owner).
- *Given* a restaurant with one owner, *when* that owner tries to demote themselves, *then* it's
  rejected with "a restaurant must have at least one owner."

**P0-6 · Frontend role gating (UX layer)**
Resolve the active-restaurant role into the session/entitlements store; add a `useRole()` hook +
`<RoleGate>`. Hide owner-only nav/actions from staff (Settings, Menu editing, Tables admin,
Analytics sections, Team, the invoice **Void** control). This is **UX only** — P0-2 is the
security boundary. Staff who reach an owner-only route see a friendly "Ask your owner" state, not
a raw 403.

**P0-7 · Auditability**
Invite created/accepted/revoked, role changed, member removed → `audit_logs` (category
`SECURITY` or new `TEAM`), with actor. Staff-performed actions already carry `actor_user_id`.

### Nice-to-Have (P1)

- **Kitchen-only sub-role** (staff variant with no billing) — a third role value once we confirm
  demand.
- **Resend / copy invite link** and pending-invite expiry countdown in the UI.
- **"Last active" per member** to help owners prune stale accounts.
- **Email delivery** of invites (if/when a transactional-email provider is wired). v1 can ship
  with a **copyable invite link** the owner sends over WhatsApp/SMS themselves.

### Future Considerations (P2)

- Full **custom-permission RBAC** / role builder.
- **Cross-restaurant staff** management for owners running multiple locations from one screen.
- **Staff activity report** (derived from `audit_logs`).
- **Manager tier** with a configurable subset of owner powers.

## Design / Technical Notes (grounding)

- **Auth**: app users authenticate with a **Supabase JWT** (`SupabaseJwtGuard`, `@User()` →
  `{ sub, email }`). Role is *not* embedded in the token (a user's role differs per restaurant) —
  resolve it per request from `restaurant_users` keyed by `(sub, :restaurantId)`.
- **Guard order**: `SupabaseJwtGuard` → `EntitlementGuard` (if gated) → `RoleGuard`. Reuse the
  `:restaurantId` route param already present on tenant-scoped controllers.
- **Entitlements**: extend `PLAN_ENTITLEMENTS` + the `Entitlements` type (`team: boolean`,
  optional `max_staff: number`); resolved by `billing-plans.service.resolveEntitlements`. Fail
  closed to base plan (never fail-open), consistent with existing gating.
- **Data**: `restaurant_users.role` already exists. New `restaurant_invites` table + indexes.
  Migration is idempotent (schema.sql pattern). No backfill needed (existing links = owner).
- **Public surface unaffected**: guest QR endpoints (`/public/t/:token/*`) stay unauthenticated
  and role-free.

## Success Metrics

**Leading (days–weeks)**
- **Team adoption**: ≥ 40% of Pro restaurants invite ≥ 1 staff member within 30 days of launch.
- **Invite activation**: ≥ 70% of sent invites are accepted within 7 days.
- **Enforcement correctness**: 0 staff-performed voids / settings-changes / analytics reads in
  audit logs (should be structurally impossible; monitored as a guardrail).

**Lagging (weeks–months)**
- **Pro upgrade lift**: measurable increase in Starter/Dine-In → Pro upgrades citing "Team" as the
  unlocked feature (via the upsell surface).
- **Retention**: Pro restaurants with ≥ 1 active staff account retain better than single-user Pro.
- **Support load**: reduction in "staff changed my prices / voided a bill" tickets → ~0.

*Measurement*: invites/accepts from `restaurant_invites` + `audit_logs`; upgrades from
subscription events; enforcement guardrail from an audit query filtered to `role='staff'` on
owner-only actions.

## Decisions (resolved)

- ✅ **Billing split:** staff **can finalize a sale, only owners can void.** (Standard POS split.)
- ✅ **`max_staff` on Pro = 5** (0 on Starter/Dine-In QR).
- ✅ **Order history is owner-only.** Staff cannot browse past bills (`listInvoices` is
  owner-gated and the Orders page is hidden from them). They keep the *single-invoice*
  print/reprint endpoints so they can print or re-print the bill they just took.

## Open Questions

*(none outstanding — all resolved above)*
- **[Engineering] Is a transactional-email provider available for invite delivery?** If not, v1
  ships copyable invite links (owner sends manually) — see P1.
- **[Design] Staff-facing empty/locked states** — copy and visual for "owner-only" areas.

## Timeline / Phasing

Too large for one drop; ship in three reviewable slices (same cadence as the Dine-In QR phases):

- **Phase A — Enforcement core (security):** role resolution in request context, `RoleGuard` +
  `@RequiresRole`, tag all owner-only endpoints, `team` entitlement. *Backend + tests. This alone
  makes shared logins safe if an owner manually sets a link to `staff`.*
- **Phase B — Invite & team management:** `restaurant_invites` table, invite/join endpoints,
  owner Team page (list/invite/role-change/revoke), last-owner guard.
- **Phase C — Frontend role gating & polish:** `useRole`/`<RoleGate>`, hide owner-only nav/actions,
  staff "ask your owner" states, Pro upsell for Team, audit wiring.

---

### Appendix — endpoint owner-gate audit (starting checklist)

| Area | Owner-only | Staff-allowed |
|---|---|---|
| Billing | `void` invoice | create/finalize sale |
| Invoices | **list invoices (order history)**, void | single-invoice print payload / thermal / reprint / PDF |
| Menu | items/categories/options/availability/translations (all writes) | read menu |
| Settings | printer, branding, billing/tax, bill-number reset | read settings needed for billing |
| Tables/QR | create/rotate/pause, restaurant pause | — |
| Orders | — | list/get, prep-state transitions |
| Tabs | — | list, checkout |
| Service-requests | — | list, resolve |
| Dashboard | summary, metrics, qr-performance | — |
| Subscription | read/change | — |
| Team | invite/list/role-change/revoke | — |
