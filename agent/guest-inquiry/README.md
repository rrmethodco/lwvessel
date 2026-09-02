# Guest Inquiry Agent — training package

Everything needed to configure, ground, and test the AI agent that answers guest event
inquiries. Built from 53 real guest emails and 14 team replies captured against
Tripleseat inquiries at Wm. Mulherin's Sons and Lowland Charleston.

| File | What it is | How it's used |
|---|---|---|
| `SYSTEM_PROMPT.md` | The operative system prompt | Paste into the agent. Resolve every `{{TOKEN}}` first. |
| `rules.yaml` | Routing, guardrails, escalation triggers, logging schema | Enforced by the orchestration layer, not left to the model. |
| `examples.jsonl` | 12 labeled inquiry → reply pairs from real threads | Few-shot prompting or SFT. Each carries lane, `must_include`, `must_not_include`. |
| `evals.jsonl` | 18 test cases, 7 critical | Run before every deploy. A critical failure blocks release. |

The human-readable rationale — why each rule exists, what the data showed — lives in the
**Guest Inquiry Playbook** artifact. That document is for the events team and for
governance review. These four files are what the agent actually consumes.

## Before first deploy

1. **Resolve the tokens.** `rules.yaml → venue_tokens` lists them. Every value comes from
   the venue's current events guide. The agent must never emit a `{{TOKEN}}`; add a
   pre-send check that blocks any message containing `{{`.
2. **Load the knowledge base.** Rooms, capacities, minimums by day and season, packages,
   menus, deposit terms, corkage, vendor policy, guarantee deadline, AV, parking. The
   grounding rule means anything absent here escalates — so gaps in the guide become
   escalation volume.
3. **Rename ambiguous inventory.** Lowland's live agent confused guests because internal
   room names weren't guest-legible; the fix was renaming them. Every room, package and
   menu the agent can mention needs a name a first-time guest can tell apart.
4. **Wire the escalation destination.** A named owner per venue, with a same-day
   acknowledgement expectation. Escalation without a fast human behind it is worse than
   no agent.
5. **Wire availability.** If the agent cannot verify a date, `ev04` must pass — it stays
   silent on availability rather than guessing.
6. **Run `evals.jsonl`.** All 7 critical cases must pass. Do not deploy otherwise.

## Lane summary

- **SEND** — routine group dining and private-room inquiries fully covered by the guide.
- **DRAFT** — buyouts, weddings, parties at or above the draft threshold, any unpublished
  number, VIP or repeat guests. Composed by the agent, approved by a manager.
- **ESCALATE** — grief, complaints, price pushback, accessibility or medical, press,
  legal, any request for a human, stalled threads, and anything the guide doesn't answer.

When two lanes could apply, take the more cautious one.

## The seven failure modes that matter most

Ranked by damage. Each has a corresponding critical eval.

1. Selling into a bereavement thread (`ev01`)
2. Negotiating or hinting at price flexibility (`ev02`)
3. Refusing or slowing a request for a human (`ev03`)
4. Asserting availability it hasn't verified (`ev04`)
5. Inventing or estimating a price (`ev05`)
6. Offering a phone call it cannot make (`ev11`)
7. Answering an accessibility or medical question from inference (`ev09`)

## Measurement

The agent should improve four numbers that are currently measurable from the pipeline:

- **Inquiries with no disposition** — 38 of 457 YTD at Mulherin's. Target zero.
- **Guest chase-ups** — 13% of all inbound guest email is someone writing a second time
  because nobody answered the first. Target under 3%.
- **Median first response** — currently 1 day. Target same-day on every SEND lane.
- **Losses tagged "Other"** — currently 170 of 170 at Mulherin's. Target zero; the
  taxonomy is in `rules.yaml → logging.on_loss.allowed_values`.

Track escalation rate too. Rising escalations usually mean a knowledge-base gap, not a
model problem — read the reasons before touching the prompt.

## Provenance and limits

This package draws on four sources. Which rule came from which matters: a rule grounded
in our own data can be measured, a rule taken from practice has to be watched.

| Source | What it gave us | Confidence |
|---|---|---|
| **Captured email** — 53 guest messages, 14 team replies (Mulherin's + Lowland) | The question-frequency ranking, every guest message in `examples.jsonl`, every line in "Lines that work," the 13% chase-up rate, the 26% asking for a person | Measured |
| **Tripleseat pipeline** — 457 Mulherin's inquiries YTD | 38 inquiries with no disposition, 170 losses all tagged "Other," median first response of one day | Measured |
| **Lowland's live agent** — running since 21 July 2026 | Two clean successes, one manager recovery, and the remediation that followed: renaming rooms so guests could tell them apart | Observed |
| **Method Co. operating standards** | The 24-hour inquiry response SLA, standardised package pricing, dedicated event sales ownership, cross-sell to sister properties. Events should be 15–30% of a property's revenue mix; under 10% means the sales effort is underused | House standard |
| **Event-sales and agent-design practice** | Qualifying questions, the day 2/5/12/20 follow-up cadence, price disclosure by segment, peak/shoulder/soft date tiering, the post-booking answer bank, and the lane/guardrail/eval structure | Judgment |

**One convergence worth noting.** Our own web form promises a reply within 24 hours, the
Method Co. standard sets the same SLA, and a real guest chased us quoting it back —
*"I was told I would hear back within 24 hours. I have not heard back."* Three
independent sources agreeing on one number is the strongest signal here, and it is the
one the agent exists to hold.

**Where the evidence runs out.** The corpus is almost entirely first contact.
Operational questions — corkage, AV, cancellation terms, accessibility — barely appear
because guests ask them later, inside Tripleseat threads and on the phone, which we
don't capture. The same gap applies to the follow-up ladder: we hold almost no follow-up
correspondence, so that cadence is practice rather than measurement. Treat routing, tone
and first-reply structure as evidence-backed; treat the follow-up cadence and the
post-booking answers as best practice to verify against each venue's guide — and revisit
both once the agent starts generating its own record.
