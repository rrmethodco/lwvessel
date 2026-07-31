-- External source id (e.g. Tripleseat event id) for idempotent imports into
-- beo_events. The app only ever reads/writes the `payload` column, so these
-- columns survive user edits and let a re-import update rows in place.
alter table public.beo_events add column if not exists ext_id text;
alter table public.beo_events add column if not exists source text;

-- Plain unique index (NOT partial) so Postgres ON CONFLICT (venue, ext_id) can
-- infer it. NULL ext_id values are treated as distinct, so the pre-existing
-- rows (all ext_id NULL) never collide with each other.
create unique index if not exists beo_events_venue_ext_id_uidx
  on public.beo_events (venue, ext_id);
