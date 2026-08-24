# Guest-conversation capture — Gmail wiring plan

Goal: attach the **verbatim guest↔team email dialogue** to each Tripleseat inquiry,
since Tripleseat's API exposes process/metadata but not message content.

## Why a new session
The Gmail connector is authorized on claude.ai but only loads into a session at
**session start**. If the Gmail tools aren't in your tool list, start a fresh
Claude Code (web) session, then confirm with "do you have Gmail access?".

## Mailboxes (guest comms live here)
- **Wm. Mulherin's Sons** → `hello@wmmulherinssons.com`  ← start here (fully enriched, clean lifecycle to validate against)
- Other venues: TBD — get each venue's Workspace address before extending.

## Matching model
Guest identity = the **guest's** email address, stored on each lead.
- Source of truth for leads: Supabase table `ts_lead_report`
  - Mulherin's = `location_id = 17784` (456 leads, all have `email`, 442 distinct addresses)
  - Key fields: `lead_id`, `email` (guest), `contact`, `created_at`, `event_date`, `event_id`
- For each lead, find mailbox threads where that guest address is the counterparty
  (search `hello@wmmulherinssons.com` mailbox for `from:<guest>` OR `to:<guest>`),
  ideally within a window around `created_at` (e.g. −7d … event_date+30d).

## Where captured messages go — `ts_comms`
Columns: `lead_id, event_id, direction ('inbound'|'outbound'), guest_email,
from_name, from_email, to_email, subject, body_text, body_html, message_id,
in_reply_to, provider, received_at, matched (bool), raw (jsonb)`.
- `direction` = inbound when the guest is the sender; outbound when the venue is.
- `guest_email` = the lead's email; set `lead_id`/`event_id` from the matched lead; `matched=true`.
- Dedupe on `message_id`.

## Two ingestion paths
**A. Backfill (historical) — Gmail connector, in a fresh session**
1. Confirm Gmail tools present.
2. Pull the 442 distinct Mulherin's guest emails:
   `select distinct lower(email) email from ts_lead_report where location_id=17784 and email like '%@%';`
   (Supabase project `wcqqcfpiiovqposcvrel`.)
3. For each, search the `hello@wmmulherinssons.com` mailbox, read matching threads,
   normalize each message, upsert into `ts_comms` (via `mcp__Supabase__execute_sql` insert,
   or POST to the ingestion endpoint below). Start with a 20-lead pilot, verify matching
   quality against `ts_lead_report` lifecycle, then scale.

**B. Ongoing (live) — forward/BCC to the ingestion endpoint**
- Endpoint: `POST https://wcqqcfpiiovqposcvrel.supabase.co/functions/v1/comms-inbound?token=mc_comms_9d0cda18e5`
- Add a Gmail/Workspace routing rule on `hello@wmmulherinssons.com` to forward (or BCC)
  inbound+outbound guest mail to an inbound-parse address (SendGrid/Mailgun/Postmark)
  that hits the endpoint. It matches the guest email to a lead and writes `ts_comms`.

## After capture
- Surface per-inquiry threads in the dashboard drawer (a "Conversation" tab next to the
  milestone timeline), and add response-quality analytics (first-reply latency from the
  actual send, message counts, sentiment) now that we have the words.

## Credentials / handles
- Supabase project id: `wcqqcfpiiovqposcvrel`
- comms-inbound token: `mc_comms_9d0cda18e5`
- Dashboard build: `reports/mulherins/build-portfolio.js` → `methodco-portfolio-dashboard.html`

## Privacy
Read-only Gmail scope. Only pull threads for addresses that appear as guests in
`ts_lead_report`. Store business event correspondence only; don't ingest unrelated mail.
