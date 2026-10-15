# Production Audit And Compliance History

## Repository Read And Server Startup

- [x] Inventory source, configuration, documentation, and scripts while excluding generated dependencies/build output.
- [x] Read architecture/development docs, package scripts, environment variable names, and application entry points.
- [x] Check required local services and current port usage.
- [x] Start the requested development server(s).
- [x] Verify health/routes from logs and HTTP responses.
- [x] Record startup commands, URLs, and verification results.

### Startup Review

- Backend command: `npm run dev:backend`; NestJS watch server is listening on `http://localhost:3001`.
- Frontend command: `npm run dev:frontend`; Next.js dev server is listening on `http://localhost:3000`.
- Backend verification: `GET /` returned `200` with the API descriptor; `GET /api/health` returned `200 {"status":"ok"}`.
- Frontend verification: `GET /` returned the expected `307` redirect to `/dashboard`; `GET /login` returned `200` and rendered the login form.
- Existing `apps/backend/.env` was used without exposing or changing secret values. Frontend uses its development fallback API URL because `apps/frontend/.env.local` is absent.
- Both ports were free before startup and are now owned by the expected Node processes.
- Non-blocking observation: persistence of an unauthenticated request telemetry event to external Supabase logged `fetch failed`; local backend health remains `200`.

## Backend Root Route

- [x] Diagnose `/` returning the global 404 response while `/api/*` routes are mounted.
- [x] Add a minimal backend root response that points clients to the API health endpoint.
- [x] Verify `/` and `/api/health` against the running backend server.

## Login Fetch Failure

- [x] Confirm login reaches the backend and fails while contacting Supabase auth.
- [x] Check Supabase URL reachability and environment loading without exposing secrets.
- [x] Improve backend auth error handling so network/config failures return actionable messages.
- [x] Verify login failure mode and backend lint/tests after the change.

## Context Read

- [x] Existing `audit_logs` table stores tenant, actor, action, entity type/id, metadata, created timestamp.
- [x] Existing audit API supports basic tenant-scoped list with date/action/entity type filters.
- [x] Existing billing SQL functions already insert critical invoice finalized/voided/reprinted events.
- [x] Existing services write audit rows for orders, settings, restaurant updates, printer settings, PDF/thermal prints.
- [x] Existing frontend has no audit viewer route.

## Architecture Decisions

- Keep `audit_logs` as the compliance event table and enhance it additively.
- Add immutable/tamper-resistant DB triggers for audit rows: no updates/deletes.
- Add event category and before/after state columns for searchable compliance history.
- Keep critical billing events backend-authoritative through SQL functions and service audit helper.
- Add CSV/JSON export endpoints that remain tenant-scoped and paginated/filterable.
- Add a frontend audit viewer under `/audit` with filters, pagination, CSV export, and event detail modal.
- Keep audit payloads sanitized and bounded; detailed metadata remains available in detail modal/export.

## Database Changes

- [x] Add audit columns: `event_category`, `before_state`, `after_state`, `request_id`, `correlation_id`, `ip_address`, `user_agent`, `immutable`.
- [x] Add audit indexes for tenant/date/category/action/entity/actor filtering.
- [x] Add immutable audit trigger blocking update/delete.
- [x] Backfill/infer categories for existing rows through defaults/helper.

## Backend Changes

- [x] Extend `writeAuditLog` helper to accept category, before/after state, metadata, and request context.
- [x] Update audit log list API with category, entity id, actor id, search, pagination metadata.
- [x] Add audit export endpoint supporting CSV and JSON.
- [x] Add invoice lifecycle/history endpoint for invoice-linked audit records.
- [x] Preserve tenant access checks for all audit reads/exports.
- [x] Ensure CSV export escapes fields safely.

## Frontend Changes

- [x] Add audit types and API client methods.
- [x] Add `/audit` route and app-shell navigation item.
- [x] Add audit history view with category/search/date filters.
- [x] Add event detail modal for before/after/metadata snapshots.
- [x] Add CSV export action.

## Verification Results

- [x] Backend tests for filtering and tenant access query shape: `npm --workspace apps/backend run test -- audit-logs.service.spec.ts`.
- [x] Backend tests for CSV export escaping: `npm --workspace apps/backend run test -- audit-logs.service.spec.ts`.
- [x] Backend tests for category inference: `npm --workspace apps/backend run test -- audit-logs.service.spec.ts`.
- [x] Full backend tests: `npm --workspace apps/backend run test` (14 suites, 34 tests).
- [x] Backend lint: `npm --workspace apps/backend run lint`.
- [x] Backend build: `npm --workspace apps/backend run build`.
- [x] Frontend lint: `npm --workspace apps/frontend run lint`.
- [x] Frontend build intentionally not run because dev server may be active; project lesson says to stop dev server first.

## Remaining Risks

- Existing old audit rows may have sparse metadata and no before/after snapshots.
- Full RBAC for audit access is future work; current tenant membership is enforced.
- Long-term retention/archive/SIEM export is prepared by schema shape but not implemented.

## Fast Offline Draft Count

- [x] Move pending billing draft count hydration to the app-level offline provider.
- [x] Emit a local browser event whenever the offline billing queue changes.
- [x] Recompute the count on active restaurant changes, storage changes, and reconnect.
- [x] Keep the billing page sync logic unchanged except for using the faster count helper.
- [x] Verify frontend lint after the change: `npm --workspace apps/frontend run lint`.

## Accurate Offline Banner

- [x] Stop showing the global offline banner solely because saved drafts exist.
- [x] Treat client/validation API errors as request failures, not internet degradation.
- [x] Keep network/server failures as degraded connection signals.
- [x] Emit degraded connection signals for real fetch/network failures.
- [x] Verify frontend lint: `npm --workspace apps/frontend run lint`.

## Dashboard Item Movement Fix

- [x] Use finalized invoices issued today as the dashboard source of truth.
- [x] Aggregate top item quantity from order items linked to today's finalized invoices.
- [x] Keep recent bills scoped to finalized invoices.
- [x] Refresh the dashboard when an invoice is generated in the current tab or another tab.
- [x] Add a focused backend test for dashboard top item aggregation.
- [x] Run backend test/lint/build and frontend lint.

## Invoice QR And Category Delete

- [x] Remove QR code generation from invoice print payloads.
- [x] Remove QR image rendering/CSS from browser print preview.
- [x] Add tenant-safe category delete API.
- [x] Add menu-management delete button for categories.
- [x] Refresh menu caches and unassign affected items after category removal.
- [x] Disable invoice QR defaults/settings toggle.
- [x] Run backend/frontend verification.

## UI Spacing And Density Pass

- [x] Review local UX design guidance and existing frontend layout primitives.
- [x] Normalize app shell page padding and shared page header spacing.
- [x] Tighten shared card/table spacing for POS operational readability.
- [x] Apply consistent responsive gaps to dashboard, menu, orders, audit, and settings pages.
- [x] Run frontend lint verification.

## Thermal Print Width Handling

- [x] Add best-effort browser print media width detection.
- [x] Rebuild invoice print HTML with detected 58mm/80mm width when available.
- [x] Make receipt CSS fluid so print layout uses the printable width.
- [x] Constrain preview width for mobile while preserving stored paper-width preview.
- [x] Save detected paper width back to tenant printer settings after print starts.
- [x] Run frontend lint verification.

## Production Print Engine Hardening

- [x] Introduce explicit print layout targets for 58mm thermal, 80mm thermal, and A4 invoice rendering.
- [x] Refactor browser invoice HTML into deterministic sections with printer-safe grid columns.
- [x] Harden thermal CSS so financial columns never wrap and A4 fallback remains readable.
- [x] Improve preview controls and copy so operators understand thermal width vs PDF fallback.
- [x] Add backend text receipt tests for long item names, GST/totals alignment, and 58mm/80mm widths.
- [x] Run frontend lint, frontend typecheck, and backend invoice tests.

## Production API URL And CORS Fix

- [x] Read the pasted root-cause analysis and existing project lessons.
- [x] Attempt graphify query for production API URL/CORS context; unavailable in this shell.
- [x] Inspect frontend API URL, realtime, CSP proxy, and backend CORS/global prefix code.
- [x] Add frontend API URL shape validation with clear deployment errors.
- [x] Align realtime development fallback with the API client fallback.
- [x] Add frontend `.env.example` documenting required public env vars and `/api` suffix.
- [x] Verify frontend lint and production-style frontend build when no dev server is active.
- [x] Review final diff and record deployment env values/results.

### Production API URL And CORS Review

- Frontend lint: `npm --workspace apps/frontend run lint` passed with existing warnings only.
- Frontend production-style build: `NEXT_PUBLIC_API_URL=https://api.qrdines.in/api npm --workspace apps/frontend run build` passed.
- Backend build: `npm --workspace apps/backend run build` passed.
- Required Vercel production value: `NEXT_PUBLIC_API_URL=https://api.qrdines.in/api`.
- Required Render production CORS value: `CORS_ORIGINS=https://qrdines.in,https://www.qrdines.in`.
- `graphify update .` could not be run because `graphify` is not installed in this shell.
