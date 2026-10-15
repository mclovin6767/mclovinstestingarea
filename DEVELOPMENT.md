# Development Guide

This guide describes the current local-development workflow for QR Dines. Run commands from the repository root unless a section explicitly specifies another directory. The package scripts, configuration, SQL, and implementation are authoritative; a command documented here is not a claim that it has passed on your machine or in CI.

## Contents

- [Repository and toolchain](#repository-and-toolchain)
- [Command reference and scopes](#command-reference-and-scopes)
- [First local setup](#first-local-setup)
- [Environment resolution and validation](#environment-resolution-and-validation)
- [Database setup versus migrations](#database-setup-versus-migrations)
- [Demo seeding and account provisioning](#demo-seeding-and-account-provisioning)
- [Daily development](#daily-development)
- [Testing, linting, and typechecking](#testing-linting-and-typechecking)
- [Troubleshooting](#troubleshooting)
- [Database backup and restore](#database-backup-and-restore)
- [Related guides](#related-guides)

## Repository and toolchain

| Location | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json` | npm workspace entry points and the shared dependency lockfile |
| `apps/backend` | NestJS 11 API, Supabase integration, domain services, Jest tests, SQL, and migration/smoke scripts |
| `apps/frontend` | Next.js 16 App Router application, React 19 UI, Zustand stores, frontend Jest and Playwright tests |
| `apps/desktop` | Separate desktop shell; not included in the root workspace command chain |
| `scripts` | Database setup, demo provisioning, backup, and restore utilities |
| `docs` | Architecture, development, operational guidance, and feature specifications |
| `.github/workflows` | CI and operational workflow definitions; inspect these for what is actually automated |

The root workspace declaration includes `apps/backend`, `apps/frontend`, and the glob `shared/*`. Do not infer an implemented shared library from the glob alone. Root `build:all` builds the backend and frontend, not the desktop application.

### Required tools

- **Node.js 22** is the reproducible baseline: both backend and frontend CI select major version 22. The application manifests do not declare an `engines` requirement, so “22” is a repository workflow choice rather than a package-enforced minimum. Avoid assuming every newer major is validated.
- **npm 10+** is the recommended workspace-capable tooling baseline. The repository does not pin an npm version with `packageManager`; use the version supplied with your Node 22 installation unless the team specifies otherwise.
- **Git** and a shell capable of running the documented commands. Database shell scripts require Bash. On Windows, use an appropriate Bash environment for those scripts; the desktop build has a separate workflow.
- A **development Supabase project** with Auth and its PostgreSQL database for full-stack manual work. A bare PostgreSQL database alone does not provide `auth.users`, `auth.uid()`, Supabase roles, Auth APIs, or Storage.
- **`psql`** on `PATH` for initial schema application and the migration runner. Install PostgreSQL client tools compatible with your database. **`pg_dump` / `pg_restore`** are needed only for backups/restores.
- **Chromium installed through Playwright** for browser tests. Linux CI also installs browser system dependencies.

Redis, Sentry, transactional email, and Cashfree credentials are not prerequisites for isolated frontend tests or ordinary unit tests. They are required only to exercise their corresponding integration behavior. Docker is needed for image validation, not for running the two Node development servers.

Check the active runtime before installing:

```bash
node --version
npm --version
npm ci
```

Install at the root using the committed lockfile. Use `npm install --workspace apps/frontend <package>` or the backend equivalent only when intentionally changing dependencies, and review both the affected manifest and root lockfile. Avoid separate accidental lockfiles inside the two web workspaces.

## Command reference and scopes

### Root commands

| Command | Actual action |
| --- | --- |
| `npm run dev` | Backend only: `nest start --watch` |
| `npm run dev:backend` | Same backend watcher as `dev` |
| `npm run dev:frontend` | Frontend only: `next dev` |
| `npm run build` | Backend only: `nest build` |
| `npm run build:backend` | Explicit alias for backend build |
| `npm run build:frontend` | Frontend only: `next build` |
| `npm run build:all` | Backend build followed by frontend build; stops if the first fails |
| `npm test` | Backend Jest suite only |
| `npm run lint` | Backend ESLint over `src/**/*.ts` only |
| `npm run lint:frontend` | Frontend ESLint (`eslint .`) |
| `npm run audit` | Root dependency audit with `--omit=dev --audit-level=high`; not limited to the backend simply because the backend workflow calls it |
| `npm run audit:full` | Full root dependency audit, including development dependencies |
| `npm run check` | Backend lint, backend tests, backend build, then production dependency audit, chained with `&&` |
| `npm run docker:build` | Builds the root Dockerfile as `qr-dines-backend:latest` |
| `npm run db:setup` | Applies `schema.sql`, then `rls.sql`; does not run the migration directory |
| `npm run seed:demo` | Runs the privileged Supabase demo-data script |
| `npm run backup:db` | Runs the PostgreSQL dump and local retention script |
| `npm run restore:db` | Runs the destructive PostgreSQL restore script |

**There is no root command that starts both development servers. `npm run check` does not cover frontend lint, frontend typechecking, frontend tests, frontend build, browser tests, database migrations, or deployed-service health.**

### Workspace-only commands

```bash
npm --workspace apps/backend run migrate:status
npm --workspace apps/backend run migrate
npm --workspace apps/backend run migrate:baseline
npm --workspace apps/backend run smoke -- http://localhost:3001
npm --workspace apps/backend run start:prod
npm --workspace apps/frontend run test:unit
npm --workspace apps/frontend run test:e2e
npm --workspace apps/frontend run start
```

Backend `start` and `start:prod` both execute `node dist/main.js`; build first. Frontend `start` executes `next start --port 3000`; it also requires a completed production build. The Playwright server uses its own port, 3100.

## First local setup

### 1. Install and prepare configuration

After `npm ci`, copy the examples **only if the destination files do not already exist**:

```bash
cp apps/backend/.env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Edit the copies locally; never put real secrets in the examples. At minimum, replace the backend Supabase URL, service-role key, and JWT secret with values from the same development project. Set the frontend API address explicitly:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

For database administration, configure the development database connection separately as `DATABASE_URL`. It is a PostgreSQL connection string, not the Supabase HTTP API URL. See the resolution table below before using scripts: they do **not** all load the same file.

### 2. Prepare the development database

Decide whether you are using an empty project or an already provisioned project. Read [Database setup versus migrations](#database-setup-versus-migrations) before executing SQL. For a genuinely empty Supabase project, the expected sequence is base schema and RLS, followed by reviewed pending migrations—not `db:setup` alone.

Use a disposable project when first validating the SQL sequence. No database setup or migration execution is implied by this guide, and the repository does not provide a single command that verifies the entire provisioning path.

### 3. Start both servers in separate terminals

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Defaults:

| Service | Address |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend root identity response | `http://localhost:3001/` |
| Backend API prefix | `http://localhost:3001/api` |
| Health endpoint | `http://localhost:3001/api/health` |
| Readiness endpoint | `http://localhost:3001/api/health/ready` |

A listening port or successful root response does not establish database readiness. Review `/api/health/ready` and backend startup diagnostics before diagnosing a UI failure as a frontend problem.

### 4. Obtain a development account and workspace

The current API exposes public `/api/auth/signup`, separate from token-protected `/api/auth/register`. Use the signup/onboarding screens or a deliberately provisioned development account. A Supabase Auth user by itself is not a restaurant membership; signed-in users without a linked workspace are sent to onboarding.

Demo seeding is optional. Read its side effects before use. It is not a replacement for migrations, subscription configuration, table creation, or payment-provider setup.

## Environment resolution and validation

### Each entry point resolves configuration differently

| Entry point | Resolution behavior |
| --- | --- |
| Backend runtime | `src/config/environment.ts` searches upward from `process.cwd()` for the nearest `.env`, then loads it with dotenv without overriding already exported values. A workspace-local `apps/backend/.env` can therefore shadow the root file. The custom loader skips this search when `JEST_WORKER_ID` is present. |
| Nest configuration | `AppModule` also imports `ConfigModule.forRoot()`. Do not assume the custom Jest skip prevents every possible dotenv read by code that imports the full module. Keep test infrastructure mocked and real secrets out of test invocations. |
| `db:setup` | Uses exported `DATABASE_URL`; if empty, reads only the root `.env` using a simple line match. It extracts `DATABASE_URL=...` and removes surrounding quotes. It is not a general dotenv loader. |
| Backend migration commands | Use exported `DATABASE_URL`; otherwise read `apps/backend/.env` only. They do **not** search the root `.env`. The fallback parser expects an exact `DATABASE_URL=` line and trims whitespace but does not implement full dotenv quoting or expansion. |
| `seed:demo` | Loads the root `.env` with dotenv, preserving existing exported values; uses Supabase HTTP credentials, not the PostgreSQL connection string. |
| Backup/restore | Require exported variables. Neither script loads an env file. |
| Smoke script | Reads exported `SMOKE_*` variables and an optional positional base URL; does not load dotenv. |
| Frontend | Uses Next.js environment loading from the frontend project directory; `apps/frontend/.env.local` is the normal developer file. The root backend `.env` is not a shared browser configuration file. |

Next.js resolves an existing environment variable before env files, then uses `.env.$NODE_ENV.local`, `.env.local` (except in test mode), `.env.$NODE_ENV`, and `.env`. Restart the dev server after changing configuration. A production browser bundle must be **rebuilt** after changing a `NEXT_PUBLIC_*` value; changing only the server's runtime environment does not rewrite JavaScript already sent to browsers.

Prefer exporting database credentials through your team's secure environment mechanism. If using a local shell-compatible `.env`, review it first: `source .env` executes shell syntax, and ordinary dotenv values such as an unquoted display name with spaces may not be shell-safe. Do not blindly source a template or an untrusted file.

### Backend startup validation

`apps/backend/src/config/environment.ts` validates:

| Variable | Rule / default |
| --- | --- |
| `SUPABASE_URL` | Required, nonblank |
| `SUPABASE_SERVICE_ROLE_KEY` | Required, nonblank; private server credential |
| `SUPABASE_JWT_SECRET` | Required, nonblank, including when using projects with other JWT verification paths |
| `NODE_ENV` | Recognizes `development`, `test`, `production`; otherwise resolves to `development` |
| `PORT` | Defaults to 3001; must be an integer from 1 through 65535 |
| `CORS_ORIGINS` | Comma-separated, trimmed list; required in production; literal `*` prohibited in production |
| `TRUST_PROXY_HOPS` | Defaults to 0; integer from 0 through 5 |

Presence validation is not a credential or connectivity test. Placeholder keys can satisfy the nonblank check and still fail readiness, login, or database access. `DATABASE_URL` is not required by this runtime validator; it is used by administrative scripts rather than the normal Supabase HTTP data path.

In development, an empty CORS list causes the API to reflect origins. Prefer an explicit local list. Include the actual browser origin, including its port: `localhost` and `127.0.0.1` are different origins. `APP_BASE_URL` is the **frontend origin** used for application links, not the `/api` base URL. Configure it consistently with CORS for email and payment-return flows.

Set proxy hops only to match a known proxy topology. It changes request IP interpretation and therefore rate-limiting behavior; it is not a generic workaround for 429 responses.

### Public versus private values

| Value family | Where it belongs |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser-visible backend API base URL; no embedded credentials |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Present in the frontend example, but the current frontend data/auth client calls NestJS rather than constructing a Supabase browser client. They are not substitutes for backend secrets. An anon key, if used in a future client, is public and depends on proper authorization/RLS. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional browser monitoring DSN; treat browser event contents as potentially sensitive |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` | Server/admin only; never prefix with `NEXT_PUBLIC_`, place in UI state, or attach to screenshots/logs |
| `AUTH_REGISTRATION_TOKEN`, `CRON_SECRET` | Private endpoint-control secrets |
| `RESEND_API_KEY`, Cashfree secret/webhook credentials, Redis passwords | Private backend integration credentials |
| `SENTRY_DSN`, `SENTRY_RELEASE` | Server instrumentation configuration; not automatically shared with the browser |

The frontend client accepts only an absolute `http:` or `https:` API URL whose normalized path is **exactly `/api`**, with no query string or fragment. `/backend/api`, a relative `/api`, a bare hostname, or the literal text `NEXT_PUBLIC_API_URL` is invalid. Trailing slashes are normalized by the shared client. Set the canonical no-trailing-slash form to avoid differences in code paths that construct URLs directly.

### Optional integrations

- **Redis:** supports shared rate-limit state and realtime fan-out. The backend can start without a working Redis connection, but a local fallback is not evidence that a multi-replica deployment behaves correctly. `REDIS_URL` takes precedence over discrete host/port credentials; use the backend example as the variable inventory.
- **Email:** Resend is used for invitation and password-reset delivery. No API key means delivery is unavailable; a successful UI interaction does not prove an email reached its recipient. Real delivery needs a verified sender domain and appropriate `MAIL_FROM`. Configure `APP_BASE_URL` for links back to the frontend.
- **Payments/subscriptions:** use sandbox Cashfree credentials for development. Checkout, signed webhooks, payment reconciliation, and invoicing are separate behaviors. A mocked browser checkout does not test provider settlement or webhook delivery. See the payments guide before enabling a live integration.
- **Scheduled jobs:** `CRON_SECRET` enables protected internal job calls. The presence of a secret does not schedule a job by itself.
- **Monitoring:** backend and frontend have separate instrumentation entry points. Configure the relevant side and redact sensitive application data; do not assume enabling one enables both.

The comment in the backend env example about public registration being disabled should not be read as disabling all signup. The source distinguishes guarded `POST /auth/register` from public, rate-limited `POST /auth/signup`.

## Database setup versus migrations

### What `db:setup` actually does

`scripts/setup-supabase-db.sh` resolves `DATABASE_URL`, rejects an unset URL and the literal `[YOUR-PASSWORD]` placeholder, then invokes:

```bash
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file=apps/backend/supabase/schema.sql \
  --file=apps/backend/supabase/rls.sql
```

The sequence is **schema first, RLS second**. It does not:

- create a Supabase project or configure Auth/Storage;
- run `supabase/migrations/*.sql`;
- execute `performance-hardening.sql` or `seed.sql`;
- create demo users or check all application flows;
- write `public.schema_migrations` records;
- wrap both files in one all-or-nothing transaction.

`ON_ERROR_STOP` stops on SQL failure, but earlier statements can remain committed. Inspect a partially initialized project before retrying. Do not assume rerunning the base schema is a harmless migration strategy: it includes data upserts and function replacements as well as `IF NOT EXISTS` DDL.

The base SQL includes many accumulated features, but it is **not a complete snapshot of every migration**. For example, later migrations add menu descriptions, subscription-provider fields, guest payment intents, online-payment metrics, and reconciliation fields; security hardening also lives in the migration directory. `rls.sql` covers a subset of the later tables. A base-only installation is not equivalent to the latest migrated database.

### Empty development project

After selecting an isolated Supabase target and configuring `DATABASE_URL` for each script:

```bash
npm run db:setup
npm --workspace apps/backend run migrate:status
npm --workspace apps/backend run migrate
```

Review the pending SQL before applying it. The migration runner assumes prerequisite base tables already exist; it is not an empty-database initializer. Run the sequence on a disposable project before relying on it for a shared environment. Once applied, inspect migration status, readiness, login, workspace selection, and the specific feature you need.

Do not use `migrate:baseline` on a fresh project merely because `db:setup` completed. The base schema does not include every migration effect.

### Existing development or shared project

```bash
npm --workspace apps/backend run migrate:status
npm --workspace apps/backend run migrate
```

The runner:

1. Reads SQL filenames from `apps/backend/supabase/migrations` in lexicographic order.
2. Reads applied names from `public.schema_migrations`.
3. Creates the tracking table when applying migrations if needed.
4. Applies each unrecorded file inside its **own transaction**, recording its filename in that transaction.
5. Stops at the first failure; prior successful files remain committed and recorded.

`migrate:status` passes `--dry-run`: it lists pending files without applying them, but still needs `psql`, credentials, and a reachable database. It is a tracking-table comparison, not a semantic schema diff. The runner catches errors reading the tracking table as an empty applied set, so inspect connection/permission errors rather than automatically trusting an “all pending” report. Applied filenames have no checksum: editing an already recorded migration does not cause it to run again.

`migrate:baseline` records **all current migration filenames without executing their SQL**. Use it only when the database has independently been verified to contain every current migration effect, such as a fully hand-migrated database being adopted by the runner. It is not a repair operation or a way to skip failed migrations. A partly upgraded database needs reconciliation with its real history before baselining.

### Adding database changes

- Add a new ordered SQL migration for existing databases; do not rely on editing `schema.sql` alone.
- Keep the base schema aligned where appropriate, while recognizing that one-time backfills belong in migrations.
- Review table policies, function grants, tenant filtering, constraints, indexes, triggers, and any readiness-column inventory affected by the change.
- Prefer backward-compatible changes and explain data backfills, locks, and rollout ordering in the PR.
- Apply and validate necessary migrations before deploying code that requires them. Backend startup/build does not run the migration script.
- Do not reapply `schema.sql` after migrations as a routine reset: older function definitions or catalog values can overwrite newer behavior.

For a missing PostgREST column/function after successful DDL, a schema-cache reload may help:

```sql
notify pgrst, 'reload schema';
```

This does not create a missing column or fix SQL that never executed.

## Demo seeding and account provisioning

### Required seed inputs

`npm run seed:demo` uses `scripts/seed-demo-data.mjs`, the root `.env`, and Supabase's service-role HTTP client. It requires:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`;
- `DEMO_OWNER_EMAIL` and `DEMO_OWNER_PASSWORD`, both explicitly supplied;
- optional `DEMO_RESTAURANT_CODE`, uppercased, defaulting to `DEMO`.

It does **not** require `DATABASE_URL` to execute. Its database-ready probe only checks that a `restaurants` query works; this is not a complete schema or migration check.

### Side effects and safeguards

Use a dedicated disposable development account and a restaurant code that cannot collide with real data. The implementation:

- creates an Auth user or **updates the password and metadata of an existing user with the supplied email**;
- upserts a restaurant by code and links the user as owner;
- creates/updates sample categories and five menu items;
- upserts tax, invoice, brand, contact, and printer settings;
- creates a sample order/invoice if its generated invoice number is absent and advances the associated invoice sequence as needed;
- **prints the supplied password to standard output on success**.

Do not run it in a shared terminal recording, paste its complete output into an issue, or store its output as a CI artifact. Do not assume reruns preserve existing account credentials or settings. Although much of the script uses upserts, the full operation is not transactional; an error can leave partial data.

The production guard refuses execution only when `NODE_ENV === 'production'` and `ALLOW_PRODUCTION_DEMO_SEED !== 'true'`. This does not identify a production database URL. A shell marked `development` can still target a real project. Verify the project and account before running; the override is not a recommended workflow.

The script does not create table QR tokens, comprehensively configure subscriptions, or configure email/payment services. Seeded demo data is not equivalent to completing every onboarding feature.

## Daily development

### Backend changes

Start with the domain module under `apps/backend/src`: controllers describe routes and guards; DTOs describe input validation; services implement tenant-scoped behavior. `main.ts` sets the global `/api` prefix, request tracing, CORS, body handling, and global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and transformation enabled.

When adding request fields, update the relevant DTO, service, API-client payload, and domain types together. An extra JSON property may be rejected rather than silently accepted. Maintain membership, role/capability, and plan-entitlement checks; a restaurant ID supplied by the browser is not authorization. The service-role database client makes backend authorization especially important.

### Frontend changes

Use `apps/frontend/README.md` for routes, feature boundaries, store hydration, API conventions, printing, and offline limitations. Route files are generally composition points; feature implementations live under `src/features`, shared UI under `src/components`, and transport logic under `src/lib`.

Stop the frontend watcher before running a production build. `next dev` and `next build` both use `.next`; concurrent writes can produce stale/missing chunks and misleading type errors.

### Manual feature verification

Choose checks matching the change rather than treating a successful login as comprehensive validation:

- Authentication: signup/login, refresh, password reset or invite flow as applicable, then workspace selection.
- Authorization: owner and restricted staff behavior, a second tenant, denied API responses, and missing entitlement/error states.
- Billing: totals, round-off, finalize retry behavior, invoice history, PDF/receipt, and reprint without creating a new invoice.
- Guest ordering: a real development table token, menu availability/options, placed-order tracking, incoming queue, and tab checkout.
- Payments: sandbox quote/checkout, verified backend payment state, and staff invoice finalization; browser return alone is not settlement proof.
- Offline/printing: test loss of connectivity and device errors with disposable data. Preserve pending browser queues while troubleshooting.

## Testing, linting, and typechecking

### Lint and TypeScript commands

```bash
npm run lint
npm run lint:frontend
npx tsc --noEmit -p apps/frontend
npx tsc --noEmit -p apps/backend
```

The frontend TypeScript command is the exact command in `.github/workflows/frontend-ci.yml`. Neither root nor workspace manifest defines a `typecheck` script. The backend no-emit command is a direct compiler invocation using its existing `tsconfig.json`, not a named script or a separate CI step. The backend build also compiles production source, while `tsconfig.build.json` excludes `**/*spec.ts`; the broader no-emit project check includes source tests.

Backend lint uses ESLint 8 and `.eslintrc.cjs`. Frontend lint uses ESLint 9, native flat configuration, and the Next.js 16 rules. There is no `next lint` step. Some frontend React compiler-analysis rules are intentionally warnings; warnings and test failures are different outcomes and should be reported accurately.

TypeScript uses incremental metadata, and the frontend includes generated `.next` types. A no-emit check is not a promise of zero filesystem writes. Missing/stale generated route types may require a clean frontend build; do not fix such errors by committing generated output or weakening types.

### Backend Jest

```bash
npm test
npm --workspace apps/backend run test -- audit-logs.service.spec.ts
npm --workspace apps/backend run test -- --runInBand
npm --workspace apps/backend run test -- --coverage
```

`apps/backend/jest.config.js` discovers `*.spec.ts`, transforms with `ts-jest`, and uses the Node environment. Tests include service/utility cases and HTTP-level regression suites. For example, the cross-tenant suite boots Nest and exercises routes with Supertest but replaces Supabase, Redis, and observability with test doubles. These tests do not prove that real PostgreSQL policies, deployed services, email, or payment providers work.

Ordinary tests should not require production credentials. Inspect a new test's setup before running it against any real service. Coverage collection is available but a configured coverage directory is not an achieved percentage or a comprehensive integration claim.

### Frontend Jest unit and render tests

```bash
npm --workspace apps/frontend run test:unit
npm --workspace apps/frontend run test:unit -- --runInBand
npm --workspace apps/frontend run test:unit -- order-tracker-logic.unit.test.ts
```

The frontend Jest configuration uses jsdom, Testing Library setup, `ts-jest`, and the `@/` alias. It intentionally matches only `src/**/*.unit.test.ts` and `src/**/*.render.test.tsx`; `e2e/*.spec.ts` belongs to Playwright. Existing areas include guest tracker logic/rendering, menu navigation, brand-theme logic, and sound preferences. No backend, real login, or browser installation is needed for these isolated tests.

### Frontend Playwright

Prepare a production frontend build, not just a running dev server:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com/api npm run build:frontend
```

Install the browser from `apps/frontend`:

```bash
npx playwright install chromium
```

Linux CI uses `npx playwright install --with-deps chromium` in that directory. Return to the root for:

```bash
npm --workspace apps/frontend run test:e2e
npm --workspace apps/frontend run test:e2e -- e2e/login.spec.ts
npm --workspace apps/frontend run test:e2e -- e2e/guest-menu.spec.ts
```

`playwright.config.ts` runs Desktop Chrome/Chromium only, starts `next start --port 3100`, and uses `http://localhost:3100`. It reuses an existing server outside CI; stop stale servers to avoid testing the wrong build. CI forbids focused tests, retries once, and captures a trace on the first retry.

The browser API is mocked through route interception. Tests cover selected login/signup/invite, dashboard-resilience, entitlement-navigation, guest-menu/cart/tracker/payment UI behavior. They do not need a real Supabase project and do not constitute full-stack payment or authorization testing. Browser interception does not intercept Next server-side metadata fetches: public pages may still attempt best-effort requests to the placeholder base and fall back when unavailable.

The placeholder build is for mocked tests only. Rebuild with the correct local API URL before returning to real manual development or serving it as a production artifact. Do not assume a runtime environment override changes the compiled browser base.

### Live smoke test

Use an explicit **backend origin without `/api`**:

```bash
npm --workspace apps/backend run smoke -- http://localhost:3001
```

The script appends `/api`, checks root and readiness, and optionally exercises login, restaurant listing, and subscription resolution if exported `SMOKE_EMAIL` and `SMOKE_PASSWORD` are both set. Use a dedicated low-risk test account with a workspace; otherwise the authenticated path is skipped or may not reach subscription checking.

Do not omit the target casually: the script's fallback is a deployed backend address, not localhost. It needs a running backend and its real dependencies; it is distinct from Jest and frontend mocked e2e tests.

### What CI configuration establishes

Backend CI declares install, production-dependency audit, backend lint/tests/build, and Docker image build. Frontend CI declares lint, `npx tsc --noEmit -p apps/frontend`, build, and a separate mocked Playwright job. The current frontend workflow does not invoke `test:unit`. Neither workflow definition is evidence of a passing run, a verified migration, or a healthy deployment. Record actual commands, results, warnings, and skipped prerequisites in your PR.

## Troubleshooting

| Symptom | Check in this order |
| --- | --- |
| Backend reports missing required variables | Confirm the nearest `.env`, exported overrides, nonblank required values, and the npm workspace working directory. Do not print secret values to debug precedence. |
| Migration command cannot find `DATABASE_URL` although backend starts | Export it for the migration process or configure its backend-local fallback. The migration runner does not load root `.env`. |
| `psql` cannot connect | Confirm client installation, development target, password/URI encoding, DNS/network access, and connection mode. Do not paste an unredacted URL into a ticket. |
| `db:setup` completed but a feature reports missing columns | Check pending migrations and the exact SQL error. Base setup does not apply the migration directory. |
| Readiness fails while `/` returns 200 | Inspect the failed readiness checks and schema prerequisites. Root response proves process availability, not dependency health. |
| API validation error before any request | Check `NEXT_PUBLIC_API_URL`: absolute HTTP(S), path `/api`, no query/hash. Restart/rebuild after changing it. |
| Browser CORS or CSP failure | Check the actual frontend origin in backend CORS and API origin in the compiled frontend configuration. CSP is defined in `src/proxy.ts`; CORS and CSP are separate controls. |
| Login succeeds but onboarding appears | Verify a restaurant membership exists and the tenant list was loaded. Do not patch client state to invent access. |
| Owner navigation is missing or stuck loading | Inspect the subscription/role request, required database columns, and entitlement error/retry state. Unknown role is not automatically staff or owner. |
| Login loop after a backend outage | Auth verification and refresh both require the API; failed refresh clears session/tenant state. Check API health before clearing all browser storage. |
| 400 response after adding a payload property | Update the DTO and client contract together; global validation rejects non-whitelisted fields. |
| 429 responses | Inspect API and Supabase auth limits, shared-IP behavior, and proxy configuration. Do not indiscriminately disable throttling. |
| Guest QR URL fails or ordering is paused | Use a real development table token and check table activity, pause state, restaurant entitlement, and public API response. An arbitrary token is not a demo route. |
| Browser test says no production build | Build frontend first; Playwright starts `next start`, not `next dev`. |
| Playwright cannot launch Chromium | Install its browser in the frontend directory; Linux may also need `--with-deps`. |
| Tests run against unexpected content | Check port 3100 for a reused server and rebuild with the intended API placeholder. |
| Printer says ready but no paper appears | Browser availability is not physical-device detection; check the OS print queue, chosen device, paper size, user cancellation, and adapter selection. |
| Offline draft disappears | Check the 24-hour draft TTL, browser profile/origin, storage deletion/quota, and whether it was moved into the pending queue. Local storage is not a durable server backup. |

### Stale Next.js chunks or generated types

For errors such as a missing `.next` chunk, stop all frontend dev/build processes first. Remove only `apps/frontend/.next`, then restart the frontend or rebuild. Never run a production build concurrently with the dev watcher. If TypeScript errors point into generated route types, repeat the clean-build procedure before changing application code.

Do not clear all site storage as the first troubleshooting step: it can delete sessions, offline bills, carts, cached menus, and print jobs. Reconcile pending data first. Never attach browser storage dumps containing tokens or customer data to an issue.

## Database backup and restore

These scripts operate on whichever database is in exported `DATABASE_URL`. They do not prompt for environment confirmation, load dotenv, or provide a managed disaster-recovery service.

### Backup

After securely exporting the intended database URL:

```bash
npm run backup:db
```

`scripts/backup-postgres.sh` requires `pg_dump`, creates a custom-format dump with `--no-owner --no-privileges`, and writes `backups/qr-dines-<UTC timestamp>.dump` by default. `BACKUP_DIR` changes the directory; `BACKUP_RETENTION_DAYS` defaults to 14. On success it deletes matching local dump files older than the retention window. Store backups securely and separately from source control; they can contain sensitive application data. This PostgreSQL dump is not a backup of external Storage objects, provider configuration, or secret management.

### Restore

Use a disposable restore target first and review what will be replaced:

```bash
BACKUP_FILE=backups/qr-dines-YYYYMMDDTHHMMSSZ.dump npm run restore:db
```

`scripts/restore-postgres.sh` requires `DATABASE_URL`, an existing `BACKUP_FILE`, and `pg_restore`. It runs `--clean --if-exists --no-owner --no-privileges`, replacing database objects covered by the dump. There is no interactive safety prompt or production guard, and the script does not request a single transaction. Read the complete restore output and verify database state afterward; a restore command is not proof of a successful recovery drill.

After restoring, check migration history, dependencies, readiness, dedicated-account login, and representative data. Do not seed over real restored accounts to “repair” access.

## Related guides

- [Contribution workflow](../CONTRIBUTING.md)
- [Frontend developer guide](../apps/frontend/README.md)
- [Architecture](ARCHITECTURE.md)
- [Deployment](DEPLOYMENT.md)
- [Observability](OBSERVABILITY.md)
- [Payment go-live guidance](PAYMENTS_GO_LIVE.md)
- [Security reporting](../SECURITY.md)
