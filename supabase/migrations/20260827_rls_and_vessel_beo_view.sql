-- Lock down guest data and expose a narrow, PII-free event view for the BEO calculator.
-- Edge functions use the service role key and bypass RLS, so the sync pipeline is unaffected.

alter table public.ts_lead_report enable row level security;
alter table public.ts_comms       enable row level security;
alter table public.ts_report_json enable row level security;
alter table public.ts_users       enable row level security;
-- No policies are created: anon/authenticated get zero rows by default.

-- Event header + financials only. No contact name, email, phone, timeline or correspondence.
create or replace view public.vessel_beo_events as
select
  lead_id                                             as id,
  event_id,
  event_date,
  coalesce(nullif(trim(event_desc),''), 'Event')      as title,
  coalesce(guest_count_ev, guest_actual, guest_count) as guests,
  fb_min,
  rental_fee,
  grand_total,
  room_name,
  event_status,
  event_start_at,
  event_end_at
from public.ts_lead_report
where location_id = 30297
  and event_id is not null
  and event_status in ('PROSPECT','TENTATIVE','DEFINITE','CLOSED');

grant select on public.vessel_beo_events to anon, authenticated;

-- Per-venue event scan. ts-booked-scan defaults to loc=17784, which is why every venue
-- other than Mulherin's had frozen event statuses.
create or replace function refresh_scan_loc(p_loc text, p_statuses text default 'DEFINITE,CLOSED,TENTATIVE')
returns void language plpgsql as $$
begin
  perform net.http_get(
    url := 'https://wcqqcfpiiovqposcvrel.supabase.co/functions/v1/ts-booked-scan'
        || '?secret=9d0cda18e527962beb024146c5dbf3e7'
        || '&statuses=' || p_statuses
        || '&cap=60'
        || '&floor=' || to_char(date_trunc('year', now() at time zone 'UTC'),'YYYY-MM-DD')
        || '&loc=' || p_loc,
    headers := '{"apikey":"sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w","Authorization":"Bearer sb_publishable_5JB6emMB86VDQWU9w9-0nA_sm4OuR4w"}'::jsonb,
    timeout_milliseconds := 150000
  );
end $$;

-- Staggered 20 min clear of the Mulherin's chain so only one pg_net request is in flight.
-- select cron.schedule('vessel_scan','50 10 * * *', $c$ select refresh_scan_loc('30297'); $c$);
