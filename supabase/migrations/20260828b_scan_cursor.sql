-- Page-dimension resumability for ts-booked-scan.
--
-- Before this, every scan_catchup tick restarted each status at page 1. With a
-- 150s pg_net ceiling, Anthology (11 DEFINITE + 64 CLOSED pages) only ever reached
-- CLOSED page ~25 before the budget expired, so pages 26-64 were never read and the
-- same ~340 leads were re-updated on every tick. The cursor makes each tick resume
-- where the last one stopped.

create table if not exists ts_scan_cursor(
  loc        text    not null,
  status     text    not null,
  next_page  int     not null default 1,
  done       boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (loc, status)
);
alter table ts_scan_cursor enable row level security;

-- cap raised past Anthology's 64 CLOSED pages; budget kept under the pg_net ceiling.
create or replace function refresh_scan_loc(p_loc text, p_statuses text default 'DEFINITE,CLOSED,TENTATIVE', p_floor date default null)
returns void language plpgsql security definer as $$
declare f date := coalesce(p_floor, date_trunc('year', now() at time zone 'UTC')::date);
begin
  perform net.http_get(
    url := 'https://wcqqcfpiiovqposcvrel.supabase.co/functions/v1/ts-booked-scan'
        || '?secret=' || current_setting('app.ts_scan_secret', true)
        || '&statuses=' || p_statuses
        || '&cap=200&budgetMs=85000&floor=' || to_char(f,'YYYY-MM-DD')
        || '&loc=' || p_loc,
    timeout_milliseconds := 150000
  );
end $$;

drop function if exists scan_catchup();

-- Pick the location that still has unfinished scan pages, ranked by how many of its
-- linked leads are still missing a status. A location whose cursors are all done is
-- skipped so the catch-up does not burn ticks re-confirming finished work.
create function scan_catchup()
returns text language plpgsql security definer as $$
declare v text;
begin
  select t.loc into v
  from (values ('22266'),('26166'),('31924')) t(loc)
  where exists (
    select 1 from (values ('DEFINITE'),('CLOSED')) s(st)
    where not exists (
      select 1 from ts_scan_cursor c
      where c.loc = t.loc and c.status = s.st and c.done
    )
  )
  order by (select count(*) from ts_lead_report r
            where r.location_id = t.loc::bigint and r.event_id is not null and r.event_status is null) desc
  limit 1;
  if v is null then return 'all locations complete'; end if;
  perform refresh_scan_loc(v,'DEFINITE,CLOSED','2025-01-01');
  return 'scanning ' || v;
end $$;
