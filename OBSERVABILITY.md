# Observability, probes and operational alerts

This document separates implemented instrumentation from monitoring that operators must provision. Source wiring does not prove that a DSN, log collector, alert recipient or production monitor is active. Keep evidence of actual delivery and recovery with each release in [LAUNCH_READINESS.md](LAUNCH_READINESS.md).

## 1. Signal inventory

| Signal | Implementation | What it does not prove |
| --- | --- | --- |
| Process liveness | `GET /api/health`, `health.controller.ts` | Database, Auth, schema, storage, Redis or business functionality |
| Dependency readiness | `GET /api/health/ready`, `health.service.ts`, `readiness.ts` | Full schema equivalence, write correctness, RLS/grants, payments, email or realtime fan-out |
| Request tracing | `common/request-tracing.middleware.ts` | A provisioned metrics backend or an exact complete request-count dataset in `operational_events` |
| HTTP exception reporting | `common/http-exception.filter.ts` | Every operational failure is sent to Sentry; explicit capture is for 5xx exceptions |
| Domain/operational events | `observability/observability.service.ts`, Supabase `operational_events` | Durable queuing, guaranteed persistence or external alert dispatch |
| Backend Sentry | `src/instrument.ts`, imported first by `main.ts` | Enabled reporting without process-level DSN configuration |
| Frontend Sentry | `src/instrumentation.ts`, `src/instrumentation-client.ts` | Source-map upload, browser release binding or a configured Sentry alert rule |
| Desktop Sentry | `apps/desktop/src/main.js` | An instrumented offline transaction system or verified crash-report delivery |
| Scheduled smoke | `.github/workflows/smoke.yml`, backend `scripts/smoke.mjs` | A strict release gate, comprehensive end-to-end flow or guaranteed near-real-time paging |
| Scheduled business jobs | Reconcile/reminder workflows | Execution when secrets are absent, or successful provider-side effects from an HTTP 200 alone |
| CI/security checks | Backend/frontend/secret-scan workflows | Current release success, mandatory branch protection or absence of undiscovered defects/secrets |

## 2. Exact HTTP probe contract

### Liveness

`GET /api/health` normally returns HTTP 200 with:

```json
{"status":"ok"}
```

It returns this constant when its controller runs. It performs no dependency checks. It is unauthenticated, but the application's global HTTP middleware and throttler still apply; a proxy/network error or rate-limit response is possible. Do not describe it as incapable of failing.

`GET /` is a separate Express handler returning the API name, `status: "ok"` and `health: "/api/health"`. It is the smoke script's process-up check, not a replacement for readiness.

### Readiness status and body

`apps/backend/src/health/readiness.ts:59` derives the report status:

| Aggregate status | HTTP status | Meaning |
| --- | --- | --- |
| `ok` | 200 | No critical failures and no warnings/non-critical failures |
| `degraded` | 200 | No critical failure, but at least one warning or non-critical failure |
| `error` | 503 | At least one critical check has status `fail` |

Individual checks use **`pass`, `warn`, `fail`**, not the aggregate vocabulary. The public controller returns only aggregate `status`, ISO `checkedAt`, and check names/statuses. A shortened illustrative response is:

```json
{
  "status": "degraded",
  "checkedAt": "2026-09-17T00:00:00.000Z",
  "checks": [
    {"name": "supabase.auth", "status": "pass"},
    {"name": "redis", "status": "warn"}
  ]
}
```

The actual check list is longer. **The public response deliberately omits `critical` and `message`.** It does not expose project references or detailed dependency errors. Detailed per-check diagnostics are written by the startup readiness logger. A later request computes a fresh report but does not call that startup logger again; do not expect every failed poll to produce those detailed messages.

### Implemented checks

| Check name | Critical? | Current test and interpretation |
| --- | --- | --- |
| `env.SUPABASE_URL` | Yes | Non-empty configured URL; not complete URL/network validation |
| `env.SUPABASE_SERVICE_ROLE_KEY` | Yes | Non-empty value; never returned publicly |
| `env.SUPABASE_JWT_SECRET` | Yes | Non-empty value; does not prove token-signing compatibility |
| `supabase.project_match` | Yes | Compares URL project ref with JWT-style key ref when both can be extracted; passes if either cannot be determined, so not a complete credential check |
| `cors.origins` | Yes, production only | At least one configured origin; boot validation separately rejects `*`; does not verify the deployed frontend's origin is present |
| `supabase.auth` | Yes | Calls Auth admin `listUsers({page:1, perPage:1})` using the service-role client |
| `database.billing_schema` | Yes | Reads `bill_sequences.id` and `invoices.bill_number`; failure can be missing schema, access or connectivity, not necessarily an unapplied migration |
| `database.required_columns` | Yes | Selects the five explicitly listed required columns below; unreadable queries also fail |
| `storage.buckets` | No | Lists bucket names `menu-images` and `restaurant-branding`; missing/unreadable buckets warn; does not test upload/download or policies |
| `data.workspaces` | No | Counts `restaurants`; zero rows or count error warns; does not test a user's membership or onboarding |
| `redis` | No | Warns when no client exists or PING fails; passes after a successful ping; not a pub/sub or distributed-throttler functional test |

Current required-column probes (`apps/backend/src/health/health.service.ts:21`):

| Columns | Migration identified in internal diagnostics |
| --- | --- |
| `restaurants.phone`, `restaurants.address`, `restaurants.email` | `20260816_restaurant_contact.sql` |
| `invoices.customer_gstin` | `20260819_invoice_customer_b2b.sql` |
| `menu_items.description` | `20260830_menu_item_description.sql` |

The billing-schema diagnostic references `20260626_billing_printing_upgrade.sql`. Neither probe verifies the complete contents of those migrations, much less all later payment/security/data migrations. An `ok` response is not evidence that baselining the entire migration directory is safe.

Dependency groups run concurrently with `Promise.all`; the service adds no explicit overall probe deadline. Keep monitor timeouts bounded and distinguish a timeout from a valid HTTP 503. High-frequency readiness polling causes real Supabase requests, including Auth administration and restaurant counts; use liveness for cheap frequent process checks and a measured readiness cadence.

### Startup and container behavior

- Required env validation can abort startup before the port is listening.
- Once listening, the startup readiness summary logs `OK`, `DEGRADED` or `ERROR`. A failed readiness report does not itself crash the process.
- Dockerfile and Compose healthchecks hit `/api/health` every 30 seconds, timeout after five seconds, allow a 20-second start period, and use three retries.
- Caddy's configured upstream `health_uri` is also `/api/health`.
- Compose starts Caddy after backend liveness becomes healthy. No checked-in routing rule gates user traffic on `/api/health/ready`.
- Docker `restart: unless-stopped` handles process exits, not automatic recovery from a mere unhealthy status.

Provision a readiness-aware traffic policy externally if needed. Avoid recycling every instance solely because a shared database is unavailable; that can add restart noise without restoring the dependency.

### Probe commands

Set a non-secret origin for the intended environment, without `/api`:

```bash
export API_ORIGIN=https://api.example.com
curl --fail-with-body --max-time 15 -i "$API_ORIGIN/api/health"
curl --fail-with-body --max-time 30 -i "$API_ORIGIN/api/health/ready"
```

To compare ingress with the container-local route without exposing the backend port:

```bash
export ENV_FILE=.env.production
docker compose --env-file "$ENV_FILE" -f compose.production.yml exec -T backend node -e "fetch('http://127.0.0.1:3001/api/health/ready').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

Both examples accept HTTP 200 `degraded` at the transport level. A release gate must parse the aggregate status and approved warnings explicitly. A monitor should reject malformed JSON, missing expected fields/checks and unexpected statuses rather than treating any response below 500 as healthy.

## 3. Request and operational logs

### Request identity

The middleware uses inbound `x-request-id` when supplied, otherwise a UUID. `x-correlation-id` defaults to the request ID. Both are echoed in response headers and attached to relevant exception/events. Treat inbound identifiers as untrusted correlation labels, not authenticated user identity.

Request summaries include:

- `request_id`, `correlation_id`, HTTP method and query-stripped endpoint;
- response status, rounded `duration_ms` and counted `response_bytes`;
- restaurant ID extracted from `/restaurants/:id`, user ID when available;
- route class and user-agent.

The exception filter returns `statusCode`, timestamp, path and error content, and records `exception.http` for HTTP 4xx or `exception.unhandled` for 5xx. It explicitly captures 5xx exceptions in Sentry with endpoint/method/status tags and request/correlation IDs.

### Slow, large and server-error handling

`apps/backend/src/common/request-tracing.middleware.ts:7` uses fixed thresholds:

| Condition | Log/event behavior |
| --- | --- |
| Duration at least 1,000 ms | Warning request summary plus throttled `endpoint.slow` event |
| Response at least 256 KiB and not slow | Warning request summary plus throttled `endpoint.heavy_response` event with info severity |
| Neither above, status at least 500 | Throttled `endpoint.server_error` event |
| Otherwise | Normal request summary log |

The slow/large branch returns before the server-error branch. A slow 5xx therefore has a slow event rather than both middleware events; an exception may additionally have its own filter event. Response-byte counting is middleware instrumentation, not a validated wire-level billing/network metric.

Do not divide `operational_events` error rows by its total row count to estimate request error rate: ordinary requests are not all persisted there, some incidents generate multiple event types, and alert-like events are throttled. A complete request denominator requires ingress/application metrics or a normalized log pipeline.

### Persistence and alert naming

`ObservabilityService.record()` writes a structured log and starts a non-awaited Supabase insert. Insert failures log `observability.persist_failed`; there is no retry queue or guaranteed flush at shutdown. During a Supabase outage, the event table may be unavailable precisely when diagnostics are most important. Retain logs independently of that database.

`recordAlert()` is **not an external notification sender**. It applies an in-process `Map` cooldown, adds `metadata.alert=true` and calls `record()`. Default cooldown is five minutes; request slow/large alerts specify 60 seconds and server errors 30 seconds. Cooldowns are process-local, reset after restarts and are not distributed through Redis.

There is no checked-in Slack/PagerDuty/email dispatch for these alert records, no general operational-events retention job and no log collector/dashboard provisioning. Operators must implement collection, retention, access control, routing and delivery tests.

### Privacy and access

Operational metadata/stack sanitization masks sensitive key names, bearer/JWT-like strings and card-like digit sequences, with depth/string/array limits. This is not comprehensive PII removal:

- Top-level event `message`, endpoint and some other fields are not passed through that sanitizer.
- Query strings are removed from traced endpoints, but path segments can contain identifiers or guest tokens.
- User/restaurant IDs, user-agent and exception messages may still be sensitive.
- Backend Sentry's scrub is not identical to frontend/desktop configuration.

Use restricted log access and retention, review captured payloads in staging, and redact before sharing evidence. Never paste authorization headers, cookies, connection strings, webhook secrets or real environment files into an incident ticket. Secret scanning is defense-in-depth, not permission to log secrets.

## 4. Sentry configuration and validation

### Environment matrix

| Process | Enablement | Release and sampling behavior |
| --- | --- | --- |
| Backend Node | `SENTRY_DSN` present before first import | Reads `SENTRY_RELEASE`; `SENTRY_TRACES_SAMPLE_RATE` defaults to 0 |
| Frontend Node/edge | `SENTRY_DSN` when `register()` runs in `nodejs`/`edge` runtime | Reads `SENTRY_RELEASE`; server trace rate defaults to 0; `onRequestError` exports Sentry capture |
| Frontend browser | `NEXT_PUBLIC_SENTRY_DSN` baked into the build | Trace and both replay rates are explicitly 0; initialization does not explicitly set `release` |
| Desktop main process | `QR_DINES_DESKTOP_SENTRY_DSN`, falling back to `SENTRY_DSN` | Initializes Electron Sentry with trace rate 0; no explicit release/environment assignment in that call |

Backend initialization runs before `loadEnvironment()`. Inject DSN/release through Compose or the process manager rather than depending on a file loaded later. Browser public configuration needs a new frontend build when changed. Merely setting server `SENTRY_RELEASE` does not demonstrate that browser events have the same release tag.

Backend, frontend server and browser use `NODE_ENV` as their Sentry environment. Staging in Compose intentionally uses `NODE_ENV=production`, so it also emits that environment label. Separate staging DSNs/projects are necessary unless additional environment separation is implemented; do not set an unsupported `NODE_ENV=staging` to try to fix labeling.

### Capture and privacy behavior

Backend `sendDefaultPii` is false and `beforeSend` deletes request cookies, headers and data. It does not explicitly scrub every URL, exception message or custom field. Frontend server/browser use `sendDefaultPii:false` without that backend scrub. Browser replay is disabled. Validate actual events and provider-side scrubbing before enabling higher-volume reporting.

The backend filter intentionally excludes 4xx from explicit exception capture. A 429 storm therefore needs status metrics/log monitoring, not reliance on that Sentry crash stream. Similarly, the readiness controller directly sends HTTP 503 for a failed report; this is not an exception passed to the filter, though request middleware can record a server-error event.

`next.config.ts` does not use `withSentryConfig`; checked-in workflows do not upload frontend source maps or create Sentry releases. Providing `SENTRY_AUTH_TOKEN` alone does not enable an upload pipeline. Source-map upload and reliable client/server release association remain separate work.

### Activation procedure

1. Create/select separate projects for production and staging; identify owner, quota, retention and permitted data classes.
2. Inject DSNs into the correct process/build scope and assign the deployed backend/server release SHA explicitly.
3. Start with trace sampling at zero. Any change should be a valid finite rate between 0 and 1 with an agreed volume budget; the code passes a numeric conversion rather than enforcing a custom validation policy.
4. Deploy and generate a controlled, non-sensitive test event in staging using an approved test mechanism. No public test-error endpoint is provided; do not create production failures just to test paging.
5. Verify event receipt, environment/project, release, stack usefulness, data scrubbing and request correlation. Check browser network/CSP behavior; the frontend currently permits `https://*.sentry.io`, not every possible custom ingest domain.
6. Configure notification rules in Sentry and test the complete route to the on-call recipient, including acknowledgment and recovery. Ingest success alone is not alert success.
7. Repeat a safe deployment verification in production and record event/alert IDs without sharing sensitive event contents.

## 5. Redis and realtime signals

Redis readiness is non-critical by design: warning means HTTP 200 `degraded`, not 503. Set a stronger operational launch rule if multiple replicas require Redis even though the app's probe classification remains non-critical.

Important distinctions:

- `RedisService.isConnected` means a client object exists, not that the socket is currently ready. The readiness PING provides an additional live check.
- Initial connection failure disconnects the attempted client and allows backend startup to continue. After a previously successful connection, retries use bounded backoff up to five seconds.
- HTTP throttling falls back per command to local memory when Redis operations fail. That preserves a limiter, not globally consistent counters.
- Gateway adapter attachment is attempted at initialization. A missing/failed adapter is not periodically reattached by the gateway; a later Redis PING pass is insufficient evidence that fan-out recovered.
- The boot code calls `recordRedisStatus('connected')` after the connection attempt even if that attempt failed. A `redis.connected` event alone must not be used as the authoritative healthy signal.
- Redis error events are swallowed by the service's background error listener; no continuous Redis lifecycle alert subscription is wired there.

The frontend waits for `realtime.ready` before reporting an authenticated room join. Connection setup includes a JWT and restaurant ID; server authorization checks membership and realtime entitlement. A working unauthenticated Socket.IO transport handshake is not equivalent to application authorization or event delivery.

Monitor actual kitchen/tab update latency and polling behavior in addition to Redis uptime. In staging, test clients on different replicas, Redis interruption/recovery and a clean backend restart after Redis is restored. Default Socket.IO transport negotiation is in use; review load-balancer affinity for polling rather than assuming WebSocket-only operation.

## 6. Scheduled automation: actual coverage

### Post-deploy smoke workflow

`.github/workflows/smoke.yml` runs every **30 minutes** and by manual dispatch. It is not triggered on backend deployment completion. The target expression prefers dispatch `base_url`, then repository variable `SMOKE_BASE_URL`, then the source's Render default. The dispatch input itself has a default, so set it deliberately when manually checking staging.

The script accepts an origin without `/api` and checks:

1. `GET /` using `response.ok`.
2. `GET /api/health/ready`, rejecting HTTP >=500 or aggregate `status: "error"`.
3. When **both** `SMOKE_EMAIL` and `SMOKE_PASSWORD` are set: login for an access token, list restaurants, and read the first restaurant's subscription if a restaurant exists.

Limits that matter for release evidence:

- No credentials means authenticated checks are skipped and a run can pass.
- A valid account with no restaurants skips the subscription call.
- The script attempts to filter checks by `critical`, but that field is omitted by the public readiness controller. Normal failure detection relies on HTTP 503/aggregate `error` instead.
- `degraded` passes. The readiness branch does not strictly require HTTP 200 or validate the expected JSON schema; unexpected sub-500 responses/missing status can escape that check.
- There is no per-request fetch timeout in the script.
- It does not place orders, test kitchen event delivery, issue invoices, print, send mail or complete payment checkout.

GitHub schedules can be delayed or disabled. Failed Actions runs rely on repository/user notification settings; this workflow has no explicit pager, Slack message or email delivery action. The comment about failure email is not a delivery guarantee. Configure independent monitoring and demonstrate who actually receives a failed run.

### Reconciliation and reminders

| Workflow | Schedule | Target/configuration |
| --- | --- | --- |
| Payment reconcile | `*/5 * * * *` | `API_BASE_URL` repository variable or source default; POST `/api/internal/payment-reconcile` |
| Trial reminders | `0 6 * * *` (UTC) | Same base-variable pattern; POST `/api/internal/trial-reminders` |

Both send `x-cron-secret` from GitHub's `CRON_SECRET` secret. If absent, the job prints a skip and exits successfully. The backend returns 503 when its secret is unset, 403 for an invalid supplied value, and uses a route limit of 10/minute. The workflows require exactly HTTP 200 after posting but do not validate all result fields or provider outcomes. They are not secret synchronization, guaranteed schedulers or delivery monitors.

Track last successful **effective** run, number of processed/failed items and actual provider state. A green skipped run is not an operational success. Coordinate secret rotation on both sides and verify the configured origin, especially when using staging.

## 7. Proposed SLOs and external alerts

These are starting objectives to approve and measure, **not achieved results**:

| Objective | Proposed target | Required measurement |
| --- | --- | --- |
| User-facing API availability | 99.9% over 30 days | External readiness plus representative business transaction checks; liveness alone overstates availability |
| API server-error ratio | <0.5% of eligible requests | Complete HTTP status denominator and normalized route metrics, excluding probes as agreed |
| Core read latency | p95 <500 ms | Real request histograms or validated log aggregation; include errors/timeouts in the reporting policy |
| Readiness | No critical failures; warnings explicitly reviewed | HTTP status and JSON body checks |
| Realtime delivery | Define restaurant-visible freshness budget before multi-replica launch | End-to-end event arrival/polling measurements, not Redis PING alone |
| Backup/recovery | Release-specific RPO/RTO approved after a drill | Backup age, off-host integrity and measured restore/cutover time |

Proposed alert policy, to provision in an uptime/metrics/log/Sentry system:

| Condition | Suggested initial action | Caveat |
| --- | --- | --- |
| Liveness fails twice at a one-minute cadence | Page on-call; compare ingress/container health | Threshold is a recommendation, not repository automation |
| Readiness 503, timeout or invalid response persists | Page on-call with failing check names | Do not expose internal dependency error details publicly |
| `degraded` or `redis: warn` | Notify owner; escalate immediately for multi-replica requirements | HTTP-only monitors miss this |
| Elevated 5xx ratio or error count | Alert using request metrics; correlate Sentry release | Sentry events are not a complete request denominator |
| Elevated 429s on core/auth/order routes | Inspect client-IP/proxy/rate-limit behavior | 4xx excluded from explicit Sentry filter capture |
| New production Sentry issue | Notify owning team; escalate by impact | Separate staging project needed with production-mode staging |
| `observability.persist_failed` or collector silence | Alert through independent log infrastructure | Database-backed alert queries fail during DB outages |
| Stale/missing backups or failed restore drill | Escalate to recovery owner | No scheduler/retention monitor is supplied |
| Reconcile/reminder last effective run stale | Notify integration owner | Green skipped Actions runs must not reset freshness |
| Certificate expiry, disk/memory pressure or restart loop | Infrastructure alert | Caddy issuance and restart policy do not replace monitoring |

Assign an owner, escalation path, quiet-hours policy and runbook for each enabled alert. Record both a delivery test and a recovery notification. Avoid declaring an SLO operational until the denominator, exclusions, dashboard and alert route are verified.

## 8. Investigation workflow and evidence

1. Record time window, affected tenants/features, frontend/backend/desktop release identities and recent configuration/migration changes.
2. Probe public liveness/readiness and inspect the response body. Compare with container-local checks to separate ingress from application/dependency failures.
3. Collect bounded logs from the correct environment:

   ```bash
   docker compose --env-file "$ENV_FILE" -f compose.production.yml ps
   docker compose --env-file "$ENV_FILE" -f compose.production.yml logs --since 15m backend caddy
   ```

4. Correlate request IDs with request summaries, operational events and Sentry. Do not assume an empty event table means no incident; inspect persistence failures and external logs.
5. Check startup `Readiness` and `Realtime` messages, process exits/signals, Redis PING status and migration evidence. Distinguish failure to start from a running but unready process.
6. Verify business state before retrying state-changing requests. For billing/payment incidents, use [PAYMENTS_GO_LIVE.md](PAYMENTS_GO_LIVE.md) and the launch recovery plan.
7. Preserve sanitized evidence, mitigation times and recovery verification. Remove temporary diagnostic access after the incident.

For restricted operational analysis, this query counts event categories, **not requests or error-rate percentages**:

```sql
select event_type, severity, count(*) as event_count
from public.operational_events
where created_at >= now() - interval '15 minutes'
group by event_type, severity
order by event_count desc;
```

## 9. Known observability work still required

- Independent log aggregation, metrics storage, retention and alert routing with verified recipients.
- Strict readiness JSON/HTTP release validation and immediate post-deployment integration, beyond the current scheduled smoke script.
- External availability monitoring with effective business-flow checks and a documented maintenance policy.
- Reliable all-request status/latency metrics; no checked-in OpenTelemetry collector or complete RED dashboard deployment.
- Frontend source-map upload and explicit, verified browser release association.
- Real-dependency smoke/acceptance for order-to-kitchen-to-bill, email and payments; frontend Playwright CI currently uses mocked API behavior.
- Redis adapter recovery/fan-out evidence, distributed-limit behavior during failure and monitored shutdown/drain behavior.
- Backup freshness, restore acceptance and provider job outcome monitoring.

Track these as owned operational work, not as automatically completed capabilities because supporting libraries or workflow files exist.
