# QR Dines — Consolidated Roadmap

Ship a **production-grade Windows desktop POS (Electron)** and close the reliability,
feature, and performance gaps surfaced during the Aug 2026 hardening and the
contact-on-bill incident.

**Effort key:** `S` ≤ 1 day · `M` ~2–4 days · `L` ~1–2 weeks.
Each item lists: _what · why · effort · depends-on · acceptance_.

Production DB is Supabase project **`zjbszlsulqxzayvdpbtd`** (not `rqaqnkgibpqdexcevmuy`).
Backend auto-deploys from `master`; frontend on Vercel; migrations are **not** auto-applied.

---

## Track A — Reliability & correctness (P0, do first)

Cheap fixes that prevent repeats of the outage and the "Settings vanished" confusion.

- **A1 · Fix the silent role/entitlement downgrade** · ✅ **done (b710f7b, 2026-08-19)** — backend throws on resolve error (+3 tests), store gains error/retry, loader retries 3× then flags error (no silent staff), app-shell shows skeleton/Retry not a downgraded nav; 3 Playwright e2e cover all states.
  - _What:_ `resolveRestaurantRole(...) ?? 'staff'` (backend) and `subscription.role ?? 'staff'`
    (`entitlements-loader.tsx`) silently strip a real owner to `staff` on any failed/slow resolve.
    Distinguish **loading vs resolved-as-staff**, retry the subscription fetch, and surface an
    error instead of quietly hiding owner UI. Gate owner-only nav on `useEntitlementsLoaded()`.
  - _Why:_ Root cause of Settings disappearing after the outage.
  - _Acceptance:_ a genuine owner never sees staff nav after a transient fetch failure; a spinner
    (not a downgraded UI) shows while unresolved; failed resolve shows a retry, not silent staff.

- **A2 · Startup schema guard** · ✅ **done (4f145aa)** — `database.required_columns` readiness check probes code-required columns (seeded with `restaurants.phone/address/email`); a missing one is a critical readiness failure naming the migration, surfaced at boot (`logStartupReadiness`) + `/health/ready`. +2 tests; verified `database.required_columns: pass` in prod.
  - _What:_ On boot, assert required columns/tables exist (or run pending migrations); fail fast
    with a clear _"apply migration X"_ message instead of serving `column ... does not exist`.
  - _Why:_ Schema/code drift (missing `restaurants.phone`) took the whole app down cryptically.
  - _Acceptance:_ booting against a DB missing a required column logs an actionable error and the
    readiness probe fails; it does not silently 400 every request.

- **A3 · Post-deploy smoke test** · ✅ **done** — `apps/backend/scripts/smoke.mjs` (`npm --prefix apps/backend run smoke [url]`) checks root + `/health/ready` critical checks, plus optional authed `login → restaurants → subscription` when `SMOKE_EMAIL/PASSWORD` are set; scheduled + on-demand CI in `.github/workflows/smoke.yml`. Verified green against prod.
  - _What:_ A script/CI job hitting `login → listRestaurants → subscription → health/ready` after
    each deploy; alert on non-2xx.
  - _Why:_ Nothing caught today's outage before users did.
  - _Acceptance:_ a deploy that breaks login fails the smoke job within a minute.

- **A4 · Migration-before-deploy discipline** · ✅ **done** — `apps/backend/scripts/migrate.mjs` (`npm --prefix apps/backend run migrate` / `migrate:status` / `migrate:baseline`): idempotent psql runner with a `schema_migrations` tracking table; documented "migrate before push" rule in `docs/DEPLOYMENT.md`. First prod use: run `migrate:baseline` once (records existing migrations without re-running), then `migrate` before each schema-dependent push.
  - _What:_ A `migrate` npm script + a documented "apply migrations, then push" order (or a
    release step that applies `apps/backend/supabase/migrations/*` to prod before the code goes live).
  - _Why:_ Code auto-deploys but migrations are manual → drift.
  - _Acceptance:_ a schema-dependent change can't reach prod before its migration.

---

## Track B — Security & ops cleanup (P0, small)

- **B1 · Rotate the exposed DB password** · `S` (user action)
  - The `DATABASE_URL` Postgres password surfaced in chat + env screenshots. Reset it
    (Supabase → Settings → Database), update host env + local `.env`.

- **B2 · Purge seed data + test account from prod** · `S`
  - Remove restaurant `00000000-0000-0000-0000-000000000001` (seed "Demo"/"kef") and the
    known-password `owner@qrdines.local`. The cascade is blocked by the
    `prevent_finalized_invoice_mutation` trigger (a finalized seed invoice) — either delete the
    seed invoice first via the allowed path, or drop children in FK order, then the restaurant.
  - _Acceptance:_ no seed rows or public-credential accounts remain in `zjbszlsulqxzayvdpbtd`.

- **B3 · Redis decision** · ✅ **decided: single-instance, Redis optional** — documented in
  `docs/DEPLOYMENT.md` (§ Scaling & connection pooling): the backend runs fine single-instance on the
  in-memory fallback (rate-limit + realtime are per-instance; `/api/health/ready` reports Redis a
  non-critical `warn`). Set `REDIS_URL` (Upstash `rediss://…`) only to scale to 2+ replicas.

- **B4 · Project-mismatch guardrail** · ✅ **done (pre-existing)** — the `supabase.project_match` readiness check verifies `SUPABASE_URL` and the service-role key target the same project and logs the ref at boot; prod ref pinned in docs/memory.
  - Prevent the "ran SQL on the wrong project" class of error: pin the prod project ref in docs,
    and have the startup log print which Supabase ref it connected to.

---

## Track C — Windows desktop app (Electron) — flagship

**Decisions locked:** Electron; window **loads the hosted frontend**; native **print bridge reuses
the existing `escpos-encoder.ts`** byte stream over IPC. Online-first (SaaS); existing
`offline-queue`/`offline-store` cover wifi drops.

- **C1 · Electron shell** · ✅ **scaffolded** — `apps/desktop/` (standalone package, kept out of the npm workspace so Electron doesn't touch backend/frontend CI). Hardened main (`contextIsolation`/`sandbox`/no nodeIntegration; off-origin → system browser), single-instance lock, app menu, Sentry gated on DSN, `QR_DINES_APP_URL` env (default prod). Preload exposes a minimal `window.qrDinesDesktop` bridge for C2. Syntax/JSON verified; **launch/window not verifiable in the sandbox — run `cd apps/desktop && npm install && npm run dev` on-machine to confirm.**
  - _What:_ New `apps/desktop/` (Electron + electron-builder). Main process opens a `BrowserWindow`
    to the hosted URL; single-instance lock; app menu; Sentry (reuse Sprint-3 wiring) for main +
    renderer crash reporting; environment-switch (prod/staging URL).
  - _Acceptance:_ `npm run desktop:dev` opens the live app in a native window on Windows; crashes
    report to Sentry.

- **C2 · Native print + cash-drawer bridge** · ✅ **code-complete (USB-via-Windows-driver path)** — renderer detects `window.qrDinesDesktop.printRaw` and routes ESC/POS (same `encodeReceipt()` bytes, incl. cut + drawer) to the Windows spooler via `apps/desktop/src/printing.js` (PowerShell → `winspool.drv`, RAW datatype; empty name → default printer). New `DesktopPrinterAdapter` preferred in `printer-service.resolveAdapter` when the bridge exists; WebUSB/browser unchanged otherwise. Verified: tsc/eslint/next build + 7/7 e2e (no regression) + Electron syntax. **Windows print itself is on-machine-only (no Windows/printer/GUI in the sandbox).** Network/USB-direct transports remain pluggable follow-ups.
  - _What:_ IPC channel `print:receipt` / `print:kot` / `drawer:kick`. Renderer sends the same
    `encodeReceipt()` / `encodeKot()` `Uint8Array` it builds today; main process writes it to the
    Windows printer (raw ESC/POS via `node-thermal-printer`/`@node-escpos` or the print spooler),
    supporting USB, serial, and network printers + drawer kick. Add a thin desktop printer adapter
    to the existing pluggable `printer-service` so the web WebUSB path is unchanged.
  - _Why:_ Solves the cross-platform printing gap (WebUSB is Chrome-desktop-only) on Windows.
  - _Acceptance:_ a bill prints silently to any Windows-installed thermal printer and kicks the
    drawer, with no WebUSB.

- **C3 · Production packaging** · ✅ **code-complete (cert pending)** — NSIS installer config + `electron-updater` (GitHub Releases feed, checks on launch/hourly, installs on quit) wired in `apps/desktop`; `.github/workflows/desktop-release.yml` builds + publishes on a `desktop-v*` tag (windows-latest). Signing is config-free — electron-builder auto-signs when `CSC_LINK`/`CSC_KEY_PASSWORD` (or repo secrets `WINDOWS_CSC_*`) are present; **needs the OV/EV Authenticode cert dropped in.** Unverified off-Windows.
  - _What:_ Authenticode **code signing** (OV/EV cert), NSIS installer (`.exe`/MSI),
    **auto-update** via `electron-updater` + signed releases (GitHub Releases or S3).
  - _Acceptance:_ signed installer runs without SmartScreen warnings; a new release auto-updates
    an installed client.

- **C4 · Till hardening** · ✅ **code-complete** — `QR_DINES_KIOSK` fullscreen lockdown, `QR_DINES_AUTOSTART` login launch, `safeStorage`/DPAPI-encrypted `secureStore` bridge (`apps/desktop/src/secure-store.js` + preload), and a local offline/auto-retry screen (`offline.html`). **Frontend now opts in**: `session-store.ts` persists the token via `secureStore` inside the shell (browser path stays sync localStorage — verified unchanged by the login e2e). Unverified off-Windows.
  - _What:_ Token storage via Electron **safeStorage** (DPAPI) not localStorage; optional
    kiosk/full-screen + auto-start on boot; deep-link/relaunch handling; offline polish for the
    till (queue flush on reconnect).
  - _Acceptance:_ tokens are OS-encrypted; the app can run locked-down on a counter PC and survives
    a wifi blip mid-bill.

---

## Track D — Cross-platform printing (web clients)

- **D1 · Fallback print chain for the web app** · ✅ **done (covered by the browser adapter)** —
  `resolveAdapter` (`printer-service.ts`) already falls back to `BrowserPrinterAdapter` whenever WebUSB
  and the desktop bridge are unavailable, so any device (iPad/Safari/Android) prints the same receipt
  HTML through the OS print dialog — which itself offers AirPrint + Save-to-PDF/share. billing-view's
  one-click `printReceiptNow` passes the configured `connection_type` and inherits this fallback.
  - _What:_ For non-Electron devices (iPad/Safari/Android), chain WebUSB → system print dialog →
    PDF/share so "one-click bill" works everywhere, not just Chrome-desktop.
  - _Depends on:_ complements C2 (desktop covers Windows; this covers everything else).

---

## Track E — Feature gaps

- **E1 · Customer / B2B details on invoices** · ✅ **code-complete (committed local, needs migration+push)** — `customer_gstin` + `customer_address` added (customer_name already existed) end-to-end: migration `20260819_invoice_customer_b2b.sql`, finalize DTO + best-effort post-RPC update, print-payload columns, thermal/PDF/HTML-preview/ESC-POS/live-preview render, billing-form inputs + store + offline draft/queue. A2 guard updated. Slices `e378d9c` (backend) + `42587a1` (frontend). **HOLD push until the migration is applied to prod (`zjbszlsulqxzayvdpbtd`).**
  - _What:_ Add `customer_name` / `customer_gstin` / `customer_address` to invoices (schema +
    finalize DTO + optional billing-form block + thermal/PDF/preview render). Enables GST B2B
    invoices. Follows the same pattern just used for restaurant contact fields.
  - _Acceptance:_ a bill can carry and print a customer's name/GSTIN/address.

- **E2 · Real payments (Razorpay)** — expanded into its own **Track I — Payment gateway** below.

- **E3 · Event sounds (kitchen/waiter)** · ✅ **done** — `lib/sound/chime.ts` refactored to a
  mute/volume-aware `playPattern`; added `playNewOrderChime` (KDS ping) + `playWaiterCallChime`, wired to
  the realtime `onEvent` in `incoming-orders-view.tsx` (plays on `placed` / `service_requested`, then
  reloads). Per-device mute/volume in `lib/sound/sound-prefs.ts` (localStorage + `useSoundPrefs`), a mute
  toggle in the KDS header, and the existing print-success chime now respects it too. Autoplay-safe
  (gesture-gated, best-effort no-op). +6 unit tests.
  - _What:_ Extend the print chime (`lib/sound/chime.ts`) to new-order-on-KDS, waiter-call, and
    payment-success, with a per-device mute/volume setting. Respect autoplay (gesture-gated).
  - _Acceptance:_ ✅ KDS pings on a new order; a setting mutes/volumes it.

---

## Track F — Performance

- **F1 · Scope `force-dynamic`** · **won't do — by-design (2026-08-27)** — investigated + empirically
  tested. Stripping the root-layout `headers()` nonce read flips 18 routes `ƒ→○` (static) at build, proving
  the nonce read — not the `force-dynamic` flag (redundant belt-and-suspenders) — forces universal dynamic
  rendering. But static pages bake in Next's per-page inline Flight scripts (`self.__next_f.push(...)`) with
  **no nonce**, while `proxy.ts` still sends a fresh per-request `script-src 'nonce-…' 'strict-dynamic'` at
  runtime → every such script is blocked → blank/unhydrated app. Going static therefore means dropping the
  per-request nonce for a *static* CSP, and Next App Router emits no stable hashes for its inline scripts, so
  the only static-compatible option is `'unsafe-inline'` — a real strict-CSP downgrade. The routes that could
  be public/static are `/login` · `/join` · `/reset-password` (credentials + reset tokens) — exactly where
  weakening CSP is unacceptable; authed routes gain nothing from static (client-rendered), and `/t/[token]`
  stays dynamic anyway (dynamic segment) + can't be nonce-CSP-cached (nonce reuse). **Conclusion:** the
  current `force-dynamic` + nonce CSP is correct — a documented Next.js tradeoff (strict nonce CSP ⇒ dynamic
  rendering), not incidental cruft.
  - _Perf intent handled the safe way instead:_ the real goal (faster public guest menu) is served by
    `Cache-Control` on the public reads `GET /public/t/:token` + `/menu` (`public, max-age=30,
    stale-while-revalidate=60`, in `ordering.controller.ts`) — zero CSP change. Order status + mutations stay
    uncached so live tracking is fresh.

- **F2 · Collapse the login API waterfall** · **rescoped → `M`, deferred (2026-08-27)** — the premise
  doesn't hold: the real bootstrap is `login → listRestaurants → (on dashboard) getSubscription`, and each
  call genuinely depends on the previous one's output (subscription needs the restaurant id). There's no
  independent `settings` leg to parallelize (settings are fetched lazily per feature page). The only real
  "collapse" is a **new single `/bootstrap` endpoint** returning restaurants + subscription in one round-trip
  — an `M`, and it touches the A1-hardened entitlements loader, so not the `S` this was billed as. Deferred
  until the one saved round-trip is worth that risk.
  - _What (original):_ Login fires `restaurants → subscription → settings` serially. Parallelize or add a
    single bootstrap endpoint.
  - _Acceptance:_ time-to-interactive after login drops measurably; fewer sequential round-trips.

---

## Track G — Invites (improve)

_Current:_ `team.service.ts` creates token invites (`restaurant_invites`, email/role/token/expiry)
and supports revoke; `team-view.tsx` generates a `/join?token=…` link the owner **shares manually**
— **no email/SMS is sent**, no resend.

- **G1 · Real invite delivery** · ✅ **wired (needs API key to activate)** — on invite, the backend
  emails the `/join` link via Resend's REST API (`apps/backend/src/team/invite-email.ts`, dep-free
  fetch), boot-safe/no-op without `RESEND_API_KEY`. Default sender is Resend's test address
  (`onboarding@resend.dev` — only reaches your own Resend email until a domain is verified + set via
  `INVITE_EMAIL_FROM`). `APP_BASE_URL` sets where `/join` points. +tests, +`.env.example`.
  **To go live: add `RESEND_API_KEY` (+ verified domain for real staff).**
  - _What:_ Send the invite link by transactional **email** (Resend/SES/Supabase) — and optionally
    WhatsApp/SMS — so the owner no longer copy-pastes. Templated, with restaurant name + role + expiry.
  - _Acceptance:_ an invited address receives a working join link without the owner sharing it manually.
- **G2 · Resend + copy + QR (+ WhatsApp)** · ✅ **done** — QR + WhatsApp + copy on the invite form
  (as before), and now **each pending invite in the list** offers Copy link / WhatsApp / **Resend email**
  (the list returns the token; resend refreshes the expiry + re-emails best-effort). `listTeam` exposes
  the token owner-scoped; new `POST .../team/invites/:id/resend`.
  - _What:_ Resend a pending invite (fresh expiry), a copy-link button, and a **QR code** for
    in-person onboarding.
  - _Acceptance:_ ✅ owner can resend, copy, or show a QR for any pending invite from the Team page.
- **G3 · Invite status UX** · ✅ **done** — each pending invite shows its expiry ("Expires in N days" /
  "Expired" in red) on the Team page; the `/join` page no longer dead-ends an expired invite — it shows
  who it was for + a clear "this invite has expired, ask for a resend" state (`previewInvite` returns an
  `expired` flag; accept/signup still reject). Also hardened: the seat count excludes expired invites, an
  already-member / self-invite guard, and the public preview endpoint is rate-limited.
  - _What:_ Show pending/accepted/expired/revoked with an expiry countdown; visually distinguish
    expired vs pending.
  - _Acceptance:_ ✅ each invite's state and time-left is clear on the Team page.
- **G4 · New-user join onboarding** · ✅ **done** — the invite `/join` signup now captures the
  hire's name and **auto signs them in** right after account creation (no re-typing the password on
  `/login`); they land straight in the workspace with the invited role (falls back to manual sign-in
  if auto-login hiccups). Backend `signupWithInvite` already created+linked the account.
  - _What:_ Smooth flow for an invitee **without an account** — create account from the invite →
    auto-link to the restaurant with the invited role (the join page already handles the token).
  - _Acceptance:_ a brand-new email can accept an invite and land in the workspace with the right role.

- **G5 · Forgot-password flow** · ✅ **built (needs RESEND_API_KEY to send)** — login page "Forgot
  password?" → backend `generateLink` (recovery token, server-side) → Resend emails a
  `/reset-password?token_hash=…` link → that page posts token+new-password → backend `verifyOtp` +
  admin `updateUserById`. No frontend Supabase client, no custom table (uses Supabase's recovery
  tokens), reuses the shared `common/mailer.ts`. Neutral responses (no account enumeration).
  **Reset can ONLY be delivered by email, so it requires `RESEND_API_KEY` (+ verified domain for
  real users) — unlike invites, there's no copy/QR fallback.**

---

## Track H — Customer portal (develop)

_Current:_ `guest-ordering-view.tsx` has menu + cart + place-order; menu **images already exist**
(Pro-gated `show_images`, `next/image` thumbnails); order status is **polled**
(`getGuestOrderStatus`) with **no visual tracker**.

- **H1 · Real-time order-status tracker with icons** · `M` — headline ✅ **Done**
  - _What:_ Icon timeline **Placed → Accepted → Preparing → Ready → Served** with per-step icons
    (Receipt/Clipboard/ChefHat/Bell/Utensils), done/current/upcoming states, a state-driven headline +
    header icon, and an "Updating live" indicator. Extracted into `guest-order-tracker.tsx`.
  - _Acceptance:_ ✅ the guest sees status transitions with icons and no manual refresh (auto-updates).
  - _Note:_ Kept the existing **8s polling** (`getGuestOrderStatus`) rather than socket.io — the realtime
    gateway is **auth-only**, so guests can't subscribe; true socket push would need a new public
    guest-scoped channel. Polling lag is negligible for minute-long prep states, so socket is a deferred
    optional upgrade if instant delivery is ever required.
- **H2 · Richer menu presentation** · `S` ✅ **Done**
  - _What:_ Dietary marks + modifiers/variants were already surfaced (`FoodTypeIndicator` + `OptionSheet`).
    Added a **search box** (flat cross-category results + empty state) and a **sticky category nav**
    (horizontal chips with scroll-spy active state + tap-to-jump that offsets the sticky header).
    Extracted into `menu-nav.tsx`.
  - _Acceptance:_ ✅ guest menu shows dietary marks + options, and guests can search or jump between categories.
- **H3 · Guest branding** · `S` ✅ **Done (logo + colours)**
  - _What:_ Restaurant **logo** on the guest portal (menu header + order tracker, via `next/image`) and a
    per-restaurant **brand colour** that themes the whole portal. Both surfaced via the public ordering
    context (`getContext` returns `restaurant.logo_url` + `restaurant.brand_color` from the `branding`
    setting; best-effort read, colour validated to `#rrggbb` to prevent CSS injection).
  - _Colours:_ new `POST /settings/restaurants/:id/branding/color` (merges into `branding`, preserving the
    logo) + a colour picker in the admin Branding tab. The guest view derives the `--color-brand-*` scale
    from the chosen hex (`brand-theme.ts`) and applies it to the document root, so buttons, active states,
    the timeline, and accents all adopt the colour.
  - _Acceptance:_ ✅ the portal reflects the restaurant's logo and colours.
- **H4 · In-portal actions** · `M` ✅ **Done**
  - _What:_ From the order tracker — **request bill** (new `POST /public/t/:token/bill`, mirrors call-waiter
    via a shared kind-aware `service_requests` helper; no migration since `kind` is unconstrained text),
    **call waiter** (already existed), and **reorder** ("Order the same again" keeps the just-placed cart and
    returns to the menu). Backend emits `service.requested` with `kind` so staff surfaces can distinguish.
  - _Acceptance:_ ✅ a guest can call a waiter / request the bill / reorder from their phone.
  - _Staff side:_ ✅ the incoming-orders view labels each open service request by `kind` — a Receipt icon +
    "requested the bill" vs a Bell icon + "called for a waiter" (`listServiceRequests` already returns `kind`,
    refetched on each realtime event).
- **H5 · Queue position / ETA** · `M` (optional) ✅ **Done (queue position)**
  - _What:_ Once the kitchen accepts an order, `getStatus` returns `queue_ahead` (active orders —
    placed/accepted/preparing — created before this one). The tracker shows "N orders ahead of you" /
    "You're next in the queue" and hides it once ready/served/billed. Best-effort (a count hiccup → null).
  - _Acceptance:_ ✅ the guest sees their place in line once the order is accepted.
  - _Note:_ A **time-based ETA is deferred** — there's no prep-time signal in the data, so a wall-clock
    estimate would be guesswork. Queue position is the honest, data-backed proxy; a real ETA would need
    per-item/kitchen prep-time tracking (a separate slice).

---

## Track I — Payment gateway (Razorpay)

_Current (updated 2026-08-18 — Razorpay webhook now fixed):_ `webhooks.service.ts` does timing-safe
HMAC validation **and** idempotent `payment.captured` reconciliation (`(provider, event_id)` upsert).
**I2 below is done.** Remaining: confirm the checkout side (I1), plus refunds (I3) and reporting (I4).

> **Provider decision — deferred to Phase 6.** Before building I1/I3/I4, revisit whether Razorpay is
> the right gateway vs. cheaper/free alternatives. Note: in India **UPI P2M has zero MDR**
> (govt-mandated), so a UPI-first collect flow can be near-free; compare against Cashfree / PhonePe
> PG / Paytm on fees, payout speed, and API quality. The webhook receiver (I2) is provider-agnostic
> enough to adapt.

- **I1 · Checkout + order creation** · `M` — _confirm status (no Razorpay order-creation endpoint found in backend; verify the checkout path)_
  - _What:_ Create a Razorpay order / payment-link at bill time; guest or staff pay via UPI/card;
    return to a verified confirmation. Entitlement-gated (paid tier). Secrets stay server-side.
  - _Acceptance:_ a bill can be paid online and returns a server-verified success (never client-trusted).
- **I2 · Webhook reconciliation** · ✅ **done (2026-08-18)**
  - Idempotent `payment.captured` reconciliation with `(provider, event_id)` de-dup + timing-safe
    signature validation is implemented in `webhooks.service.ts`.
- **I3 · Refunds (full + partial)** · `M`
  - _What:_ Initiate refunds from order history; reflect refund state on the invoice + audit log.
  - _Acceptance:_ an owner can refund a paid bill and it's recorded and reconciled.
- **I4 · Settlement/reconciliation view** · `S`
  - _What:_ A payments view (captured vs settled vs refunded) for the dashboard/export.
  - _Acceptance:_ owner sees online-payment totals and settlement status.
  - _Security:_ verify signature (done) + idempotency (I2); never trust client-reported success;
    PCI scope stays with Razorpay (no card data touches our servers).

---

## Recommended sequence

1. **Phase 1 — stop the bleeding (P0, ~1 week):** ~~A1~~ ✅, ~~A2~~ ✅, ~~A3~~ ✅, ~~A4~~ ✅, B1 *(user)*, B2 *(user/DB)*, ~~B4~~ ✅.
   _In parallel: start Authenticode code-signing cert procurement — long lead time, and C3 (Phase 3) blocks on it._
2. **Phase 2 — flagship (weeks 2–4):** ~~C1~~ ✅ shell → ~~C2~~ ✅ native print bridge (both
   code-complete; need on-Windows launch/print verification). Biggest user value; fixes Windows printing.
3. **Phase 3 — productionize the app:** ~~C3~~ ✅ (installer + auto-update + release CI; needs cert)
   + ~~C4~~ ✅ (kiosk, auto-start, encrypted token bridge, offline screen). Code-complete; needs
   on-Windows verification + the code-signing cert.
4. **Phase 4 — quick feature wins:** E1 (B2B invoice), **G1–G4** (invites: delivery/resend/status
   + new-user join); perf: ~~F1~~ *(won't do — by-design)* + ~~F2~~ *(rescoped → `M`, deferred)* — see Track F.
5. **Phase 5 — customer portal (before payments, per priority):** H1 (real-time status tracker) →
   H2–H4 (menu/branding/actions), H5.
6. **Phase 6 — payments & reach:** **I1, I3, I4** (checkout/refunds/settlement — I2 already done),
   D1 (web print fallback), E3 (sounds), B3.

## Risks & open questions

- **Code-signing cert:** OV/EV Authenticode cert must be procured (lead time + cost) before C3.
- **Printer matrix:** which exact thermal printers/models are in the field? Drives the C2 driver choice.
- **Auto-update host:** GitHub Releases vs S3 vs a self-hosted feed — decide before C3.
- **Offline depth:** thin-client (current plan) needs the network for data; if fully-offline tills
  are required later, revisit bundling + local sync (larger effort).
