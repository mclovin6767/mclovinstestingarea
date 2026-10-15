# Contributing to QR Dines

Use this guide to plan, implement, validate, and review changes to the QR Dines repository. For full local provisioning instructions, see [Development Guide](docs/DEVELOPMENT.md); for UI internals, see the [Frontend Guide](apps/frontend/README.md). Follow the [Code of Conduct](CODE_OF_CONDUCT.md) and report sensitive issues through [SECURITY.md](SECURITY.md).

## Contents

- [Repository boundaries](#repository-boundaries)
- [Prepare a development environment](#prepare-a-development-environment)
- [Plan and implement a change](#plan-and-implement-a-change)
- [Code and contract conventions](#code-and-contract-conventions)
- [Database changes](#database-changes)
- [Tests and quality checks](#tests-and-quality-checks)
- [Security and data handling](#security-and-data-handling)
- [Documentation changes](#documentation-changes)
- [Commits and pull requests](#commits-and-pull-requests)
- [Bug reports and review follow-up](#bug-reports-and-review-follow-up)

## Repository boundaries

| Area | Start here |
| --- | --- |
| Backend behavior | `apps/backend/src/<domain>` controllers, DTOs, services, guards, and adjacent `*.spec.ts` tests |
| Frontend behavior | `apps/frontend/src/app` route composition and `src/features/<domain>` implementation |
| Shared UI and state | `apps/frontend/src/components`, `src/stores`, `src/types/domain.ts` |
| Browser-to-API contract | `apps/frontend/src/lib/api/client.ts` and corresponding backend routes/DTOs |
| Database schema and upgrades | `apps/backend/supabase/schema.sql`, `rls.sql`, `migrations/*.sql` |
| Script behavior | Root `scripts` and `apps/backend/scripts` |
| Automation | `.github/workflows` and package manifests, not assumptions based on job names |
| Desktop shell | `apps/desktop`; separate from the root backend/frontend build chain |

The root is an npm workspace repository with a committed lockfile. `shared/*` is a workspace glob, not evidence that any particular shared package exists. Root `dev`, `test`, `lint`, and `build` are **backend-only**. Keep changes scoped to the feature and its actual dependencies; do not sweep generated files, unrelated local edits, or another contributor's work into your PR.

Read `AGENTS.md` for repository-specific tooling instructions when using an assistant. Knowledge-graph output can help navigation, but source and configuration remain authoritative. Do not describe a unavailable tool, a stale graph, or an unexecuted check as successful validation.

## Prepare a development environment

### Toolchain

Use Node.js **22** to match backend and frontend CI, and npm **10+** as the recommended baseline. The application manifests do not enforce a Node `engines` range or pin npm through `packageManager`. Do not turn the CI major into a claim that every newer Node version has been tested.

For full-stack work, use a dedicated development Supabase project with Auth. For database scripts install `psql`; for backup/restore also install `pg_dump` and `pg_restore`. Browser tests need Playwright Chromium. Redis, email, Sentry, and Cashfree are optional until the change involves those integrations.

```bash
node --version
npm --version
npm ci
```

Install from the root lockfile. If adding a dependency, choose its correct workspace, distinguish runtime from development tooling, and include the intentional lockfile change. Avoid adding a second lockfile to the backend or frontend workspace.

### Configuration

Copy examples only when the destinations do not already exist:

```bash
cp apps/backend/.env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Configure the backend's `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` from the **same development project**. Use `NEXT_PUBLIC_API_URL=http://localhost:3001/api` for the frontend. Never place service-role keys, JWT secrets, database passwords, or provider secrets in `NEXT_PUBLIC_*` values.

Environment handling differs between entry points:

- Backend runtime searches upward for the nearest `.env`, preserving exported overrides.
- `db:setup` reads an exported `DATABASE_URL` or extracts it from root `.env`.
- Backend migration scripts read an exported `DATABASE_URL` or `apps/backend/.env`, not root `.env`.
- Demo seed uses root dotenv and Supabase HTTP credentials; it does not need `DATABASE_URL` itself.
- Backup, restore, and smoke commands expect exported variables rather than loading dotenv.
- Next.js loads frontend project env files. Browser `NEXT_PUBLIC_*` values are build-time configuration and require a new production build when changed.

See the development guide for exact validation and precedence. Avoid sourcing arbitrary dotenv files as shell scripts or printing the environment to debug configuration.

### Database and first login

For an empty development Supabase project, review the base SQL and migration sequence before executing:

```bash
npm run db:setup
npm --workspace apps/backend run migrate:status
npm --workspace apps/backend run migrate
```

`db:setup` applies `schema.sql` **then** `rls.sql`; it does not run migrations or record history. The base schema is not a complete snapshot of later migrations. Validate this sequence on a disposable target, and do not use it as an automatic reset for an existing migrated database.

For an existing database, inspect pending migrations instead of routinely reapplying the base schema. Do not baseline a fresh or partially migrated project; baselining records filenames without running SQL.

Start backend and frontend in separate terminals:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

Check backend readiness, then use signup/onboarding or a dedicated development account. Public `/auth/signup` is distinct from token-protected `/auth/register`; the registration token is not required by the public signup screen.

### Demo-data warning

`npm run seed:demo` requires explicit `DEMO_OWNER_EMAIL` and `DEMO_OWNER_PASSWORD`. It can reset an existing matching user's password, overwrite restaurant/menu/settings data, and prints the password on success. Its production guard only checks `NODE_ENV`, not the identity of the target database. Never run it with a real owner's email, share its raw output, or treat it as a safe general-purpose bootstrap. Use a disposable account/project and read the development guide's seeding section first.

## Plan and implement a change

1. **Identify the observable problem.** Describe expected and current behavior, affected routes, and whether the issue is UI, API, schema, infrastructure, or an integration boundary.
2. **Read the neighboring implementation and tests.** Reuse the current framework, helpers, component conventions, and domain model before introducing a new abstraction or dependency.
3. **Trace the complete contract.** A new field may require a frontend form, TypeScript domain type, API-client payload, backend DTO/service, SQL migration, test fixture, and documentation update.
4. **Choose a focused scope.** Separate unrelated refactors from behavior changes. Preserve uncommitted edits that you did not create.
5. **Write or update a regression test.** Prefer the narrowest deterministic test that demonstrates the intended behavior; add browser or real-service verification where the boundary demands it.
6. **Handle negative paths.** Include loading, empty, rejected, unavailable, duplicate/retry, and permission-denied behavior rather than only a successful response.
7. **Validate the changed scope and report limits.** List exact commands and outcomes. Distinguish pre-existing failures, new failures, warnings, skipped tests, and external prerequisites.
8. **Prepare a reviewable diff.** Check for generated output, credentials, accidental formatting churn, and changes outside the feature.

For larger changes, agree on the data model, authorization model, migration/rollout sequence, and acceptance criteria before implementation. In payment, tenancy, billing, or printing work, explicitly identify what can be retried and what must not be duplicated.

## Code and contract conventions

### Formatting and tooling

`.editorconfig` specifies UTF-8, LF line endings, a final newline, and two-space indentation. Follow surrounding naming, import, quote, and semicolon conventions rather than reformatting whole files.

The backend uses TypeScript strict mode, Nest decorators, CommonJS output, and ESLint 8 configuration. The frontend uses TypeScript strict mode, the App Router, the `@/*` alias for `src/*`, React 19, and ESLint 9 flat configuration. Frontend lint is the ESLint CLI, not `next lint`.

Use installed libraries and existing utilities where appropriate. Do not assume a dependency is present because it is common elsewhere. Avoid broad lint-rule suppressions or relaxed types simply to make a check pass.

### Backend

- Keep route and input concerns in controllers/DTOs and domain behavior in services.
- Global validation rejects non-whitelisted properties; update DTOs whenever the accepted API shape changes.
- Preserve tenant membership checks, role/capability checks, and entitlement checks as separate concerns.
- Scope database access to the intended restaurant or a verified parent relationship. Not every child table contains a direct `restaurant_id`; for example, line items can derive tenancy through their parent order. Verify that relationship rather than trusting a supplied ID.
- Do not rely solely on RLS to protect calls made with the backend's service-role client.
- Keep financial finalization, immutability, and idempotency behavior aligned with database functions and constraints.
- Treat third-party responses and retries as independent failure points. Do not count a browser redirect as payment settlement or a print request as paper delivery.

### Frontend

- Keep route files focused on composition and route metadata; put feature behavior in `src/features`.
- Use `qrDinesApi` and shared domain types for API changes rather than duplicating base-URL, error, and token handling in every component.
- Respect persisted-store hydration before redirecting. Session/tenant state may not be available on the first render.
- Use role/feature gates for the interface, but retain backend enforcement. Unknown or failed entitlement resolution must not grant owner access or silently masquerade as a resolved downgrade.
- Preserve accessible labels, keyboard behavior, focus management, reduced-motion behavior, and useful loading/error/retry states.
- Avoid accessing browser globals during server rendering. Add client boundaries only where interactive/browser behavior is required.
- When changing caches or persistence, consider versioning, TTL, tenant scoping, storage errors, and pending data before clearing state.
- Treat browser storage as user-controlled, device-local state—not authoritative authorization or a reliable financial ledger.

## Database changes

### Required review points

A schema-dependent change should explain:

- Which tables, columns, indexes, constraints, functions, triggers, or policies change.
- Which application versions work before and after the migration.
- Whether existing records need a backfill and how duplicate or partial data is handled.
- Expected locks, scan cost, data volume, and whether maintenance coordination is needed.
- Tenant and role access for reads, writes, exports, and privileged functions.
- How to validate the result and recover if application rollout fails.

Add a new filename-ordered migration under `apps/backend/supabase/migrations`. Keep the base schema/RLS aligned where appropriate, but do not substitute a base-file edit for an upgrade path. Historical migration files are tracked by filename, not content checksum; modifying a recorded file does not apply the new text to existing databases.

### Runner behavior to preserve

```bash
npm --workspace apps/backend run migrate:status
npm --workspace apps/backend run migrate
```

The runner requires `psql` and a reachable database even for status. It applies unrecorded SQL files lexicographically, one transaction per file, recording successful files in `public.schema_migrations`. A later failure does not roll back earlier completed migrations. Status compares filenames, not actual schema semantics; investigate tracking-table read errors or unexpected “all pending” output.

`migrate:baseline` records every current file without executing it. It is only appropriate for an independently verified, already fully migrated database being adopted by the runner. It is not a way around an error or a fresh-project shortcut.

Apply required migrations before schema-dependent code is deployed. Startup and builds do not auto-migrate. Do not routinely run `db:setup` after migrations, because it can restore older function/catalog definitions. For shared targets, arrange backups and explicit approval rather than treating local commands as permission to alter production.

### Verification expectations

Validate on a disposable database where possible, including required data backfills and the application's readiness checks. Unit tests with mocked Supabase calls do not verify SQL syntax, RLS policies, grants, triggers, or migrations on a real server. A PostgREST schema-cache reload can refresh metadata after DDL; it cannot repair unapplied SQL.

## Tests and quality checks

### Command matrix

All commands below are from the root unless noted.

| Purpose | Command | Scope / prerequisites |
| --- | --- | --- |
| Backend lint | `npm run lint` | ESLint over backend `src/**/*.ts` |
| Frontend lint | `npm run lint:frontend` | Frontend `eslint .` |
| Frontend typecheck | `npx tsc --noEmit -p apps/frontend` | Exact frontend CI command; installed dependencies and relevant generated Next types |
| Backend no-emit typecheck | `npx tsc --noEmit -p apps/backend` | Direct compiler invocation against existing config; includes source specs; not a named script/CI step |
| Backend tests | `npm test` | Jest `*.spec.ts`; includes mocked HTTP regression tests |
| Frontend unit/render tests | `npm --workspace apps/frontend run test:unit` | jsdom; `*.unit.test.ts` and `*.render.test.tsx` under `src` |
| Backend build | `npm run build` | Nest production build; excludes spec files |
| Frontend build | `npm run build:frontend` | Next production build; set the intended public API URL |
| Both web builds | `npm run build:all` | Backend then frontend; not desktop |
| Production dependency audit | `npm run audit` | Root npm dependency tree; omits dev dependencies and fails at high severity or above |
| Full audit | `npm run audit:full` | Includes development dependencies |
| Backend aggregate check | `npm run check` | Backend lint/tests/build and root production dependency audit only |

There is no `npm run typecheck` script. Do not advertise `npm run check` as a complete monorepo check. Frontend unit tests and Playwright require their explicit commands.

### Targeted tests

```bash
npm --workspace apps/backend run test -- audit-logs.service.spec.ts
npm --workspace apps/backend run test -- --runInBand
npm --workspace apps/frontend run test:unit -- order-tracker-logic.unit.test.ts
npm --workspace apps/frontend run test:unit -- --runInBand
```

Place backend tests beside the relevant source with `.spec.ts` names. Frontend Jest deliberately uses `.unit.test.ts` and `.render.test.tsx` names; adding a `.spec.ts` under frontend source does not make it part of that Jest suite.

Mock infrastructure intentionally and state what is not being tested. Existing backend security HTTP suites exercise real Nest routing with fake infrastructure; that is valuable regression coverage, but not a real-database authorization test.

### Browser tests

Stop `next dev` before building to avoid `.next` conflicts. Build from the root:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com/api npm run build:frontend
```

From `apps/frontend`, install Chromium:

```bash
npx playwright install chromium
```

Linux CI uses `npx playwright install --with-deps chromium`. Run from the root:

```bash
npm --workspace apps/frontend run test:e2e
npm --workspace apps/frontend run test:e2e -- e2e/login.spec.ts
```

Playwright serves the built app on port 3100, reusing an existing server outside CI. Make sure an old server is not hiding your changes. These are selected **frontend mocked-API tests**, not a real Supabase/Cashfree end-to-end suite. Server-rendered metadata requests are outside browser route interception and use best-effort fallbacks. Rebuild with the correct real API URL after testing with the placeholder.

When adding browser tests, prefer accessible role/label selectors and route fixtures that reproduce the actual response shape. Cover useful failure states without introducing arbitrary sleeps or dependency on a shared account.

### Live verification

```bash
npm --workspace apps/backend run smoke -- http://localhost:3001
```

The smoke script expects an origin, appends `/api`, and optionally logs in with exported dedicated `SMOKE_EMAIL` / `SMOKE_PASSWORD`. Without an explicit origin it defaults to a deployed backend. It is a live check, not a unit test; use only an intended target and account.

For UI changes include a manual check of affected desktop/mobile layouts and, where relevant, a restricted role. Printing needs real browser/OS/device verification; offline billing needs deliberate reconnect/retry checks with disposable data. Payment changes need sandbox backend/webhook verification beyond mocked checkout UI.

### Reporting validation honestly

The CI files declare checks; they do not prove the current branch passes. Frontend CI currently includes lint/typecheck/build and mocked Playwright but not `test:unit`; backend CI includes audit/lint/tests/build and an image build. None of those automatically validates every SQL migration or hardware integration.

In your PR, report:

- exact commands run and their exit/result status;
- warnings separately from failures;
- any tests skipped and the missing prerequisites;
- any failure reproduced before your changes;
- whether database, live integration, device, or browser checks were mocked or real.

Do not invent coverage percentages, deployment status, or successful checks. If a check is unavailable, say so and give the smallest useful reproduction/validation instructions.

## Security and data handling

- Never commit `.env` copies, credentials, tokens, payment secrets, database dumps, customer exports, or browser-storage snapshots.
- Keep examples as placeholders. Review staged diffs for accidental secrets, including screenshots, logs, test recordings, and copied terminal output.
- `NEXT_PUBLIC_*` means browser-visible. Public configuration is not a secure location for a service-role key or a secret used to authenticate internal requests.
- Use synthetic test fixtures and dedicated accounts. Redact customer names/contact data, authorization headers, invite/reset tokens, table tokens where appropriate, and provider payloads before sharing diagnostics.
- Do not log full sessions or bypass authorization to make an integration easier to test.
- Preserve raw-body handling for signed payment webhooks and test verification through existing safe test doubles/sandbox flows.
- Restore and seed scripts can overwrite data without an interactive confirmation. Obtain explicit approval for shared targets and verify the selected project before execution.
- Report vulnerabilities through [SECURITY.md](SECURITY.md), not in a public bug report containing sensitive reproduction details or credentials.

## Documentation changes

Update documentation when behavior, configuration, commands, prerequisites, routes, schema sequencing, or limitations change. Prefer updating the existing guide responsible for the topic rather than adding competing setup instructions.

For a documentation PR:

1. Verify commands against the root and workspace package manifests.
2. Verify environment resolution against the actual entry point, not merely an example comment.
3. Separate base setup, incremental migration, data provisioning, and production operation.
4. Check links and path references; use repository-relative links for local documents.
5. Explain destructive operations and required prerequisites next to the command.
6. Describe implemented behavior separately from roadmap or intended behavior.
7. Preserve important limitations, including mocked test boundaries and best-effort browser persistence.
8. Do not include real secrets or imply a command was run solely because it was inspected.

If source and an env example comment disagree, document the actual behavior and flag the example for a separately scoped correction rather than silently inventing a feature. Coordinate ownership when multiple contributors edit different guides.

## Commits and pull requests

### Before committing

Inspect the working tree and the intended diff:

```bash
git status --short
git diff
git diff --check
```

Review the repository's recent commit style, stage only intended files, and inspect the staged diff before creating a commit. Do not stage all files blindly in a shared working tree. Generated `.next`, `dist`, coverage, browser test artifacts, incremental type metadata, and local environments are not feature source.

Keep commit messages concise and behavior-focused. A dependency update should include its manifest/lockfile pair; a schema-dependent feature should include the migration and corresponding documentation/tests. Avoid unrelated cleanup in a bug-fix commit.

### PR description checklist

- [ ] Problem, expected behavior, and concise implementation scope.
- [ ] Affected workspace(s), routes, API contracts, and user roles/plans.
- [ ] Tests added or updated, with exact validation commands and results.
- [ ] Manual screenshots or short clips for relevant UI states, using synthetic data.
- [ ] Database migration/backfill requirements and rollout order, if any.
- [ ] Configuration changes, public/private classification, and example/doc updates.
- [ ] Offline, retry/idempotency, printing, payment, and tenant-isolation implications where relevant.
- [ ] Known limitations, skipped checks, and follow-up work stated explicitly.
- [ ] No secrets, generated output, or unrelated user/contributor changes in the diff.

Keep each PR focused enough to review as one coherent behavior change. Link the motivating issue when one exists. Do not treat a passing build as evidence of successful deployment, a healthy payment provider, or a validated restore.

## Bug reports and review follow-up

For an ordinary bug, include the affected route/feature, Node/npm and browser versions, expected versus actual behavior, minimal reproduction steps with synthetic data, and a redacted error message or request identifier. Note whether the problem reproduces with the backend healthy, whether the database is migrated, and whether it occurs on a clean build or only with a reused dev server.

For browser problems, record the API origin and port without secrets, CORS/CSP errors, role/plan state, and whether the page was online. For database problems, identify the migration filename or missing column—not a full connection string. For print failures, specify the selected adapter, browser/OS, printer model, and whether the OS queue received a job.

Respond to review comments with the specific change made or the reason a different approach is needed. Rerun affected checks after revisions, update the PR's validation record, and keep remaining limitations visible rather than silently marking untested paths as complete.
