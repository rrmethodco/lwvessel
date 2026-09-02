-- 2025 backfill + per-venue status refresh.

-- 1. Daily pull previously deleted everything before the current year, which would have
--    wiped a 2025 backfill on the next run. Floor moved to 2025-01-01.
create or replace function mulh_refresh_pull() returns void language plpgsql as $$
begin
  delete from ts_lead_report where created_at < date '2025-01-01';
  perform net.http_get(
    url := 'https://wcqqcfpiiovqposcvrel.supabase.co/functions/v1/ts-leads-pull'
        || '?secret=9d0cda18e527962beb024146c5dbf3e7&cap=300&loc=all'
        || '&since=' || to_char(date_trunc('year', now() at time zone 'UTC'),'YYYY-MM-DD'),
    headers := '{"apikey":"sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w","Authorization":"Bearer sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w"}'::jsonb,
    timeout_milliseconds := 150000
  );
end $$;

-- 2. Per-venue scan with an optional floor.
create or replace function refresh_scan_loc(
  p_loc text,
  p_statuses text default 'DEFINITE,CLOSED,TENTATIVE',
  p_floor date default null
) returns void language plpgsql as $$
declare f date := coalesce(p_floor, date_trunc('year', now() at time zone 'UTC')::date);
begin
  perform net.http_get(
    url := 'https://wcqqcfpiiovqposcvrel.supabase.co/functions/v1/ts-booked-scan'
        || '?secret=9d0cda18e527962beb024146c5dbf3e7'
        || '&statuses=' || p_statuses
        || '&cap=60&floor=' || to_char(f,'YYYY-MM-DD')
        || '&loc=' || p_loc,
    headers := '{"apikey":"sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w","Authorization":"Bearer sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w"}'::jsonb,
    timeout_milliseconds := 150000
  );
end $$;

-- 3. Rotating catch-up for venues whose statuses were frozen. Drop once converged:
--    select cron.unschedule('scan_catchup');
create or replace function scan_catchup() returns void language plpgsql as $$
declare v text;
begin
  select loc into v from (values ('22266'),('26166'),('31924')) t(loc)
  order by (select count(*) from ts_lead_report r
            where r.location_id = t.loc::bigint and r.event_id is not null and r.event_status is null) desc
  limit 1;
  if v is not null then perform refresh_scan_loc(v,'DEFINITE,CLOSED','2025-01-01'); end if;
end $$;

-- Schedules (staggered; only one pg_net request in flight at a time):
--   vessel_scan     50 10 * * *
--   anthology_scan  56 10 * * *
--   lowland_scan     4 11 * * *
--   nickel_scan     12 11 * * *
--   scan_catchup   */8  * * * *   (temporary)

-- Edge function changes deployed alongside this migration:
--   ts-leads-pull  v4 — incremental upsert per page batch (a timeout no longer loses the
--                       whole run), plus since/until/startPage/endPage and resumeFrom.
--   ts-booked-scan v5 — pages the lead-id set. PostgREST caps a select at 1000 rows, which
--                       silently truncated the match set for any venue with more leads than
--                       that (Anthology 8,675; also Mulherin's once 2025 was backfilled).
--                       Adds a time budget and timedOut flag.
