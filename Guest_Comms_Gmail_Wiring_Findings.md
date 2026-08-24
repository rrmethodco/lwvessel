# Guest-Conversation Capture — Gmail Wiring: Findings & Revised Model

_Date: 2026-08-24. Scope: Wm. Mulherin's Sons (Tripleseat location 17784), mailbox available to this session: rr@methodco.com._

## What we set out to do
Attach the verbatim guest↔team email dialogue to each Tripleseat inquiry by searching the
`hello@wmmulherinssons.com` mailbox for each lead's guest email address, and store the
messages in Supabase `ts_comms`.

## What the mailbox actually contains (key findings)

1. **The Gmail connector is authenticated as `rr@methodco.com`, not `hello@`.**
   Ross receives part of the `hello@wmmulherinssons.com` stream (it behaves like a
   group/alias he is a member of), plus Tripleseat notifications addressed to him directly.

2. **Tripleseat hides guest addresses behind relay senders.** Guest and staff comments
   arrive from `methodhospitality.<author.name>@discussions.tripleseat.com`
   (older format: `methodhospitality--<author-name>-@…`). The guest's real address usually
   never appears in headers, so `from:<guest> OR to:<guest>` misses discussion traffic
   entirely. Matching must use the **author display name** (= lead `contact`), the
   subject's venue/event-date text, the `[TS/<token>]` discussion token, and — when present —
   the embedded `…tripleseat.com/events/<event_id>` link (exact linkage).

3. **Coverage in this mailbox is small.** Since 2026-01-01 there are only ~43 Tripleseat
   discussion threads across *all* Method venues in Ross's mailbox, of which only a handful
   are Mulherin's. A full sweep of all 442 distinct Mulherin's guest addresses found
   ~35 with any 2026 event-related thread (~8% of leads). The day-to-day lead dialogue
   is delivered to the lead owners' mailboxes — **Tom Foy (`tfoy@wmmulherinssons.com`),
   Abby Perlman (`aperlman@wmmulherinssons.com`)** and staff such as Graham Gernsheimer
   (`ggerns@methodco.com`) — and to guests, not to Ross.

4. **Initial lead-form submissions never appear as email dialogue** here; only follow-up
   comments and direct guest emails do. Earlier thread history sometimes exists only as
   quoted text inside later messages (captured in `raw` notes, not as separate rows).

## Revised matching model (what the pilot implements)

Mailbox → lead (not lead → mailbox):
1. Sweep candidate threads: `from:discussions.tripleseat.com` + guest-address hits
   (`{from:<a> to:<a>}` batched ORs across the roster).
2. Match a thread to a `ts_lead_report` row by, in order of strength:
   embedded `events/<event_id>` link → guest address in headers → relay author name =
   lead `contact` **and** venue/event-date corroboration in subject/body (the same relay
   serves all Method venues, and non-Mulherin's leads appear — venue check is mandatory).
3. Normalize each human message: strip Tripleseat/SendGrid boilerplate and quoted history;
   `direction` = inbound when the author is the guest party, outbound when staff;
   `message_id` = Gmail message id; dedupe on `(provider, message_id)`
   (unique index `ts_comms_message_id_key`, added 2026-08-24); relay echoes of a directly
   captured message are skipped and noted as `raw.relay_echo_id`.

## Pilot results (in `ts_comms`)

- Discussion-matched leads ingested directly (9 messages, 3 leads):
  - Lead 53938088 / event 60955417 (Evan Harkins, Wedding Rehearsal Dinner 2027-11-05, Converted):
    7 messages, full arc from follow-up → package selection → contract → signed + deposit paid.
  - Lead 54770469 (Ashlyn Bausman, Holiday dinner 2026-12-06): 1 inbound follow-up.
  - Lead 55310213 (Laura Bonadonna, Rehearsal Dinner 2027-10-22): 1 inbound follow-up.
- Direct-mail leads from the address sweep were then ingested under the same
  normalization contract (36 further leads).
- **Final backfill total: 52 messages across 39 leads** (46 inbound / 6 outbound) —
  everything event-related this mailbox holds for the roster. Integrity checks: 0
  guest-email↔lead mismatches, 0 boilerplate leaks in `body_text`, 0 duplicate
  `message_id`s. The remaining 39 Tripleseat discussion threads in the mailbox were
  name-matched against the Mulherin's roster and all belong to other Method venues.
- The inbound/outbound skew is the coverage gap made visible: venue replies reach this
  mailbox only when staff cc `hello@` (e.g. Tom Foy's replies on the Felipe Mercado
  thread) or when the discussion notifies `hello@` (Evan Harkins thread).

## What this means for the two ingestion paths

- **A. Backfill:** viable from this mailbox only for the ~10% slice. For real historical
  coverage, a session needs the Gmail connector authorized as `hello@wmmulherinssons.com`
  or the event managers' mailboxes (Tom Foy, Abby Perlman), or Google Workspace domain-wide
  delegation with the Gmail API. Alternatively, Tripleseat's discussion export (if enabled
  for the account) would bypass email entirely.
- **B. Ongoing capture:** unchanged and now more important — route/forward
  `hello@` and the events mailboxes (inbound + outbound) to the `comms-inbound` endpoint;
  it already matches on guest address, and for Tripleseat relay traffic the ingest function
  should be extended with the name/token/event-link matching above.

## Handles
- Supabase project: `wcqqcfpiiovqposcvrel`; table `ts_comms`; leads in `ts_lead_report`
  (`location_id = 17784`).
- Ingestion endpoint: `POST https://wcqqcfpiiovqposcvrel.supabase.co/functions/v1/comms-inbound?token=mc_comms_9d0cda18e5`.
