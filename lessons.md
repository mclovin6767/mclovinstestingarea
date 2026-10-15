# Lessons

- When backend code adds Supabase columns, apply the additive SQL migration to the live database before declaring runtime readiness. A passing TypeScript build does not prove PostgREST schema availability.
- After DDL changes used by Supabase REST queries, send `notify pgrst, 'reload schema';` so newly added columns are visible without waiting for schema cache refresh.
- If Next.js reports a missing generated chunk such as `Cannot find module './203.js'`, stop the frontend dev server, delete `apps/frontend/.next`, restart dev, and pre-hit the affected routes to rebuild a clean chunk manifest.
- For QR Dines billing, do not remove the invoice-level split GST by default: totals should show CGST 2.5% and SGST 2.5%, while selected item rows should not show legacy per-item `GST 5%` labels.
avoid running npm --workspace apps/frontend run build while the dev server is running. It can overwrite .next and break the active dev server. For verification builds, stop frontend dev first, run build, then restart dev.
- For offline billing sync UX, do not immediately auto-retry failed queued drafts on every API/offline state transition. Add retry backoff or an explicit retry path so the banner does not oscillate between syncing and failed states.
- Background sync effects must catch expected API failures internally. Do not call an async retry loop with `void` if thrown API errors can escape into the Next.js runtime overlay.
- Offline banners should represent connectivity, not every pending local task. Treat fetch/network failures and 5xx/timeout responses as degraded connection signals, but do not mark the app offline for expected 4xx validation/auth/business-rule API errors.
- Dashboard billing metrics must use finalized invoices as the source of truth. Do not aggregate item movement from all created orders, because open/failed/void-adjacent order state can make quantities stale or inconsistent with sales.
- When removing an invoice feature such as QR codes, remove it from the render path and from visible settings/defaults. Leaving a no-op toggle visible creates operator confusion.
