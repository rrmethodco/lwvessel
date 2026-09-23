# Supabase Edge Functions

Deployed to project `wcqqcfpiiovqposcvrel`. These are deployed directly (via the
Supabase MCP / dashboard), not through a CI pipeline, so this directory is the
version-controlled source of record — keep it in sync with what is deployed.

## `tripleseat-sync`

### `mode: "import"` — populate a venue's events

Called from the app's **Import events from Tripleseat** button. The app renders
the Events tab from the local `beo_events` table (venue-scoped) — it does **not**
read Tripleseat live — so this mode is what actually fills a venue's events.

1. Resolves the venue → Tripleseat **location** by name
   (`venues.config.tripleseatLocation`, else the venue's branding name) against
   `/v1/locations.json`.
2. Fetches that location's events (server-side location filter is best-effort and
   the results are **also** filtered client-side by the event's own location, so a
   wrong/ignored filter param can never pull another location's events), then
   drills each event's detail for financials/guest count.
3. Maps each event to the `beo_events` payload shape (envelope fields: name, date,
   times, guests, status, type, account, salesperson, lead source, TS total,
   deposit — line-item/COGS arrays are left empty since they need the venue menu).
4. Upserts idempotently on `(venue, ext_id)` where `ext_id` is the Tripleseat
   event id (see `supabase/migrations/20260731_beo_events_ext_id.sql`).

Runs as a **preview** by default (`commit:false`) — reporting the matched
location, event count, and a sample mapping without writing — and only writes
when called again with `commit:true`. A few raw + mapped samples are persisted to
the `ts_probe` table each run for inspection.

### `mode: "probe"` — connection diagnostics

Called from the app's **Tripleseat diagnostics** button. It:

1. Verifies the caller is a signed-in internal editor (`app_users.role` of
   `admin` or `user`); external read-only members and anonymous callers are
   rejected.
2. Obtains a Tripleseat OAuth token (client-credentials).
3. **Probes the Tripleseat data surface** and returns a `coverage` roll-up plus
   a `totalDataPoints` count. For each core resource (events, bookings,
   accounts, contacts, locations, leads, menus, rooms, users) it unions the
   field catalog across a page of list records **and** drills the first record's
   detail endpoint (the richest single payload). It also retries reference
   surfaces (`event_documents`, `event_types`, `lead_sources`, `tax_rates`,
   `custom_fields`, `menu_items`, `account_types`) against several candidate
   path names, since Tripleseat returns `500` on unknown routes. All fetches run
   in parallel to stay well under the function wall-clock limit.

The field catalog records every leaf's dot-path with a type/example so we can
see exactly which Tripleseat data points are available to pull into the app.

### Required Edge secrets

- `TRIPLESEAT_CLIENT_ID`, `TRIPLESEAT_CLIENT_SECRET`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)

## `ts-explore` (not committed)

A throwaway debug variant of the probe, gated by a hardcoded query-string
secret rather than a user JWT. It is intentionally **not** checked in because it
embeds a bearer secret; it exists only as a deployed function for ad-hoc
exploration and can be recreated from `tripleseat-sync` when needed.
