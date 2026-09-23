# Vessel BEO Calculator — shared workspace app

**Live app:** https://lwvessel.vercel.app (Vercel project `lwvessel`, team
"rr-5383's projects"; the old Supabase function URL 302-redirects here)

Single-page app (`index.html`) backed by Supabase project **vessel-beo**
(`wcqqcfpiiovqposcvrel`, us-east-1, org "rr-5383's projects", $10/mo via Vercel
marketplace billing). Login is email + password via Supabase Auth; there is no
self-signup and a database trigger restricts accounts to `@methodco.com`.
All data access is enforced by row-level security (any signed-in methodco.com
user shares one workspace).

## What's in the database

| Table | Purpose |
|---|---|
| `beo_events` | One row per event; the full event (terms, menu lines, staffing) lives in a `payload` jsonb column. Optimistic concurrency via `updated_at`; `updated_by_email` audit column. Realtime is enabled so open sessions refresh when a teammate saves. |
| `beo_event_changes` | Append-only change log — who changed what, per save (the diff strings shown in the UI). |
| `menu_items` | Little Havana vendor catalog (104 items): `vendor_cost` = printed vendor price (what Vessel pays), `client_price` = current guest price where confirmed by executed contracts / events deck. Editable in-app. |
| `app_settings` | `target_cogs_pct` (recommended-pricing target, default 40%), `cashbar_benchmarks` (per-guest beverage spend by event type, from Tripleseat actuals Jul '25–Jun '26, 43 events; overall weighted $29.79/guest). |

Seeded events: the three executed contracts (Baby Shower, UMD Retreat,
Gallin-Munson Post-Wedding Breakfast) exactly as in the ROOST Baltimore model.

## Admin runbook (accounts are admin-managed)

- **Add a user:** Supabase dashboard → project *vessel-beo* → Authentication →
  Users → Add user (email + password, check "auto-confirm"). Must be an
  `@methodco.com` address (a DB trigger rejects others).
- **Reset a password:** same screen → user → Reset password / set new password.
- **Users change their own password** in-app via "Change password" in the top bar.

## Hosting / redeploy

The page is static and hosted on Vercel (project `lwvessel`). Supabase's
gateway forces `text/plain` + a sandbox CSP on Edge Function responses, so
HTML cannot be served from the `supabase.co` domain — the `beo` Edge Function
now just 302-redirects to the Vercel URL. To ship a new version of the app:
edit `index.html` here and push a production deployment to the `lwvessel`
Vercel project (file-based deploy; no git wiring required). The `app_assets`
table still holds a copy of the page from the interim hosting approach and
can be dropped or kept as a backup.
