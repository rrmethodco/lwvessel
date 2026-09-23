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

-- Backfill catch-up is Anthology-only (loc 22266). Lowland and Nickel keep their
-- own nightly scans; they should not queue behind or slow down this backfill.
create function scan_catchup()
returns text language plpgsql security definer as $$
begin
  if exists (
    select 1 from (values ('DEFINITE'),('CLOSED')) s(st)
    where not exists (
      select 1 from ts_scan_cursor c
      where c.loc = '22266' and c.status = s.st and c.done
    )
  ) then
    perform refresh_scan_loc('22266','DEFINITE,CLOSED','2025-01-01');
    return 'scanning anthology';
  end if;
  return 'anthology complete';
end $$;
