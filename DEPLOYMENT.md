# Deployment and database operations

This runbook describes the deployment artifacts checked into this repository. It does not certify that a hosted environment is configured this way or that a release has passed its gates. Record environment-specific evidence using [LAUNCH_READINESS.md](LAUNCH_READINESS.md); probe and alert semantics are in [OBSERVABILITY.md](OBSERVABILITY.md).

## 1. Deployment boundaries

| Component | Repository implementation | Operator responsibility |
| --- | --- | --- |
| Backend | NestJS, built by the root `Dockerfile`; application routes use `/api` | Build or pull a reviewed artifact, inject configuration, supervise the process, validate readiness |
| HTTPS ingress | `compose.production.yml` and `deploy/Caddyfile` | DNS, firewall, certificate persistence, proxy topology and public checks |
| Database, Auth, Storage | External Supabase project | Provisioning, schema and grants, credentials, capacity, backups and object recovery |
| Redis | Optional external service; not included in Compose | TLS/network access, capacity, monitoring and multi-replica verification |
| Frontend | Separate Next.js app in `apps/frontend` | Build with the correct public configuration and deploy to a Next.js-capable host |
| Desktop | Standalone Electron thin client in `apps/desktop` | Windows installer, hosted frontend selection, updates, signing and printer validation |
| Email and payments | Optional external integrations | Provider setup, verified delivery/webhooks, scheduled jobs and feature-specific go-live approval |

Compose contains only `backend` and `caddy`. It does not deploy the frontend, Redis, PostgreSQL, Supabase, a monitoring stack, a migration job or a backup scheduler. The root `npm run build` builds **only the backend**. A desktop installer does not contain an offline backend or a bundled copy of the Next.js application.

The smoke workflow comments describe a Render deployment from `master`, but no server deployment step is implemented by the checked-in backend CI/image workflows. Confirm any dashboard-controlled auto-deploy separately. Disable or gate it when a schema-dependent release needs an ordered migration/deployment window.

## 2. Host and release prerequisites

Before touching the target environment:

1. Identify the exact source commit, previous known-good artifact and intended Supabase project. Keep staging credentials, database, Redis namespace/service, Sentry project and payment sandbox separate from production.
2. Install Docker Engine and Compose v2 on the backend host. Verify capacity for image builds if building there; building and running on the same host can compete for memory/CPU.
3. Set DNS for the API hostname to the ingress host. Verify any IPv6 record is reachable too. Allow inbound TCP 80 and 443 for Caddy and certificate issuance. Do not publish backend port 3001 directly.
4. Provide outbound connectivity to Supabase, Redis when used, error reporting and enabled integration providers.
5. Use Node.js 22 for repository scripts/builds, matching CI and the Dockerfile. Install compatible PostgreSQL client tools (`psql`, `pg_dump`, `pg_restore`) on the operations host. They are not installed in the backend runtime image.
6. Confirm backup access, a tested restore destination, migration ownership and a maintenance/rollback decision-maker.
7. Obtain current CI results for the candidate SHA. A workflow definition, a prior release's result or a commit message is not release evidence.

### Container characteristics

`Dockerfile:1` defines dependency, build and runtime stages using `node:22-bookworm-slim`. The runtime uses the non-root `qr-dines` user, installs production dependencies with scripts disabled, copies backend `dist`, and starts `node apps/backend/dist/main.js`.

It does not copy the migration runner, SQL tree or host backup scripts into the runtime image. Run database operations from a reviewed source checkout or an independently prepared operations environment, not by assuming they exist in the backend container. The workspace-aware dependency install and Docker context are part of the artifact build: obtain a successful Docker build for the exact release, not just a successful Nest compilation. Review the Docker context's exclusions before building; do not assume an example exclusion proves all nested secret files are safe.

## 3. Configuration ownership and loading

Use `.env.production.example`, `.env.staging.example`, `apps/backend/.env.example` and `apps/frontend/.env.example` as **templates**, not exhaustive deployment manifests. The root production example contains only basic infrastructure/Supabase settings; optional integrations are described more fully in the backend example. Never copy real environment values into issue comments, release evidence, logs or these documents.

Create the protected deployment file on the host, outside version control:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Populate values through the approved secret-management process. Do not display the resulting file in shared terminals or CI logs.

### Compose interpolation versus container environment

Two distinct selections matter:

- `docker compose --env-file ...` supplies values for Compose interpolation such as `APP_IMAGE`, `API_DOMAIN` and `ACME_EMAIL`.
- The service's `env_file` is selected by `${ENV_FILE:-.env.production}`. It supplies the backend runtime environment.

**Passing only `--env-file .env.staging` does not change the backend's `env_file` default.** Select both explicitly. Use the same selections for every operation:

```bash
export ENV_FILE=.env.production
```

For staging, use `export ENV_FILE=.env.staging` instead. In all subsequent Compose examples, `--env-file "$ENV_FILE"` and the exported `ENV_FILE` must refer to the same intended file. Staging on the same machine also needs an explicit isolation plan: separate Compose project/network/volumes and non-conflicting ingress ports or a separate ingress. Changing the env filename alone does not create an isolated stack.

Compose explicitly overrides backend `NODE_ENV=production` and `PORT=3001`, and defaults `TRUST_PROXY_HOPS` to 1. A value of `PORT` in the service env file does not change that exposed backend port.

Validate without printing the fully resolved configuration, which can include secrets:

```bash
docker compose --env-file "$ENV_FILE" -f compose.production.yml config --quiet
```

### Backend environment reference

| Variable | Behavior and operational requirement |
| --- | --- |
| `SUPABASE_URL` | Required, non-empty at boot; use the intended project's URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Required at boot; server-only privileged credential; never a `NEXT_PUBLIC_*` value |
| `SUPABASE_JWT_SECRET` | Required at boot; used for local JWT validation, including realtime authentication |
| `NODE_ENV` | Recognizes development/test/production; Compose forces production |
| `PORT` | Defaults to 3001; validated integer 1–65535 outside the Compose override |
| `CORS_ORIGINS` | Comma-separated, trimmed exact origins; required in production; an entry of `*` is rejected; use origins without `/api` or page paths |
| `TRUST_PROXY_HOPS` | Validated integer 0–5; app default 0, Compose default 1; match actual trusted proxy path rather than copying blindly |
| `DATABASE_URL` | Operations scripts/migration connection, not the backend PostgREST request connection; inject explicitly for the intended target |
| `REDIS_URL` | Preferred managed Redis connection string; `rediss://` enables TLS; overrides discrete configuration and constructs a single Redis client even if `REDIS_MODE=cluster` |
| `REDIS_HOST`, `REDIS_PORT` | Defaults localhost/6379; use a reachable external service, not localhost inside the backend container |
| `REDIS_USERNAME`, `REDIS_PASSWORD` | Optional discrete Redis credentials; use secret injection |
| `REDIS_MODE` | Defaults to `single`; `cluster` uses the configured host/port as the cluster seed when no URL is supplied |
| `TENANT_REDIS_KEY` | Optional tenant-service namespace, default `tenants`; not a global namespace for every Redis key |
| `SENTRY_DSN`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | Backend error reporting, explicit release identity, optional trace sampling (default 0); inject before Node starts |
| `AUTH_REGISTRATION_TOKEN` | Enables guarded account provisioning when configured; leave unset when registration should remain disabled |
| `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL` | Transactional email credentials, verified sender and frontend link origin; use an explicit correct frontend URL and include its origin in CORS |
| `CRON_SECRET` | Shared secret for internal reminder/reconciliation requests; coordinate backend value with GitHub Actions secret |
| `CASHFREE_*` | Feature-specific provider configuration; see backend env example and [PAYMENTS_GO_LIVE.md](PAYMENTS_GO_LIVE.md), then verify current provider-specific implementation before activation |
| `RAZORPAY_WEBHOOK_SECRET` | Legacy webhook setting, not an instruction to enable a payment provider; do not activate solely because it appears in a template |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS` | Backup script settings, defaults `backups` and 14 days; retention is local file deletion, not remote archival |

Backend environment validation is in `apps/backend/src/config/environment.ts:24`. Ordinary startup searches upward from the working directory for `.env`; it does not automatically select `.env.production`. Docker injects the selected env file into the process. The early Sentry import runs before the application's dotenv loader, so an unexported DSN present only in a later-loaded file may not enable backend Sentry.

### Script environment loading is not uniform

| Script | Connection source |
| --- | --- |
| `npm run db:setup` | Existing `DATABASE_URL`, otherwise reads root `.env` |
| `npm --prefix apps/backend run migrate[:status/:baseline]` | Existing `DATABASE_URL`, otherwise reads `apps/backend/.env` |
| `npm run backup:db`, `npm run restore:db` | Exported `DATABASE_URL` only; do not load env files themselves |
| Compose | Its own interpolation and backend `env_file` mechanism described above |

Always inject `DATABASE_URL` explicitly for controlled operations. Do not rely on fallback files when switching projects. The migration runner's fallback is a simple line parser, not a complete dotenv parser. Do not assume Compose syntax, shell syntax and that parser handle quoting identically. Sourcing a file executes shell syntax; use it only for trusted, shell-compatible files, not as a universal dotenv loader. Keep connection strings out of shell history and diagnostics; turn off shell tracing.

Prefer a provider-supported direct PostgreSQL connection for migrations/backups/restores. A session-pooling endpoint may be appropriate when direct connectivity is unavailable, subject to provider support and a rehearsal. Do not treat a transaction-pooling endpoint as interchangeable for administrative tools; confirm mode, TLS, privileges and tool compatibility. Port number alone is not proof of connection mode.

## 4. Database deployment and migration adoption

### What each artifact does

| Artifact | Scope | Important limitation |
| --- | --- | --- |
| `scripts/setup-supabase-db.sh` | Runs `schema.sql`, then `rls.sql`, with `ON_ERROR_STOP=1` | Does not run migration files or performance hardening; not wrapped in one transaction |
| `apps/backend/supabase/schema.sql` | Base/consolidated schema, functions, indexes and some accumulated features | Not proof that every later migration or data change has been installed |
| `apps/backend/supabase/rls.sql` | Enables listed tables' RLS and replaces named base policies | Does not cover every later table/grant; replaying policy files is a security change |
| `apps/backend/supabase/performance-hardening.sql` | Additional columns, tables, indexes, bucket settings and triggers | Outside the migration ledger; not merely a read-only performance check; can replace definitions/settings |
| `apps/backend/supabase/migrations/*.sql` | Ordered feature/schema/data/security changes | Runner tracks filenames, not schema equivalence or content checksums |

`apps/backend/scripts/migrate.mjs:69` uses `public.schema_migrations(name, applied_at)`. Files ending in `.sql` are sorted lexicographically. Each pending file runs with its ledger insert inside its own transaction; earlier successful files remain committed if a later file fails. There is no automatic down migration, global all-files transaction, migration lock, content checksum or concurrent-run coordination.

The runner's ledger read catches **any** read error and treats it as an empty applied set. A status listing is not sufficient proof of healthy credentials or an absent ledger. Verify connectivity and ledger access independently, especially if every historical migration unexpectedly appears pending. Use one migration operator/job per target.

### New, empty Supabase project

Rehearse the complete sequence on a disposable project before using it for production:

1. Confirm the project is empty of application data and record its non-secret project identity.
2. Inject `DATABASE_URL` for that project and verify identity/connectivity:

   ```bash
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'select current_database(), current_user;'
   ```

3. Install the base schema and base policies:

   ```bash
   npm run db:setup
   ```

4. Review and apply the separate hardening script if part of the approved bootstrap plan, **before** newer migrations can replace its older definitions:

   ```bash
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --file=apps/backend/supabase/performance-hardening.sql
   ```

5. Inspect and apply the ordered migration set:

   ```bash
   npm --prefix apps/backend run migrate:status
   npm --prefix apps/backend run migrate
   npm --prefix apps/backend run migrate:status
   ```

6. Review final RLS policies, function grants, indexes, storage settings and migration-driven data values. New-project setup overlaps historical migrations; `IF NOT EXISTS` is not evidence that overlapping definitions are equivalent. Stop on errors and reconcile them rather than marking files applied to bypass failures.
7. Provision a controlled workspace/account using the approved onboarding process. Do not run demo seeding in production simply to remove a readiness warning.

Do not rerun `db:setup`, `rls.sql` or performance hardening after every release: older function, trigger, policy or bucket definitions can overwrite newer hardening. Existing environments need a reviewed delta plan, not the empty-project sequence.

### Existing project: safe first adoption of the ledger

**`migrate:baseline` records ALL migration files in the checkout as applied without executing or verifying any of them. Never run it just because the application appears to work, the base schema exists or readiness passes.**

Before baseline adoption:

1. Freeze concurrent migration/deployment activity and take a recoverable backup.
2. Inspect whether `public.schema_migrations` already exists and record its entries. Distinguish missing ledger from permission/network errors.
3. Reconcile every candidate filename against historical execution records and the actual database. Verify data migrations, function bodies, grants, constraints, triggers, indexes and policies, not only table/column existence.
4. If **every file in that exact checkout** is independently verified as applied, record approval and then run:

   ```bash
   npm --prefix apps/backend run migrate:baseline
   npm --prefix apps/backend run migrate:status
   ```

5. If only a subset is verified, do **not** use full baseline. Have the database owner prepare a reviewed selective ledger reconciliation for exactly those files, or baseline from a carefully selected historical checkout containing only the verified set. The runner has no selective-baseline flag. Apply remaining genuine deltas normally.
6. Record the reconciliation evidence and release SHA outside the database. A restored ledger or an empty pending list alone does not prove actual schema correctness.

Do not combine `--baseline` with `--dry-run`: the implementation handles baseline first and writes the ledger. Supabase CLI history and this custom filename ledger are separate systems; `supabase db push` is not a drop-in equivalent unless configuration, ordering and both histories are explicitly reconciled.

### Normal release order

1. Review pending SQL and compatibility with the old and new backend/frontend versions. Prefer additive expand-then-contract changes; schedule destructive changes separately.
2. Confirm target identity, backup recoverability, previous artifact availability and a single migration operator.
3. Run migration status and reconcile unexpected entries. Apply the approved pending set **before** starting code that requires it.
4. Capture migration output and ledger evidence in restricted storage. Review errors before retrying; successful earlier files remain applied. Do not delete ledger rows to force a replay.
5. Deploy backend, verify probes and authenticated business flows, then deploy the compatible frontend. Update desktop only when shell changes require it.
6. Run smoke and release acceptance checks immediately; do not wait for a scheduled workflow.

Readiness samples selected schema dependencies only. It does not validate all migrations, data correctness, security grants or compatibility with the previous app version.

## 5. Backend deployment: choose one artifact strategy

The Compose backend has **both** `image:` and `build:`. `APP_IMAGE` changes the image reference but does not remove the build definition. Do not mix an image rollback with `--build`, which can build the current checkout and tag it with the supposed rollback reference.

### Strategy A: build the reviewed checkout

Use a locally owned, release-specific `APP_IMAGE` tag in the selected env file; avoid mutable `latest` for release evidence. From the repository root:

```bash
docker compose --env-file "$ENV_FILE" -f compose.production.yml config --quiet
docker compose --env-file "$ENV_FILE" -f compose.production.yml build backend
docker compose --env-file "$ENV_FILE" -f compose.production.yml up -d --no-build
docker compose --env-file "$ENV_FILE" -f compose.production.yml ps
```

Record the resulting backend image ID and source SHA. Do not pull a registry backend image as part of this strategy unless deliberately changing artifact source. Retain the previous image until the rollback window closes; routine image pruning during deployment can remove useful rollback artifacts.

### Strategy B: deploy a published backend image

Set `APP_IMAGE` to the approved GHCR image tag or, preferably, immutable digest. The workflow image name is `ghcr.io/<repository-owner>/<repository-name>-backend`; obtain the actual published reference from its build output, including normalized repository casing. Authenticate the host for package pulls if the registry package is private.

```bash
docker compose --env-file "$ENV_FILE" -f compose.production.yml config --quiet
docker compose --env-file "$ENV_FILE" -f compose.production.yml pull backend
docker compose --env-file "$ENV_FILE" -f compose.production.yml up -d --no-build
docker compose --env-file "$ENV_FILE" -f compose.production.yml ps
```

`pull backend` fails if the reference was never published; it does not build it. `--no-build` prevents an unintended local build. Verify the container's actual image identity, not just the env file label. Host architecture and published image platform must match; the publishing workflow has no explicit multi-platform matrix.

### Ingress and acceptance

Caddy compresses responses, sets security headers and proxies the entire API hostname to `backend:3001`, including `/`, `/api/*` and Socket.IO traffic. It does not strip `/api`. HTTPS certificate state persists in `caddy_data` and configuration state in `caddy_config`; preserve these volumes. Do not use `down -v` as a routine restart.

Set the non-secret API origin explicitly in the operations shell; Compose's env parsing does not export `$API_DOMAIN` into that shell:

```bash
export API_ORIGIN=https://api.example.com
curl --fail-with-body --max-time 15 -i "$API_ORIGIN/"
curl --fail-with-body --max-time 15 -i "$API_ORIGIN/api/health"
curl --fail-with-body --max-time 30 -i "$API_ORIGIN/api/health/ready"
docker compose --env-file "$ENV_FILE" -f compose.production.yml logs --since 10m backend caddy
SMOKE_BASE_URL="$API_ORIGIN" node apps/backend/scripts/smoke.mjs
```

Replace the example origin with the intended environment. Smoke takes an origin **without `/api`**; k6's `BASE_URL` and the frontend's `NEXT_PUBLIC_API_URL` include `/api`.

Inspect response bodies, not just curl success. Readiness `degraded` is HTTP 200. Docker healthchecks and Caddy's `health_uri` both use **liveness** `/api/health`, not readiness. Compose waits for backend liveness before starting Caddy; it does not guarantee database readiness, remove an unready running backend or perform a zero-downtime rollout. An unhealthy container is not automatically restarted solely because of the healthcheck; `unless-stopped` supervises exits.

## 6. Frontend deployment

The frontend needs a separate Next.js-capable deployment. `next.config.ts` does not configure static export; page middleware/proxy, server rendering and image optimization must work on the chosen host.

1. Select the backend release/environment and exact frontend SHA.
2. Supply `NEXT_PUBLIC_API_URL` as an absolute HTTP(S) URL ending in `/api`, without a query or hash. The API client validates this shape.
3. Supply browser `NEXT_PUBLIC_SENTRY_DSN` at build time if used. Supply server `SENTRY_DSN`, `SENTRY_RELEASE` and optional server trace rate to the appropriate frontend process/build environment.
4. Install from the root lockfile and build the frontend workspace:

   ```bash
   npm ci
   npm run build --workspace apps/frontend
   ```

5. On a self-hosted Next.js server, start the built app under the host's supervisor:

   ```bash
   npm run start --workspace apps/frontend
   ```

   This script listens on port 3000. TLS, reverse proxying, restart policy and scaling for this service are not supplied by the backend Compose file.
6. Verify guest pages, operator login, API requests, image optimization, CSP and realtime from the public frontend origin.

**Public variables are baked into browser assets at build time.** A runtime-only change cannot repair a build made with another environment's API URL. The frontend CI placeholder `https://api.example.com/api` is a build/test value, not a production-ready artifact configuration. Rebuild for the target; inspect browser requests rather than trusting host env settings alone.

The frontend example includes public Supabase settings, but the current frontend source does not consume `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not introduce a service-role key into the browser to compensate for an API configuration error.

Security headers are applied by `next.config.ts`; `src/proxy.ts` generates a per-request nonce CSP and derives API/WebSocket origins from the build-time API URL. Do not cache/replay nonce-bearing HTML as if it were an arbitrary static export. Verify custom Sentry endpoints or additional provider hosts against the actual CSP rather than weakening it globally.

## 7. Desktop deployment

`apps/desktop` is not part of the root npm workspace list. Its Windows workflow performs a standalone `npm install` and invokes Electron Builder. `desktop-v*` tags or manual dispatch publish a Windows NSIS installer to GitHub Releases, independently of backend `v*` image tags.

- `QR_DINES_APP_URL` selects the hosted frontend; the source default is `https://qr-dines-frontend.vercel.app`. Set the intended environment explicitly for controlled till deployment.
- `QR_DINES_KIOSK` and `QR_DINES_AUTOSTART` enable till options; recognized true values are `1`, `true`, `yes`, `on`.
- `QR_DINES_DISABLE_UPDATES` disables automatic updates. Otherwise packaged builds check on launch and hourly, download automatically and install on quit.
- `QR_DINES_DESKTOP_SENTRY_DSN` takes precedence over `SENTRY_DSN` for main-process reporting.
- Configuration reads `process.env`; the config module does not load a `.env` file itself. Configure the OS/launcher environment deliberately.
- The update feed is set in `apps/desktop/package.json:31`; verify repository ownership and published artifacts for forks/deployments.
- Optional signing uses workflow secrets `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`. Verify signature and installation behavior on a clean Windows device; signing does not by itself guarantee SmartScreen reputation.

Rehearse printer selection, native print output, restart, secure-store behavior, update and network loss on representative hardware. The offline page retries hosted-app loading after five seconds; it is not an offline transaction store. Rolling back backend/web content and rolling back a native installer are separate operations.

## 8. Scaling, Redis and shutdown limits

The main request path uses Supabase over HTTP/PostgREST, not an app-owned PostgreSQL connection pool. Tune provider compute/query performance and its supported pooling configuration based on measured load; do not size an imaginary Nest database pool from `DATABASE_URL`.

Redis-backed throttling uses a Lua fixed-window counter with `INCR`/`PEXPIRE` and falls back to in-memory storage on no connection or command failure. Counters then differ by process and reset with restarts. The active global default is 600 requests per 60,000 ms, with stricter route overrides; health routes are not exempted in their controller. Incorrect trusted-proxy handling can collapse many diners into one client-IP bucket.

Realtime attaches a Socket.IO Redis adapter during gateway initialization if Redis is connected. There is no automatic adapter reattachment in that method after a failed initial attachment. A healthy Redis PING is not proof of cross-replica event delivery. First-connection failure is fail-fast; established clients have reconnect backoff. Do not promise uninterrupted realtime through a Redis outage or assume returning Redis will fully heal a gateway that started without its adapter.

Before enabling multiple replicas, demonstrate shared throttling, authenticated room isolation, cross-replica kitchen/tab updates, reconnects and client polling fallback with the intended load balancer. Validate session routing for the transports in use. Compose is not a tested multi-host or rolling-deployment orchestrator.

`enableShutdownHooks()` and Redis `onModuleDestroy()` exist, but the custom SIGTERM/SIGINT handlers in `apps/backend/src/main.ts:55` call `process.exit(0)` immediately. Do not claim guaranteed graceful request draining, Redis subscriber cleanup or durable flushing of in-flight observability records. Test shutdown behavior before relying on zero-loss rolling restarts.

## 9. CI, publishing and automation boundaries

| Workflow | Trigger | Implemented behavior / limitation |
| --- | --- | --- |
| `backend-ci.yml` | PRs, main/master pushes, manual | Root install, production dependency high-severity audit, backend lint/Jest/build, Docker build; no migration/deploy |
| `frontend-ci.yml` | PRs, main/master pushes, manual | Frontend lint, `tsc --noEmit`, build, separate Chromium Playwright job using mocked API; not live-backend acceptance |
| `backend-image.yml` | `v*` tags, manual | Build/push GHCR image; tag metadata and default-branch `latest`; no explicit dependency on successful CI, migration or deployment job |
| `desktop-release.yml` | `desktop-v*` tags, manual | Standalone Windows installer build/publish; optional signing; no till/printer acceptance gate |
| `secret-scan.yml` | PRs, main/master pushes, manual | Full-history gitleaks with repository configuration, redaction and nonzero exit for detections; not proof that no secret exists |
| `smoke.yml` | Every 30 minutes, manual | Public root/readiness and optional authenticated read checks; not a deployment completion hook or guaranteed pager |
| `payment-reconcile.yml` | Every five minutes, manual | POST internal reconcile endpoint when secret exists; skips successfully if absent |
| `trial-reminders.yml` | Daily 06:00 UTC, manual | POST reminder endpoint when secret exists; skips successfully if absent |

Check protected-branch required checks and hosted deployment settings separately. A tag publish workflow can run without a matching green CI run. GitHub schedules may be delayed. Internal-job HTTP 200 is not proof of downstream payment settlement/email delivery; inspect job response and provider/business state.

## 10. Backups and restore

### Logical backup

After securely injecting the intended `DATABASE_URL`:

```bash
npm run backup:db
```

`scripts/backup-postgres.sh:14` creates `qr-dines-<UTC timestamp>.dump` in `BACKUP_DIR`, using `pg_dump --format=custom --no-owner --no-privileges`. After successful dumping, it deletes matching local files older than the configured `find -mtime +N` threshold. It does not schedule itself, encrypt backups, upload off-host, validate restoreability or monitor backup age.

Operational requirements:

1. Use client versions compatible with the server and least-privileged credentials that can actually read all required objects.
2. Restrict directory/file access and encrypt/transfer backups to an approved independent location.
3. Monitor backup job success, age, size, off-host copy verification and retention; use a distinct directory per environment so retention does not remove another project's dumps.
4. Retain the source SHA, schema/ledger state and relevant configuration references with each backup, without storing raw secrets in evidence.
5. Configure provider backups/PITR separately and verify availability, retention and restore permissions. This repository does not enable PITR.

A database dump is not a backup of Supabase Storage object bytes, provider configuration, DNS, Caddy volumes, external payment state, email settings or desktop credentials. Owners/grants are deliberately omitted. Managed Supabase schemas/roles/extensions and cross-project restore permissions require a tested plan; do not assume a full logical dump is portable without adjustments.

### Destructive restore

Use a disposable, explicitly identified target for drills. Inject its `DATABASE_URL`, not the production URL. Inspect the archive before restoring:

```bash
pg_restore --list "$BACKUP_FILE"
npm run restore:db
```

`BACKUP_FILE` must be exported and refer to an existing archive. The script runs `pg_restore --clean --if-exists --no-owner --no-privileges --dbname=...`. It has **no confirmation prompt, environment-name guard, single transaction or `--exit-on-error` option**. A failure can leave a partially modified target. `--clean` drops archive-listed objects; it does not guarantee removal of all objects absent from the archive or recreation of a pristine project.

Stop writes and external callbacks before a production recovery, preserve evidence/current-state backups, and obtain explicit authorization. Restore grants/RLS/security settings deliberately, recover storage objects separately, reconcile migration history, and validate identities, billing/invoice sequences, payment state and tenant isolation before reopening traffic. A provider PITR restore is a separate recovery procedure and can discard transactions after the selected time.

See [LAUNCH_READINESS.md](LAUNCH_READINESS.md) for rollback choice, recovery acceptance and release evidence. Never treat an application image rollback as a database rollback.
