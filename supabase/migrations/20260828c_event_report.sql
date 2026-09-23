-- Event-side pull, independent of leads.
--
-- ts_lead_report is derived from Tripleseat *leads*, so two classes of event were
-- invisible to it: events booked with no inbound inquiry (direct contracts, repeat
-- clients, sales-sourced weddings), and events whose lead predates the 2025-01-01
-- lead-pull floor. Weddings carry a ~438-day median lead time, so a wedding held in
-- March 2026 inquired around December 2024 and was missing entirely. The 2026 book
-- read as 124 bookings; the true figure is 755.

create table if not exists ts_event_report(
  event_id       bigint primary key,
  location_id    bigint,
  lead_id        bigint,
  event_status   text,
  event_name     text,
  event_date     date,
  event_start_at timestamptz,
  event_end_at   timestamptz,
  market_segment text,
  event_type     text,
  guest_count    integer,
  guest_guaranteed integer,
  fb_min         numeric,
  rental_fee     numeric,
  grand_total    numeric,
  rev_actual     numeric,
  room_name      text,
  booking_id     bigint,
  booking_status text,
  booking_owner  text,
  booking_created_at timestamptz,
  definite_date  date,
  lost_date      date,
  account_name   text,
  status_timeline jsonb,
  enriched_deep  boolean not null default false,
  pulled_at      timestamptz not null default now()
);
alter table ts_event_report enable row level security;
create index if not exists ts_event_report_loc_date on ts_event_report(location_id, event_date);

-- One row per booking, anchored on its primary event.
--
-- A Tripleseat booking holds every session that belongs to one sale. A wedding
-- booking typically carries a TASTING (4 guests, months earlier), a CEREMONY
-- REHEARSAL, and the wedding itself. Counting event records inflates weddings ~2.3x,
-- and dating a booking by its earliest event drags it months early -- which is what
-- put 26 "weddings" in a Detroit January. Money (fb_min, grand_total) is booking-level
-- and repeats verbatim across those rows, so summing across events double-counts it.
--
-- Anchoring on the highest-guest-count event fixes all three at once.
create or replace view anth_bookings_2026 as
with ranked as (
  select *, row_number() over (
      partition by booking_id
      order by coalesce(guest_count,0) desc, event_date desc, event_id) rn,
    count(*) over (partition by booking_id) ev_records
  from ts_event_report
  where location_id=22266 and booking_id is not null
)
select booking_id, event_id, market_segment, event_status, event_name,
       event_date, guest_count covers, fb_min, grand_total, rental_fee,
       lead_id, room_name, account_name, booking_owner, ev_records
from ranked where rn=1
  and event_date between '2026-01-01' and '2026-12-31';
