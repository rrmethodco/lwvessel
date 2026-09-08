# Wm. Mulherin's Sons — Inquiry Agent: User Setup, Email Setup, Response Cadence

**Status:** draft for review · **Scope:** one agent per location; this brief covers Mulherin's and is the template for the other venues.

---

## 1. User setup

**One agent identity per location, separate from every manager.**

| | Mulherin's |
|---|---|
| Mailbox | `events@wmmulherinssons.com` (Google Workspace user, not an alias) |
| Tripleseat user | "Mulherin's Events" — its own seat, role scoped as below |
| Access | Mulherin's location only |
| API token | Issued to the agent user, so every write it makes is attributed to the agent |

**Tripleseat role for the agent user**

- Can: view leads and events at its location, send and log email on a lead, add notes and tasks, edit lead fields (guest count, date, time, occasion, budget range), add itself as a manager on a lead.
- Cannot: change status to Definite, Closed or Lost; edit pricing or minimums; send proposals, contracts or invoices; view or edit other locations.
- Prospect → Tentative: off at launch; switch on once the first month's numbers look right.

**Managers keep their own Tripleseat users and their own email addresses.** Lead ownership always sits with a person. The agent is added as a second manager on the lead, never the owner, so the inquiry stays on someone's list and the daily report chases a person.

**Why a separate user matters:** Tripleseat stamps every status change, note and email with the user who made it. That stamp is what the lifecycle reports run on. With its own user, the agent's work is a measurable line (first response, leads touched, handoffs) and managers' response and conversion numbers stay their own. It is also one switch to disable if needed.

## 2. Email setup

**Sending**

- The agent sends from `events@wmmulherinssons.com`. The guest sees "Wm. Mulherin's Sons" as the sender name and the assigned manager's name in the signature.
- Reply-to stays on `events@` so the guest's answer returns to the agent until a manager steps in.
- Every message the agent sends is BCC'd to the agent user's Tripleseat logging address, so it appears on the lead in Tripleseat.

**Receiving**

- Web-form inquiries and Tripleseat lead notifications route to `events@`. The Tripleseat lead, not the inbox, is the trigger: the agent acts only on mail that has a lead behind it.
- `hello@wmmulherinssons.com` keeps working for everything else; an inquiry that lands there forwards to `events@`.
- Guest replies to `events@` are forwarded to the Tripleseat logging address so the full thread shows on the lead.

**Capture**

- All inbound and outbound mail on `events@` is copied to the comms capture (the `ts_comms` table, per GMAIL_COMMS_PLAN.md). That is what the agent reads to know a person has taken over, and what the response reports use. Tripleseat holds the same thread for managers to read, but its API does not return message content, so the capture is the working copy.

**Manager takeover**

- A manager replies on the same thread from their own address. The moment an outbound message on a thread comes from any address other than `events@`, the agent goes silent on that lead and stays silent unless the manager reassigns it.
- Managers work entirely in Tripleseat; they see the agent's messages, the guest's replies and the agent's handoff note on the lead.

**To confirm in Tripleseat settings before go-live:** the agent user has a logging address enabled, and reply tracking is on for that user so guest replies to Tripleseat-sent mail attach to the lead.

## 3. Response cadence

Current baseline at Mulherin's: 141 inquiries in the last 90 days, 133 with no owner at lead stage, and 37 of the last 47 with no recorded response. Median lead time from inquiry to event date is 65 days.

| Step | When | What |
|---|---|---|
| First reply | Within **15 minutes** of the lead, 8am–10pm. Leads arriving overnight are answered at 8am. | Restate occasion, date, headcount; say whether the date is open, on hold or booked and which space fits; state the minimum if it is in the venue fact sheet; ask the one or two details the manager needs (time of day, seated vs. cocktail-style); say who will follow up. |
| Follow-up replies | Within **30 minutes** during hours | Informational questions only: capacity, space, menu format, timing, parking, AV, policies. Lead fields updated with anything learned. |
| Handoff | Immediately on any trigger | Proposal or custom pricing, site visit or call, contract or deposit, headcount of 60 or more, weddings, complaints, press, a second agent reply without the lead being qualified, "am I talking to a person", or a date already Definite. Agent posts a summary note on the lead, assigns the owner, tells the guest who will be in touch, and stops. |
| Human response after handoff | Same business day; target 90% | Manager replies from their own address on the same thread. |
| Nudge 1 | **3 days** with no guest reply | One short message offering the held date and an alternative. |
| Nudge 2 | **7 days** with no guest reply | One final message; lead marked "no response" in Tripleseat and the agent stops. |
| Quiet hours | 10pm–8am, and none on the venue's closed days beyond the first reply | Nothing goes out; queued for 8am. |

**Measures reported daily:** agent first-response time (target: inside the window on every lead), human takeover time after handoff, guest reply rate to the first message, lead-to-event conversion against the 45% baseline, and any quoted number not on the fact sheet, which counts as a defect.

## 4. Go-live steps

1. Create `events@wmmulherinssons.com` and the Tripleseat user; set the role; issue the API token to that user.
2. Route web-form and lead notifications to `events@`; add the `hello@` forward.
3. Turn on the logging address and reply tracking for the agent user; wire BCC and forward rules.
4. Turn on comms capture for `events@`.
5. Two-week shadow period (agent drafts, manager sends), then live for first replies, then follow-ups and nudges.
