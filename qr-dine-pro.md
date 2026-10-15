# PRD — QR Dine Pro (top tier: back-office modules)

**Status:** Draft for review
**Last updated:** 2026-07-18
**Related:** [`dine-in-qr-ordering.md`](./dine-in-qr-ordering.md), [`team-and-roles.md`](./team-and-roles.md)

---

## Plan positioning

Three plans, not four. The existing `pro` plan code **is** the pro tier of Dine-In QR; this
work keeps that code and changes its display name to **QR Dine Pro**, adding back-office
modules on top of what it already includes.

| # | Plan | code | Includes |
|---|---|---|---|
| 1 | Basic POS | `starter` | Billing, menu, printing, dashboard, KOT |
| 2 | Dine In QR | `dine_in_qr` | + QR ordering, tables, kitchen queue, tabs, waiter-call |
| 3 | **QR Dine Pro** | `pro` | + team & roles, realtime, menu photos, analytics **+ everything below** |

Nothing about the plan *code* changes, so existing Pro subscriptions upgrade in place — no
migration of customers between tiers.

## Problem Statement

A restaurant owner on Dine-In QR can take orders and see revenue, but runs the actual
*business* — what they paid staff, what stock they burned, what they spent, whether outlet A
beat outlet B — in notebooks and spreadsheets. Revenue without cost is not profit, so today the
product can't answer the question owners care most about: **did I make money this month?**
QR Dine Pro closes that gap and gives the tier a reason to exist beyond QR features.

## Goals

1. Answer **"did I make money?"** — revenue minus real costs (salary, stock, expenses) per
   month, per outlet.
2. Replace the **salary register**: attendance in, payable amount out, payouts recorded.
3. Replace the **stock notebook**: know what's running out before service does.
4. Give multi-outlet owners **one screen** for the whole chain, with outlet-vs-outlet comparison.
5. Make Pro clearly worth its price: the tier stops being "QR extras" and becomes the
   back-office.

## Non-Goals

- **Statutory payroll (PF / ESI / TDS / payslips).** Compliance surface with ongoing rule
  maintenance; owners here pay salaries, they don't run formal payroll. Explicitly deferred.
- **Ingredient/recipe-level inventory.** v1 tracks stock per menu item, not flour-and-oil with
  recipes and unit conversions. Designed so recipes can layer on later.
- **Purchase orders & suppliers.** Restocking is a manual entry in v1.
- **Accounting integrations** (Tally/Zoho/GST filing). Export is the seam.
- **Biometric/geo attendance.** Attendance is marked in-app by an owner or manager.

## Users

- **Owner** — the only role with access to any of this (money and staff data). Enforced by the
  existing `RoleGuard`; staff never see these surfaces.
- **Multi-outlet owner** — same, plus a consolidated view across restaurants they own.

## Entitlements

Per the codebase rule (*gate on entitlements, never plan names*), each module gets its own flag,
all `true` on `pro` only. Repackaging later then needs no feature-code changes.

| Flag | Unlocks |
|---|---|
| `staff_payroll` | Staff records, attendance, salary computation, payouts |
| `expenses` | Expense categories + entries, profit view |
| `inventory` | Item stock, deduction on sale, low-stock alerts |
| `multi_outlet` | Consolidated cross-restaurant dashboard + comparison |
| `data_export` | Owner-facing export/backup of their data |

`analytics_plus` (already Pro) covers Advanced Analytics; **Performance Comparison** extends it.
*Owner Dashboard* and *Restaurant Management* in the marketing list are already shipped
(dashboard, settings/profile) — no new build, they stay on the feature list.

---

## Phase 1 — Staff Salary Management (attendance-driven) ← building first

### Data model
- **`staff_members`** — `id, restaurant_id, name, phone, designation, pay_type
  ('monthly'|'daily'|'hourly'), monthly_salary, daily_rate, hourly_rate, joined_on, is_active,
  user_id (nullable → links to a Team login when the person also uses the app)`.
  Deliberately separate from `restaurant_users`: a cook needs a salary record but no login, and
  a login shouldn't imply a salary.
- **`staff_attendance`** — `id, restaurant_id, staff_id, work_date, status
  ('present'|'half_day'|'absent'|'paid_leave'|'week_off'), hours_worked (nullable, hourly staff),
  notes, marked_by, created_at`. Unique on `(staff_id, work_date)` so a day can't be
  double-marked; re-marking updates.
- **`staff_payouts`** — `id, restaurant_id, staff_id, period_key ('YYYY-MM'), computed_amount,
  adjustment, adjustment_note, net_amount, status ('pending'|'paid'), paid_on, method, notes,
  created_by`. Unique on `(staff_id, period_key)`.

### Salary computation (server-side, never trusted from the client)

Confirmed decisions: **flat ÷30 divisor**, and **leave is unpaid** (same as absent — `leave`
stays a distinct status only so the owner can tell "approved" from "no-show"; both deduct).

- **monthly** — deduct-from-full-salary, the common Indian practice:
  `per_day = monthly_salary / 30`;
  `unpaid_days = absent + leave + 0.5 × half_day`;
  `computed = monthly_salary − (per_day × unpaid_days)`, floored at 0.
  Week-offs and present days are paid, and **unmarked days are not deducted** — incomplete
  record-keeping must never silently cut someone's pay.
- **daily**: `daily_rate × (present + 0.5 × half_day)` — only marked days pay.
- **hourly**: `hourly_rate × Σ hours_worked`.
- Owner may apply a single `adjustment` (± bonus/deduction, with a note); `net = computed +
  adjustment`. The stored `computed_amount` is a **snapshot** taken when the payout is created,
  so later attendance edits don't silently rewrite a payout already handed over in cash.

### Requirements (P0)
- Owner can add/edit/deactivate staff members with a pay type and rate.
- Owner can mark attendance for a date — a day view listing active staff with quick
  present/half/absent/leave/week-off, and a bulk "mark all present" for the common case.
- Owner sees a month view per staff member (calendar-ish summary: present/absent/leave counts).
- Owner sees computed payable per staff member for a month, can add one adjustment, and record
  a payout as paid (date + method).
- Everything owner-gated (`@RequiresRole('owner')`) and entitlement-gated (`staff_payroll`);
  audited (`staff.*` actions).
- Money is computed server-side from attendance; the client posts attendance and payout intent
  only, never amounts.

### Requirements (P1)
- Attendance marked by a Team **manager** role, once such a role exists.
- Export a month's salary register as CSV.
- Warn when creating a payout for a period whose attendance is incomplete.

### Acceptance criteria (samples)
- *Given* a monthly-salary staff member on ₹30,000 in a 30-day month with 2 week-offs and 26
  present + 1 half day + 1 absent, *when* the owner opens the month, *then* payable is
  `30000/28 × 26.5 = ₹28,392.86`.
- *Given* a payout already marked paid, *when* attendance for that month is later edited,
  *then* the paid payout's amount is unchanged and the UI flags the drift.
- *Given* a staff user (role `staff`), *when* they call any payroll endpoint, *then* 403.

---

## Phase 2 — Revenue & Expense Tracking

- **`expense_categories`** (seeded: Rent, Utilities, Supplies, Salary, Maintenance, Other) and
  **`expenses`** (`amount, category_id, spent_on, note, payment_method, created_by`).
- Salary payouts marked paid **post automatically** as a Salary expense, so profit is honest
  without double entry.
- Owner sees **Profit = revenue (finalized invoices) − expenses** for a month, with the split by
  category, on the existing dashboard period picker.

## Phase 3 — Inventory (simple item stock)

- `menu_items.stock_qty` + `low_stock_threshold` + `track_stock` flag.
- Finalizing a bill (and QR orders) decrements stock for tracked items; manual restock entries
  with a reason (`restock`/`wastage`/`correction`) in a `stock_movements` ledger, so the number
  is explainable rather than just overwritten.
- Low-stock list on the dashboard; optional auto-86 when stock hits 0 (reuses the existing
  `is_available` flag, so the guest menu already respects it).

## Phase 4 — Multi-outlet + Performance Comparison

- Consolidated dashboard across all restaurants the owner belongs to: combined revenue, orders,
  profit, plus a per-outlet table.
- **Performance Comparison**: outlet vs outlet, and period vs period (this month vs last),
  with deltas on revenue, orders, AOV and profit.
- Reuses `restaurant_users` (an owner already holds several restaurants) — mostly new read
  models, no new tenancy concept.

## Phase 5 — Data Backup & Security (owner-facing)

- Owner can export their restaurant's data (menu, invoices, expenses, staff, attendance) as CSV/
  JSON on demand — the seam for accountants and for "can I get my data out?".
- Surface the existing `backup:db`/`restore:db` operational scripts as documented runbooks;
  document retention. No new secrets or public endpoints.

---

## Success Metrics

**Leading:** ≥50% of Pro restaurants mark attendance in week 1; ≥1 payout recorded per Pro
restaurant per month; ≥30% log an expense within 30 days.
**Lagging:** Pro upgrade rate from Dine-In QR; Pro retention vs Dine-In QR; reduction in churn
citing "does not cover my costs".

## Decisions (resolved)

- ✅ **Leave is unpaid** — treated like absent. `leave` remains a separate status for the record
  ("approved" vs "no-show"), but both deduct pay.
- ✅ **Flat ÷30 divisor** for monthly staff, deducting only for unpaid days.
- ✅ **Staff records stay separate from Team logins.** A cook needs a salary record but no login;
  a cashier login needn't imply a salary. An optional `user_id` link exists for later.
- ✅ **Team moved down to Dine In QR** (3 seats) — Pro keeps 5. QR restaurants have floor staff
  who need logins, so team-of-one was the wrong gate.

## Open Questions

*(none blocking Phase 1)*

## Phasing

1. **Staff Salary (attendance-driven)** ← first
2. Revenue & Expense tracking (salary payouts feed in)
3. Inventory (simple item stock)
4. Multi-outlet + Performance Comparison
5. Data export / backup surfacing

Each phase ships as its own verified, reviewable slice — same cadence as the Dine-In QR phases.
