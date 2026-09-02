-- Tripleseat invoice documents and their parsed line items.
-- The API has no line-item endpoint; the portal Invoice document (event.documents[0].views)
-- is the only place items exist. ts-invoice-fetch stores the HTML, ts-invoice-parse turns it
-- into rows and attributes each to an outlet (Anthology / Kamper's / Bar Rotunda).
create table if not exists ts_invoice_html (
  event_id   bigint primary key,
  doc_url    text,
  html       text,
  fetched_at timestamptz
);
create table if not exists ts_invoice_lines (
  event_id      bigint  not null,
  line_no       integer not null,
  section       text,           -- FOOD / BEVERAGE / AV & OTHER ITEMS / BILLING
  outlet_header text,           -- room header row the line sat under, if any
  qty           numeric,
  description   text,
  price         numeric,
  total         numeric,
  outlet        text,           -- Anthology | Kamper's | Bar Rotunda
  primary key (event_id, line_no)
);
alter table ts_invoice_html  enable row level security;
alter table ts_invoice_lines enable row level security;
-- Booking-level totals and the SCHEDULE OF EVENTS rows (Areas = every room the event uses).
create table if not exists ts_invoice_meta (
  event_id       bigint primary key,
  subtotal       numeric,
  sales_tax      numeric,
  service_charge numeric,
  admin_fee      numeric,
  gratuity       numeric,
  room_rental    numeric,
  grand_total    numeric,
  schedule       jsonb,
  parsed_at      timestamptz
);
alter table ts_invoice_meta enable row level security;
