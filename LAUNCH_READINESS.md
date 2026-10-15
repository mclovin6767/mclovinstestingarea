# Launch readiness, rollback and recovery

This is an **evidence checklist**, not a declaration that the repository or production environment is ready. Leave items unchecked until the responsible owner has verified the exact release and recorded evidence. Checked-in tests, workflow definitions, historical commit messages and previous releases' results are not proof of current success.

Use [DEPLOYMENT.md](DEPLOYMENT.md) for implementation-specific deployment/database procedures and [OBSERVABILITY.md](OBSERVABILITY.md) for probe contracts and monitoring limitations. Payment activation additionally requires [PAYMENTS_GO_LIVE.md](PAYMENTS_GO_LIVE.md).

## 1. Release record and decision ownership

Create the release record in the team's approved change-tracking system, without credentials or raw environment files. Record:

| Field | Required evidence |
| --- | --- |
| Target | Production/staging name, non-secret backend/frontend origins, Supabase project identity, Redis service identity |
| Candidate | Exact commit SHA, backend image digest/ID, frontend deployment/build ID, desktop version if changing |
| Previous good | Retrievable backend artifact, frontend build and desktop installer where relevant; last known-compatible schema |
| Change scope | User-facing changes, migrations/data corrections, provider configuration, secret rotation and infrastructure changes |
| Migration plan | Filename list, ledger status, schema/grant/data verification, compatibility with old/new code, named operator |
| Recovery plan | Backup/PITR references, last successful restore evidence, estimated data loss, application rollback compatibility |
| Gates | CI workflow run identifiers for the candidate SHA, audit/scan results, smoke/acceptance/load results |
| Observability | Monitor/alert identities, on-call recipient, delivery-test evidence and dashboards |
| Approval | Release owner, database operator, incident decision-maker, rollout window and explicit go/no-go |
| Exceptions | Unmet checks, business impact, compensating controls, owner and expiry/retest date |

Small teams may assign several roles to one person, but the decisions still need an owner. Do not launch money-moving functionality, schema changes or multi-replica realtime with an unowned operational exception.

## 2. Pre-release gates

### Source and artifact evidence

- [ ] Backend CI passed for the candidate SHA: install, production high-severity audit, backend lint, Jest, Nest build and Docker build.
- [ ] Frontend CI passed for that SHA: lint, explicit TypeScript check, build and Chromium Playwright job. Record that Playwright uses a mocked API, not the deployed backend/database.
- [ ] Secret-scan workflow completed for the intended history/configuration. Review findings and allowlist scope; do not infer “no secrets exist” from one green scan.
- [ ] Dependency audit result is current and exceptions are documented. Do not carry forward an old “zero high vulnerabilities” assertion.
- [ ] Relevant tenant-isolation, throttling, authorization, billing and payment regression results were reviewed, not just the presence of test files.
- [ ] Protected-branch requirements and any hosted auto-deploy settings were checked separately from YAML definitions.
- [ ] Published backend artifact is tied to the reviewed SHA, is pullable by the deployment host and supports its architecture.
- [ ] Build-versus-image deployment strategy is explicit. A pulled image will be started with `--no-build`; a local build uses the approved checkout and release-specific tag.
- [ ] Frontend was built with the intended public API/Sentry settings, not CI placeholders. Root `npm run build` is not frontend build evidence.
- [ ] Previous artifacts remain available; no premature image pruning or destructive volume cleanup is planned.

Backend image publication on `v*` tags is independent of CI and does not deploy a server or migrate a database. A successful tag workflow is only image-publication evidence. Desktop `desktop-v*` tags are a separate release path.

### Environment and ingress

- [ ] Production/staging have separate Supabase credentials/projects, Redis isolation, payment environments and Sentry projects as required.
- [ ] Secret values are managed outside source control; only examples were used to prepare deployment configuration.
- [ ] Compose interpolation and backend service env selection both target the intended file: exported `ENV_FILE` plus `--env-file "$ENV_FILE"`.
- [ ] Compose config validation passed using `config --quiet`, without printing resolved secrets.
- [ ] Supabase URL, service-role credential and JWT validation configuration target the intended project.
- [ ] `NODE_ENV=production`, exact `CORS_ORIGINS` and actual trusted proxy hop count are correct. The Compose value 1 is appropriate only for the verified topology.
- [ ] Backend 3001 is not publicly published; DNS and TLS ingress work over intended public addresses.
- [ ] Caddy data/config volumes persist, renewal connectivity is allowed and disk capacity/expiry monitoring is owned.
- [ ] CORS and effective API/frontend security headers were checked from the deployed browser origin, including CSP and HTTPS behavior.
- [ ] Frontend `NEXT_PUBLIC_API_URL` includes `/api`; smoke base origin does not. Browser assets are rebuilt when public settings change.
- [ ] Any frontend host's server rendering, proxy/nonce behavior and image optimization work; no static-export assumption was made.
- [ ] Registration is disabled unless explicitly approved; optional integration settings are activated only with acceptance evidence.

### Database and migration safety

- [ ] A database owner confirmed actual target identity and administrative connection compatibility before writes.
- [ ] A recoverable backup/PITR point exists, with the last restore drill and retention availability recorded.
- [ ] Migration status was inspected with explicit `DATABASE_URL`; fallback env files were not trusted when selecting the target.
- [ ] Ledger read errors were ruled out. The runner treats any ledger-read error as no applied migrations, so an unexpected all-pending list was investigated.
- [ ] First adoption, if necessary, reconciled each historical migration against actual schema, function bodies, security grants and data changes.
- [ ] Full `migrate:baseline` is used only when **all files in the exact checkout are independently verified already applied**. Partial verification uses an approved selective reconciliation, not full baseline.
- [ ] Normal migration list, ordering and lock/availability impact were reviewed. Only one migration operator/job will run against the target.
- [ ] Candidate schema is compatible with the old backend during migration and with the previous image if rollback is expected. Destructive changes have a separate plan.
- [ ] Empty-project setup and existing-project upgrades are distinguished. Base schema/RLS/performance scripts will not be blindly replayed over newer migration definitions.
- [ ] All intended migrations completed and ledger output was captured. Per-file transaction behavior and committed earlier files after failure are understood.
- [ ] Final RLS, function grants, indexes, triggers, constraints, storage access and migration-driven data values were reviewed. Readiness is not a substitute.
- [ ] Expected workspace/account exists through controlled onboarding. Demo data will not be inserted into production simply to obtain an `ok` probe.
- [ ] Supabase project settings outside SQL, including relevant Auth protections and backup/PITR settings, were verified independently.

### Runtime, Redis and scaling

- [ ] Public `/api/health` returns HTTP 200 with `status: "ok"`.
- [ ] Public `/api/health/ready` returns an expected body: aggregate `ok`/200, or explicitly approved `degraded`/200 with named warnings. `error`/503 blocks launch.
- [ ] Readiness response check names/statuses were captured. Detailed startup diagnostics were reviewed privately; anonymous responses do not include `critical` or `message`.
- [ ] All code-required schema checks pass; broader schema/business checks cover changes not probed by readiness.
- [ ] Required storage uploads/downloads work, not merely bucket listing. `menu-images` and `restaurant-branding` warning dispositions are recorded.
- [ ] Single-instance operation without Redis, if chosen, is an explicit limitation with capacity and polling expectations.
- [ ] For multi-replica operation, `redis: pass` is accompanied by cross-replica functional evidence, not just PING.
- [ ] Shared rate limits, client-IP handling behind proxy/shared NAT, authenticated realtime room isolation, polling/transport routing and kitchen/tab updates were exercised.
- [ ] Redis outage and recovery were rehearsed. Per-process counters and failed initial adapter attachment are accounted for; automatic perfect recovery is not assumed.
- [ ] Shutdown/restart behavior was measured. Immediate custom signal exits mean guaranteed in-flight draining or log persistence is not established by `enableShutdownHooks()` alone.
- [ ] Infrastructure resource limits, restart/health behavior and capacity alerts are owned. Compose is not being treated as an automatic zero-downtime orchestrator.

### Observability and integrations

- [ ] Backend Sentry DSN/release were injected before process startup; a real test event arrived in the correct project.
- [ ] Frontend server/browser Sentry were verified separately. Browser DSN was included at build time; browser release/source maps were verified or their absence accepted explicitly.
- [ ] Staging production-mode events cannot be mistaken for production events; separate projects/DSNs were checked.
- [ ] Logs are retained outside Supabase so a database outage does not remove the only diagnostic channel.
- [ ] External liveness/readiness monitors validate both HTTP and JSON; HTTP 200 `degraded` is handled intentionally.
- [ ] Alert rules, recipients, escalation and recovery notifications were tested. `recordAlert()` database/log events are not mistaken for dispatched pages.
- [ ] 429s, operational-event persistence failures, resource pressure and backup age have monitoring separate from Sentry's explicit 5xx exception capture.
- [ ] Scheduled smoke targets the intended origin; optional account secrets are present if authenticated coverage is required.
- [ ] Smoke account has a controlled workspace so subscription checks do not silently skip; full acceptance does not rely on smoke's permissive readiness parsing.
- [ ] If payments/reminders are enabled, backend/GitHub `CRON_SECRET` match, repository `API_BASE_URL` is correct and actual non-skipped job outcomes are recorded.
- [ ] Email sender domain, `MAIL_FROM`, link origin and recipient delivery were verified. A no-op mailer or successful HTTP request is not delivery evidence.
- [ ] Payment provider mode, credentials, callback paths and reconciliation outcomes passed the payment-specific checklist before exposing checkout.

## 3. Staging acceptance and capacity evidence

### Representative business journeys

Use dedicated test accounts and a seeded staging restaurant; preserve identifiers for evidence but redact credentials/tokens. Verify both allowed operations and expected denial paths without using customer data.

| Journey | Evidence to capture |
| --- | --- |
| Owner authentication | Login, refresh/session continuity, restaurant list and subscription/entitlements |
| Staff/team | Invite delivery/link origin, join, correct role, denial of unauthorized tenant/role operations |
| Guest QR | Table context, menu/options/availability, successful order and tracker state |
| Kitchen/operator | Order visible, authorized preparation/status changes, realtime arrival or polling fallback |
| Billing | Correct items/tax/rounding, one finalized invoice for intended order, bill numbering, receipt/reprint and audit trail |
| Online payment, when enabled | Sandbox checkout/return, verified webhook, one settlement transition, order/invoice visibility and reconcile behavior |
| Storage | Menu image/branding upload and browser retrieval under intended policies |
| Recovery of UI | Reload, expired session, network loss/reconnect and meaningful errors without leaked secrets |
| Desktop, when enabled | Actual till installation, printer output, secure store, kiosk/autostart, offline screen and upgrade behavior |

Do not mark a live journey verified solely because its mocked Playwright scenario passed. Record the browser/device, release IDs, environment and time of execution. Clean up staging state through an approved process; order/invoice immutability and payment state make arbitrary deletion an unsafe cleanup assumption.

### Load tests

The checked-in k6 scripts are staging-only exercises, not production monitoring or automatic CI release gates. Use `BASE_URL` including `/api` and a real staging table token where required:

```bash
k6 run --env BASE_URL="$STAGING_API_BASE" loadtest/health.js
k6 run --env BASE_URL="$STAGING_API_BASE" --env TABLE_TOKEN="$STAGING_TABLE_TOKEN" loadtest/guest-read.js
k6 run --env BASE_URL="$STAGING_API_BASE" --env TABLE_TOKEN="$STAGING_TABLE_TOKEN" loadtest/order-place.js
```

Export those values through the controlled staging process; table tokens should not be pasted into public reports. `order-place.js` creates real staging orders and needs an orderable menu item.

Actual script thresholds:

| Script | Load stages | Thresholds |
| --- | --- | --- |
| `health.js` | 25 VUs over 30s, 100 over 1m, 0 over 30s | Failed-request rate <1%; p95 <300 ms |
| `guest-read.js` | 20 VUs over 30s, 60 over 2m, 0 over 30s | Failed-request rate <1%; p95 <500 ms |
| `order-place.js` | 5 VUs over 30s, 15 over 1m, 0 over 30s | Failed-request rate <2%; p95 <800 ms |

The scripts do not implement a special exclusion of 429 responses from `http_req_failed`. From one egress IP, route limits can dominate results, especially the order route's 10/minute limit. Health is also subject to the global guard. Record throttle responses separately; do not call a rate-limit benchmark an application capacity result. Use representative distributed egress where appropriate. There is no documented runtime environment switch in the active module for disabling all throttling; any staging-only change requires review and must not leak into production.

Record candidate SHA, host sizing, Supabase/Redis configuration, egress layout, concurrency, latency/failure breakdown, resource graphs and cleanup result. Passing synthetic thresholds does not guarantee production SLOs or safe multi-replica realtime.

## 4. Launch execution order

1. **Freeze and announce.** Confirm scope, owners, observation window and rollback triggers. Pause dashboard auto-deploys/concurrent migration jobs when ordering requires it.
2. **Confirm recoverability.** Verify previous artifacts can be retrieved and the selected backup/PITR point is accessible. Record tolerated data loss and recovery decision authority.
3. **Apply database deltas first.** Confirm target identity, inspect pending list, apply approved migrations and verify final ledger/schema. Stop on unexplained errors; do not baseline away failures.
4. **Deploy backend.** Use either reviewed local build or pinned image strategy from DEPLOYMENT.md. Confirm actual container image identity and restart state.
5. **Verify backend immediately.** Check public/container-local liveness and readiness, logs, strict response contract and authenticated read path. Docker healthy alone is not approval.
6. **Deploy compatible frontend.** Verify built API URL, CSP, Sentry and live browser requests. Do not switch users to code requiring backend capabilities not yet available.
7. **Run business acceptance.** Use the controlled smoke tenant/account and approved non-destructive production checks. Exercise money-moving flows only under their authorized go-live procedure.
8. **Update desktop selectively.** Only if shell/native changes require it; validate a canary till before broad distribution. Hosted frontend changes affect desktop clients independently of installer release.
9. **Observe.** Use at least a defined initial observation window (for example 15 minutes), then an agreed post-release watch period sized to traffic. Monitor 5xx/429s, readiness warnings, latency, kitchen freshness, payment state, mail and job effectiveness.
10. **Approve or recover.** Release owner records evidence, exceptions and decision. Resume paused automation only after confirming it cannot redeploy the wrong artifact or rerun destructive operations.

The current smoke workflow runs every 30 minutes and is not a deployment completion hook. Run immediate checks yourself; do not wait for scheduled Actions. A green smoke result with skipped authenticated checks is not the launch business-acceptance result.

## 5. Stop conditions and rollback decision

Treat these as initial decision criteria to agree before the release, not automatic repository behavior:

- Stop immediately for credible cross-tenant access or credential exposure. Duplicate or incorrect settlement, invoice corruption and incorrect money movement also require an immediate stop.
- Stop when a required readiness check fails, migration state is unexplained, the artifact differs from the approved one or rollback compatibility is unknown.
- Consider rollback for a sustained 5xx regression (for example >5% for five minutes), severe 429s on legitimate traffic, materially worse latency or lost kitchen updates. Use a trustworthy request denominator and business impact, not raw Sentry event count alone.
- Treat approved single-instance Redis warnings differently from loss of a required multi-replica fan-out dependency.

Before choosing recovery, classify the failure:

| Failure | Preferred first decision |
| --- | --- |
| Application regression with compatible database | Roll back app artifact and recheck business flows |
| Missing additive schema migration | Apply the reviewed missing migration or revert incompatible code; do not baseline |
| Bad schema/function/data change | Database-owner fix-forward or planned restore, based on impact and compatibility |
| Provider/network outage | Diagnose provider/connectivity; repeated app rollback may not help |
| Corruption or security incident | Contain writes/exposure, preserve evidence and obtain recovery/security approval |

## 6. Backend, frontend and desktop rollback

### Image-based backend rollback

This sequence assumes the previous image remains compatible with the **current** database and configuration. Use a real approved immutable reference, injected as `PREVIOUS_IMAGE`, not a guessed tag:

```bash
export ENV_FILE=.env.production
APP_IMAGE="$PREVIOUS_IMAGE" docker compose --env-file "$ENV_FILE" -f compose.production.yml pull backend
APP_IMAGE="$PREVIOUS_IMAGE" docker compose --env-file "$ENV_FILE" -f compose.production.yml up -d --no-build backend
```

Then confirm the running image and probe the public endpoint. `--no-build` is essential because Compose still contains `build:`. A shell-only `APP_IMAGE` override is temporary: update the managed deployment configuration to the approved rollback reference before subsequent automation/commands, or the next `up` may restore the failed release.

For locally built artifacts, select the retained previous image and use `--no-build`; do not `pull` a tag that exists only locally. Rebuilding an old checkout is a fallback, not equivalent to retrieving the original tested artifact, and may depend on registry/network availability or mutable base images.

Preserve Caddy volumes and logs. Do not run `down -v`, `docker system prune` or broad cleanup as part of recovery. Compose does not provide a blue/green handover; account for interruption and reconnecting clients.

### Frontend rollback

Redeploy the previous verified frontend build on its separate host, or rebuild the approved old SHA using its intended environment. Public API/Sentry values remain embedded in its assets. Confirm the older UI still works with current backend responses and migrated data. Check cache/CDN invalidation and stale open browser sessions; old and new clients can coexist during rollout.

A backend image rollback does not revert hosted web content. Conversely, frontend rollback does not reverse already issued orders/invoices or provider transactions.

### Desktop rollback

Control the GitHub Releases update feed and canary distribution separately. Packaged clients normally check at launch/hourly, auto-download and install on quit. Do not assume publishing an older version will trigger a downgrade. Plan an approved reinstall or forward-version hotfix and protect persisted credentials/settings. If needed, suspend updates through the supported per-till configuration while investigating.

Verify installer signature, application URL, printer behavior and version on an actual device. A native rollback does not restore an older hosted frontend automatically.

### Database rollback caveat

The migration runner has no down mode. App rollback does not delete ledger entries, revert DDL, undo data updates or restore provider state. Never remove migration rows to make a previous image appear compatible. Choose a reviewed fix-forward migration or a tested restore/PITR procedure, with explicit data-loss approval.

## 7. Disaster recovery and restore drills

### Recovery objectives are targets, not guarantees

A proposed RTO of one hour and RPO of five minutes may be useful planning goals **only if** the selected provider plan, backup/PITR retention and actual drills support them. Logical dumps alone do not provide a five-minute RPO unless scheduled and recoverable at that frequency. RTO includes detection, approval, restoring objects/configuration, reconciling provider state, verification and traffic cutover—not just `pg_restore` elapsed time.

- RPO: latest recoverable consistent state compared with incident time; record what transactions would be lost.
- RTO: elapsed time until verified business service is restored, including Auth, storage, payments, kitchen and printing where required.

No workflow here enables Supabase PITR, schedules PostgreSQL dumps, copies them off-host or tests restores automatically.

### Recovery inventory

Maintain recoverable references and owners for:

- PostgreSQL data/schema and migration ledger, plus roles/grants/RLS/function security verification;
- Supabase Auth project settings/identity continuity and provider-specific recovery constraints;
- Storage object bytes and bucket configuration/access, separate from database metadata;
- backend/frontend images/builds and non-secret configuration manifests with secret-manager references;
- Caddy persistent volumes, DNS/ingress configuration and TLS recovery strategy;
- payment provider transaction IDs, reconciliation state and callback routing;
- email sender/domain configuration, scheduled-job configuration and alert routes;
- desktop installers/update feed, till settings and secure credential handling.

### Quarterly drill, and after material recovery changes

1. Approve a drill owner, backup/PITR point, scratch project and objectives. Use an isolated environment; never run the drill restore against production.
2. Verify scratch target identity independently. Disable production webhooks, cron jobs and outbound customer email; restored subscriptions/payment intents must not cause unintended real-world actions.
3. Check client/server tool compatibility, dump integrity/readability and required managed-project roles/extensions. Inspect archive contents with `pg_restore --list` in a restricted terminal.
4. Securely inject the scratch `DATABASE_URL` and export the selected `BACKUP_FILE`.
5. Execute the reviewed restore procedure:

   ```bash
   npm run restore:db
   ```

6. Capture start/end time, exit status and errors. The script has no confirmation prompt, no environment guard, no single transaction and no `--exit-on-error`; failures can leave a partially modified target. A failed attempt is not a clean destination for unreviewed retries.
7. Validate expected objects, rows, constraints, triggers, grants, RLS and migration ledger against the backup/release record. `--no-owner --no-privileges` omits ownership/grant restoration; reapply approved security configuration, not blindly old scripts.
8. Restore object storage/configuration separately as required. A database archive contains no menu-image object bytes.
9. Configure an isolated backend/frontend with the scratch project's credentials and current intended artifacts. Restart for early instrumentation settings. Do not use a production env file as a shortcut.
10. Check strict readiness and authenticated acceptance: login, tenant membership, menu/images, orders, kitchen, invoice numbering/totals and audit trail. Readiness alone samples too little to validate recovery.
11. Reconcile payment/webhook/idempotency state against provider records in an approved non-production procedure. A database restore cannot undo charges or provider-side subscription changes.
12. Record total RTO, recoverable timestamp/RPO, missing components, manual steps and the owner/deadline for every gap. Securely remove scratch credentials/data after retention requirements are met.

`pg_restore --clean --if-exists` drops objects represented in the archive but does not necessarily remove objects that exist only in the target. A “restore completed” line is not proof of a pristine project, correct permissions or operational consistency. Managed Supabase cross-project restore may need provider-specific steps beyond this script.

### Actual production recovery

1. Declare the incident and obtain approval for potential data loss.
2. Pause writes/deploys, provider callbacks and scheduled mutating jobs through the approved ingress/provider controls. There is no generic maintenance-mode switch supplied by these runbooks.
3. Preserve current-state backup/evidence if feasible and select the most recent safe recovery point, not merely the newest backup.
4. Prefer a verified recovery destination/cutover plan over an untested destructive overwrite. Use provider-assisted PITR where appropriate; it is a separate procedure from the logical restore script.
5. Restore database, security and missing external components, then reconcile migrations and provider transactions.
6. Run acceptance while traffic remains controlled; validate exact image/build/configuration identities.
7. Reopen gradually, resume jobs/callbacks deliberately, watch for duplicated/replayed work and record achieved recovery times.

## 8. Incident runbooks

### A. API 5xx, 429 or latency spike

1. Identify first bad time/release, impacted routes and tenants. Compare liveness/readiness and ingress/container-local behavior.
2. Inspect bounded backend/Caddy logs, Sentry 5xx exceptions and operational event persistence failures. Absence of Sentry 429 issues is expected from the explicit filter behavior.
3. For 429s, check actual client-IP/proxy topology, shared NAT, retries/polling and route-specific overrides. Do not assume every storm is a TTL bug or disable throttling globally.
4. The active default is `ttl: 60000, limit: 600`; route `@Throttle` TTL values are milliseconds. Old unsupported path-pattern configuration must not be reintroduced. Reference `apps/backend/src/security/throttling.regression.spec.ts` for regression coverage, not as a runtime fix.
5. For latency/5xx, inspect Supabase capacity/query failures, Redis fallback, oversized responses, process restarts and recent migrations.
6. Choose compatible app rollback or a narrowly reviewed fix; confirm legitimate business traffic recovers and restore monitoring thresholds after mitigation.

### B. Readiness error or suspected schema drift

1. Parse `/api/health/ready`: HTTP 503 with aggregate `error` indicates critical failure. Record failing check names; public diagnostics intentionally omit details.
2. Review startup readiness logs and current provider diagnostics privately. Missing environment can prevent startup entirely.
3. For `supabase.auth`/project mismatch, check project identity, key rotation, provider health and connectivity before assuming a schema problem.
4. For `database.billing_schema` or `database.required_columns`, verify both access/connectivity and actual columns/functions. A failed select is not uniquely evidence of an unapplied migration.
5. Inspect the ledger and approved migration files against the deployed SHA. Apply a confirmed missing delta or revert incompatible code. **Never baseline to silence readiness.**
6. Validate relevant business flows after correction, including changes outside the five-column probe list.

### C. Supabase outage or event persistence failure

1. Distinguish Auth outage, database/PostgREST issue, credential mismatch and network failure using provider diagnostics and controlled probes.
2. Check independent logs for `observability.persist_failed`; the same database stores operational events, so table silence cannot establish health.
3. Reduce avoidable retries/traffic if the provider is saturated. Do not repeatedly restart every backend to cure a shared dependency failure.
4. Communicate reduced functionality and choose provider recovery/failover or a tested restore only when appropriate. Restoring data is not a generic solution to transient network unavailability.
5. After recovery, verify sessions, tenant reads/writes, invoices and job effectiveness; account for non-durable in-flight events.

### D. Redis warning or missing kitchen updates

1. `redis: warn` normally yields `degraded`/200. Confirm whether the release depends on multi-replica behavior.
2. Check managed Redis endpoint/TLS/credentials/network and live PING. Ignore an isolated startup `redis.connected` event as proof—the boot recorder can emit it after a failed connection attempt.
3. Inspect gateway adapter-attachment logs and real clients' `realtime.ready` status. Verify JWT, membership, entitlement and CORS as well as transport connectivity.
4. Check whether updates cross replicas, not merely arrive on the writer's instance. Local rate-limit fallback does not preserve shared counter totals, and polling is not zero-delay fan-out.
5. Restore Redis; if the app started without an adapter, use a controlled backend restart/verification rather than assuming automatic attachment. Rehearse and verify all affected clients afterward.
6. Keep the incident open until restaurant-visible freshness and intended distributed throttling are restored or an approved single-instance mitigation is in place.

### E. Failed or partially completed migration

1. Stop further deployments and concurrent migration attempts. Preserve failing filename/output and current ledger entries.
2. Determine whether the failure occurred inside the file's transaction or an earlier setup script. Earlier migration files remain committed; setup/restore scripts are not all-or-nothing.
3. Verify target identity, permissions, locks, prerequisites and existing definitions. Unexpected “already exists” behavior on adoption requires reconciliation, not a blind baseline.
4. Database owner chooses corrected pending SQL/fix-forward procedure or restore. Do not edit previously applied migration history to pretend it did not run.
5. Recheck ledger, actual schema/security/data and old/new application compatibility before resuming release.

### F. New release is bad

1. Pause auto-deploy and preserve release/image/build IDs and bounded logs.
2. Decide whether current database is compatible with the previous backend/frontend.
3. Roll back the correct artifact with `--no-build` or use fix-forward/recovery for incompatible schema/data changes.
4. Persist the rollback reference in managed configuration so subsequent automation does not redeploy the failed version.
5. Repeat strict probes and affected business journeys; do not stop at Docker healthy.

### G. Scheduled jobs or email appear inactive

1. Check workflow target variable, schedule/manual run, and whether it skipped successfully due to missing `CRON_SECRET`.
2. Compare secret-manager versions on GitHub/backend without displaying values. Backend unset secret returns 503; mismatched secret returns 403.
3. Check job response and actual processed state. A successful request can represent no eligible records, disabled downstream configuration or provider failures handled by application logic.
4. For mail, verify API key, verified sender/domain, correct frontend link origin and recipient delivery. The mailer is no-op without a key and logs provider failures without throwing them into callers.
5. Use the payment-specific runbook for reconciliation discrepancies; avoid blind retries of money-changing actions.

### H. Suspected secret exposure

1. Restrict affected access and preserve sanitized incident evidence. Do not paste the secret into chat/tickets to confirm it.
2. Rotate/revoke the relevant credential with its provider, update secret stores and dependent deployments/jobs, and verify the old credential no longer works.
3. Rebuild browser artifacts if an inappropriate secret entered public build configuration; removing it from current source does not revoke previously delivered assets/history.
4. Investigate logs, git history, artifact layers and provider access records. Plan approved history/artifact remediation after revocation, not instead of it.
5. Reassess sessions and realtime clients after JWT/signing changes. HTTP auth includes a Supabase fallback while realtime uses local verification; do not assume one secret change universally invalidates every session in the same way.
6. Record exposure scope, recovery, notification obligations and prevention work. Gitleaks uses allowlists/detection rules and cannot guarantee prevention of every secret leak.

## 9. Current operational gaps to disposition

These are source-verified limitations or items requiring external evidence, not claims that the hosted deployment is currently broken:

| Gap | Required disposition before relying on the capability |
| --- | --- |
| No checked-in backend server deploy/migration job | Document hosted deployment owner and gate database-before-code ordering |
| Image publishing independent of CI success | Require verified candidate checks and artifact provenance outside publication alone |
| Liveness-only Docker/Caddy checks | Add external strict readiness/business acceptance and intentional traffic policy |
| Readiness only samples selected schema | Maintain migration/grant/data evidence; never use it to justify full baseline |
| Full-baseline command and permissive ledger-read error handling | Require reviewed adoption reconciliation and explicit target/connectivity checks |
| Scheduled smoke is partial and permissive | Immediate strict post-deploy checks and a known authenticated workspace/account |
| No explicit pager/log collector provisioning | Configure and demonstrate independent collection, routing and acknowledgment |
| Browser source maps/release association not fully wired | Implement or document diagnostic limitations with an owner |
| Redis fallback/adapter recovery not a scale guarantee | Rehearse outage/recovery and cross-replica delivery; monitor user-visible freshness |
| Immediate signal exits and fire-and-forget event persistence | Measure shutdown behavior; do not promise lossless draining/log durability |
| Local-only dump retention and destructive non-atomic restore | Schedule/monitor off-host backups, protect archives and perform complete restore drills |
| Jobs skip successfully without secrets | Monitor effective last run and provider outcome, not only GitHub green status |
| Frontend and desktop separate release boundaries | Track correct public build settings, native version/update/signing and representative device acceptance |

## 10. Release closure

- [ ] Release record contains actual migration, artifact, CI, probe and business-acceptance evidence.
- [ ] No critical readiness failure, unexplained data inconsistency or unowned security/payment issue remains.
- [ ] Any `degraded` check has a named owner, accepted impact and retest deadline.
- [ ] Observability/alert delivery and scheduled effective runs are verified for the release.
- [ ] Previous artifacts and recovery points remain available for the agreed rollback window.
- [ ] Paused automation is safely resumed, managed configuration matches the intended running artifact and temporary access/diagnostics are removed.
- [ ] Launch decision, observation outcome, residual risks and follow-up owners are recorded.

A release is ready when the accountable team accepts this evidence and its residual risks—not when every box has been pre-filled by a documentation update.
