# Anthology at Book Tower — 2026 Market Segment Analysis

**Venue:** Anthology, Book Tower, Detroit MI (Method Co.)
**Scope:** All events *occurring* 1 Jan 2026 – 31 Dec 2026, status Definite or Closed
**Source:** Tripleseat REST API v1, location_id 22266
**Extracted:** 28 Aug 2026
**Unit of analysis:** the **booking**, not the Tripleseat event record (see Methodology)

---

## Headline

| | |
|---|---|
| Bookings | **755** |
| Underlying event records | 996 |
| Covers | **31,463** |
| Contracted F&B minimum (where recorded) | **$3.38M** |
| Past (Closed) / Future (Definite) | 580 / 175 |
| Bookings originating from an inbound lead | 517 of 755 (**68%**) |

Nearly **one booking in three arrives with no inbound inquiry at all** — direct
contracts, repeat clients, and sales-sourced weddings. Any analysis built only on
inquiry data misses that third of the book entirely.

---

## 1. Volume and event size by segment

| Segment | Bookings | Event records | Covers | Avg size | Median | Min | Max |
|---|---:|---:|---:|---:|---:|---:|---:|
| Corporate | 237 | 284 | 7,832 | 34.2 | 20 | 0 | 250 |
| Social | 204 | 228 | 6,281 | 40.8 | 22 | 2 | 800 |
| *No segment recorded* | 178 | 198 | 5,382 | 31.7 | 20 | 1 | 150 |
| Wedding | 111 | 258 | 11,268 | 102.4 | 118 | 2 | 179 |
| Sports | 6 | 6 | 65 | 10.8 | 12 | 8 | 12 |
| Education | 5 | 5 | 246 | 49.2 | 25 | 11 | 155 |
| Internal Method Co. | 5 | 5 | 96 | 19.2 | 18 | 2 | 40 |
| FOC | 4 | 7 | 168 | 56.0 | 20 | 8 | 140 |
| Medical | 3 | 3 | 22 | 11.0 | 11 | 11 | 11 |
| Fraternal | 1 | 1 | 75 | 75.0 | 75 | 75 | 75 |
| Association / Non-Profit | 1 | 1 | 28 | 28.0 | 28 | 28 | 28 |
| **Total** | **755** | **996** | **31,463** | | | | |

Note the Wedding row: 111 bookings carry 258 event records because a wedding booking
also holds its tasting, ceremony rehearsal and related sessions.

---

## 2. Price by segment — contracted F&B minimum

| Segment | $ / guest | $ / booking | Total contracted | Bookings with a minimum |
|---|---:|---:|---:|---:|
| **Wedding** | **$230.19** | **$22,623** | **$1,696,730** | 75 of 111 (68%) |
| Sports | $176.47 | $1,500 | $3,000 | 2 of 6 |
| FOC | $160.71 | $2,250 | $4,500 | 2 of 4 |
| **Corporate** | **$132.10** | **$4,783** | **$760,556** | 159 of 237 (67%) |
| *No segment recorded* | $112.33 | $4,152 | $502,434 | 121 of 178 (68%) |
| Education | $109.08 | $5,618 | $22,470 | 4 of 5 |
| **Social** | **$100.91** | **$3,561** | **$384,571** | 108 of 204 (53%) |
| Association / Non-Profit | $21.43 | $600 | $600 | 1 of 1 |

`$ / guest` is total contracted minimum divided by total covers across bookings that
carry both figures — not an average of per-booking rates.

### Wedding segment, split

The Wedding tag covers both weddings and their satellite events (showers, rehearsal
dinners, welcome parties). Split at 50 covers:

| | Bookings | Covers | Avg size | Median | Range | $ / guest | $ / booking |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Full weddings (50+)** | **88** | 10,787 | 122.6 | 125 | 50 – 179 | **$226.35** | **$26,686** |
| Satellites (<50) | 23 | 481 | 21.9 | 26 | 2 – 45 | $294.53 | $7,639 |

---

## 3. Seasonality

Bookings by month of event, with segment split:

| Month | Wedding | Corporate | Social | Unsegmented | Total bookings | Covers | Contracted F&B |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-01 | 2 | 35 | 13 | 15 | 65 | 1,960 | $185,147 |
| 2026-02 | 2 | 27 | 21 | 15 | 66 | 1,912 | $178,381 |
| 2026-03 | 3 | 35 | 16 | 20 | 76 | 2,288 | $161,376 |
| 2026-04 | 6 | 24 | 20 | 19 | 70 | 2,634 | $257,982 |
| 2026-05 | 17 | 27 | 37 | 32 | 117 | 4,050 | $520,555 |
| 2026-06 | 11 | 28 | 28 | 29 | 102 | 4,697 | $385,080 |
| 2026-07 | 10 | 17 | 11 | 15 | 58 | 2,526 | $256,950 |
| 2026-08 | 11 | 19 | 26 | 10 | 72 | 2,854 | $219,750 |
| 2026-09 | 17 | 10 | 11 | 12 | 50 | 2,908 | $422,750 |
| 2026-10 | 16 | 10 | 10 | 6 | 42 | 2,832 | $465,940 |
| 2026-11 | 9 | 3 | 5 | 1 | 18 | 1,525 | $124,000 |
| 2026-12 | 7 | 2 | 6 | 4 | 19 | 1,277 | $197,950 |

Weddings follow a classic Detroit curve — sparse Jan–Mar, ramping through April,
peaking in May (17) and again Sep–Oct (17/16), tailing into December.

Corporate and social volume falls sharply from September. As of the 28 Aug 2026
extract, everything from September onward is forward-looking (Definite) rather than
completed (Closed), so those months are a book still filling, not a finished result.
**Do not read Sep–Dec as a decline without accounting for that.**

---

## 4. Findings

**Weddings are the business.** 88 full weddings — 12% of bookings and 34% of covers —
carry **$1.7M of contracted F&B**, roughly half the total contracted book and more than
corporate ($761K) and social ($385K) combined. They are tightly clustered at 50–179
guests with a median of 125, which reads as a room-capacity signature rather than a
demand signature.

**Corporate is volume, mid-yield.** 237 bookings at $132/guest with a $20 median
headcount — the largest count of files, at roughly half the wedding per-guest rate.

**Social is the weakest yield.** 204 bookings at $101/guest and $3,561 per booking —
nearly as many files as corporate, for half the contracted revenue and the same
coordinator time per file.

**Wedding satellites are the highest per-guest rate in the house** at $294.53 — small,
high-intent, and attached to a wedding already won.

**178 bookings carry no market segment at all** — 24% of the book and $502K of
contracted F&B, invisible to any segment cut. At $112/guest they behave much like
corporate, but the tag is missing. This is the single largest data-quality gap.

---

## 5. Methodology

### Unit of analysis: booking, not event record

A Tripleseat **booking** holds every session belonging to one sale. A wedding booking
typically carries a `TASTING` (3–4 guests, often months earlier), a
`CEREMONY REHEARSAL`, and the wedding itself. Three distortions follow if event
records are counted directly:

1. **Count inflation.** 258 wedding event records represent 111 weddings (2.3×).
2. **Date drift.** Dating a booking by its earliest event moves a May wedding into
   January, when the tasting happened. Uncorrected, this put 26 "weddings" in a
   Detroit January.
3. **Money double-counting.** `fb_min` and `grand_total` are booking-level and repeat
   verbatim on every event row in the booking. Verified: of 133 multi-event bookings,
   **zero** had varying values across their rows.

Each booking is therefore anchored on its **primary event** — the one with the highest
guest count (ties broken by later date, then event id). Covers are that event's guest
count, not the sum across sessions.

### Why an event-side pull was required

The prior dataset (`ts_lead_report`) was derived from Tripleseat **leads**, which made
two classes of business invisible:

- **Events with no inbound inquiry** — direct contracts, repeat clients, sales-sourced
  weddings. 238 of 755 bookings (32%) have no associated lead.
- **Events whose lead predates the 2025-01-01 lead-pull floor.** Weddings carry a
  **438-day median lead time** (p90 501 days), so a wedding held in March 2026
  inquired around December 2024 and was absent entirely.

The signature of the second problem was unmistakable: the lead-derived data showed 1–5
weddings per month for Jan–Aug 2026, then 15 in September — the point at which the
438-day lead time crosses back inside the data floor.

Events are now pulled directly from `/v1/events/search.json` filtered on event date and
stored in `ts_event_report`, keyed on `event_id` and independent of leads.

**Effect of the correction: the 2026 book went from 124 bookings to 755.**

### Definitions

- **Converted / booked** = event status `DEFINITE` or `CLOSED`.
- **Covers** = guest count on the booking's primary event. Guaranteed counts are used
  where present, otherwise expected.
- **Contracted F&B minimum** (`total_food_and_beverage_min`) = what the client
  committed to, not what they spent.

### Known limitations

1. **F&B minimum coverage runs 53–68% by segment.** All revenue totals are floors, not
   complete figures. Per-guest and per-booking rates are computed only across bookings
   carrying both a minimum and a cover count, so they are sound; the *totals* understate.
2. **Actual realized revenue is not in this dataset.** It requires a per-event deep
   fetch that has not been run against `ts_event_report`. On the older, lead-derived
   subset, realization against contracted minimum ran ~1.65× corporate, ~1.41× social
   and ~1.18× weddings (the wedding figure on n=3 — not usable). Treat contracted
   minimum as the only reliable revenue basis in this file.
3. **69 bookings have no guest count**, excluded from size and per-guest statistics.
4. **Segment is assigned at the booking level in Tripleseat** and is missing on 178
   bookings.
5. **September–December 2026 is a forward book**, not a completed result.
6. Covers are venue-recorded expected/guaranteed counts, not verified door counts.

### Reproduction

```sql
-- One row per booking, anchored on its primary event
create or replace view anth_bookings_2026 as
with ranked as (
  select *, row_number() over (
      partition by booking_id
      order by coalesce(guest_count,0) desc, event_date desc, event_id) rn,
    count(*) over (partition by booking_id) ev_records
  from ts_event_report
  where location_id = 22266 and booking_id is not null
)
select booking_id, event_id, market_segment, event_status, event_name,
       event_date, guest_count as covers, fb_min, grand_total, rental_fee,
       lead_id, room_name, account_name, booking_owner, ev_records
from ranked
where rn = 1 and event_date between '2026-01-01' and '2026-12-31';

-- Segment breakdown
select coalesce(market_segment,'(no segment recorded)') segment,
  count(*) bookings, sum(ev_records) event_records, sum(covers) covers,
  round(avg(covers),1) avg_size,
  round(percentile_cont(0.5) within group (order by covers)::numeric) med_size,
  min(covers) min_size, max(covers) max_size,
  count(*) filter (where fb_min > 0) n_with_min,
  round(sum(fb_min) filter (where fb_min > 0)) fbmin_total,
  round(avg(fb_min) filter (where fb_min > 0)) fbmin_per_booking,
  round(sum(fb_min) filter (where fb_min > 0 and covers > 0)
        / nullif(sum(covers) filter (where fb_min > 0 and covers > 0), 0), 2) fbmin_per_guest
from anth_bookings_2026
group by 1 order by bookings desc;
```

---

## 6. Related work

A companion analysis covers the **corporate inquiry funnel** for 2026 event dates:
100 corporate inquiries, 76% not converted, ~$706K modeled revenue at stake, with
"No Response" the largest single loss category (29 events, 1,298 covers, ~$318K).
That analysis is lead-derived by construction — which is correct for measuring
inquiry conversion — but its denominator does not include the direct-booked business
surfaced here, so the two should not be combined without care.
