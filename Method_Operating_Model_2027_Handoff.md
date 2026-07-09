# Method Terrapin Operating Model 2027 — Handoff

**File:** `Method_Operating_Model_2027_5.xlsx` (16 tabs, 0 formula errors, recalculated via LibreOffice)
**Entities:** Vessel (events) + Little Wing Coffee & Goods (ROOST Baltimore, Baltimore Peninsula) — Method Terrapin Manager LLC
**Last updated:** July 9, 2026 (v4: LW Menu Pricing rebuilt at item level · v5: BOH cook labor kept at $296/wk)
**Purpose:** full context handoff so another project/session can pick up without re-deriving anything. Backup of the pre-restructure version is saved as `Method_Operating_Model_2027_BACKUP_pre-update.xlsx`.

---

## 1. What this model is

A two-outlet FY2027 operating model with monthly (Jan–Dec) 12-month P&Ls for Vessel and Little Wing, a combined roll-up, and a four-scenario summary. All figures are formula-driven from editable input cells (blue font = editable input). USAR-style P&L; net revenue excludes tax/tips; prime cost = COGS + labor; COGS % measured against own-category sales.

**Revenue bases:** Little Wing = Toast H1-2026 actuals ×2. Vessel = event-driven assumptions (F&B minimum × event volume). 2026 external figures (T12, Forecast) are hardcoded from source docs (see §6).

---

## 2. Owner economics — the core convention (changed this session)

The old Method/Owner **profit split** was removed entirely. Replaced with explicit charges, all sitting **above NOI** so **NOI is the bottom line**:

- **Management fee = 4% of gross revenue**, both outlets (replaces the old $48K/yr flat fee and the 75/25 Vessel profit split).
- **Rent:** Vessel **$0** (no separate rent), Little Wing **6% of revenue**.
- **Admin fee (Vessel only) = 5% of F&B revenue** (food + beverage sales; excludes service charge & other income). New charge to Method admin.

Order of the P&L: Revenue → COGS → Gross Profit → Labor → Credit card fees → Controllable → Non-controllable → **Management fee → Admin fee (Vessel) → Rent** → **NET OPERATING INCOME**.

---

## 3. Tab guide

| Tab | What it is |
|---|---|
| **Scenario Summary** | Headline 4-scenario comparison (T12 / 2026 Forecast / 2026 Modified / 2027 Plan) for Little Wing, Vessel, Combined. |
| **2026 Bridge** | Time-stamped change schedule. Each change has an editable **effective date** (default Aug 1, 2026) that prorates its in-year impact. Reconciles Forecast → 2026 Modified. |
| **Consolidated P&L** | FY roll-up (Vessel / LW / Combined, $ and % of revenue) + consolidated NOI-by-month. |
| **Combined 12-Mo P&L** | Every P&L line × 12 months + FY, summing Vessel + LW. |
| **Vessel Summary / Vessel Assumptions / Vessel Budget / Vessel GL Basis** | Vessel KPI summary, input drivers, 12-mo P&L, GL cost basis. |
| **LW Assumptions / LW P&L / LW Budget** | Little Wing input drivers, current-vs-adjusted annual P&L, 12-mo budget. |
| **LW Labor Model / LW Shift Detail / LW Weekly Compare** | Labor detail: current GL roles vs adjusted single-shift; employee-level roster; weekly loaded comparison. |
| **LW GL Basis** | LW T12 GL actuals (source for the Current/T12 column). |
| **LW Menu Pricing** | Item-level PMIX pricing lever (primary LW revenue lever). Named items (Latte, Drip, BEC…) each carry their own editable `Rec +$` in col F; "All other" remainder rows keep each group tied to the Toast H1×2 category totals. |

---

## 4. Key outputs (as currently built)

**Scenario Summary — NET OPERATING INCOME (bottom line, after mgmt fee, admin fee & rent):**

| | T12 | 2026 Forecast | 2026 Modified | 2027 Plan |
|---|---|---|---|---|
| Little Wing | −$157,155 | −$158,056 | −$111,876 | −$37,321 |
| Vessel | −$12,309* | −$12,309 | +$5,859 | +$29,186 |
| **Combined** | **−$169,464** | **−$170,365** | **−$106,017** | **−$8,134** |

\*Vessel T12 seeded with 2026 actual/forecast (no separate prior-year Vessel GL exists in the model) — overwrite if a true T12 becomes available.

- **T12** = trailing-twelve-month GL actuals (status-quo starting point).
- **2026 Forecast** = uploaded "Act/For" forecast (Jan–May actual + Jun–Dec forecast) = **status quo, no changes**.
- **2026 Modified** = the changes applied to the 2026 base, prorated from an **Aug 1, 2026 go-live** (5/12 of the year). Shows direct in-year impact.
- **2027 Plan** = full-year at planned volumes with all changes in place.

---

## 5. The changes we are modeling (levers) & where to edit

All are editable inputs; the 2026 Bridge gives each an effective date for proration.

**Little Wing:**
1. **Labor restructure** — single 6am–4pm FOH shift (10 hrs/day) + weekend 2nd barista **4 hrs/day** Sat & Sun (was 3h), **BOH cook KEPT at the current schedule ($296/wk base, ~13.3 hrs/wk — in-house food program retained, not prepackaged)**. Adjusted labor = **$111,954/yr** (vs GL T12 $164,857). Inputs: `LW Assumptions` C20 (10h), C21 (=2*4/7), C23 ($20/hr blended), C24 (16% burden), **C26 ($296/wk BOH)**.
2. **Menu pricing (PMIX)** — primary revenue lever. **Per-item** price moves on `LW Menu Pricing` (col F, editable, rows 6–28: named items from Toast top sellers annualized ×12/5, plus "all other" remainder rows so groups tie to category totals). Defaults (+$0.50 coffee/NA, +$1.00 sandwiches, hold Grab&Go/Snacks/Alc) replicate the old group-level move exactly: gross uplift $19,572 × **capture % (C52, default 90%)** = **net $17,614** (C53) applied to the plan. Feeds `LW Assumptions` C43.
3. **Retail improvement uplift** — `LW Assumptions` C46 = **50%** uplift on the ~$5,848 retail base = **+$2,924** (INPUT — tune this).
4. **Management fee** 4% — `LW Assumptions` C40. **Rent** 6% — C41.

**Vessel:**
5. **Management fee** 4% of revenue — `Vessel Assumptions` C30. **Rent** 0% — C31.
6. **Admin fee** 5% of F&B revenue — `Vessel Assumptions` C32 (new). = **$16,600** on 2027 plan F&B ($332K).

**Effective dates:** all default **2026-08-01** on the `2026 Bridge` tab (col B, editable per change). Active months in 2026 = 13 − MONTH(date); e.g., Aug = 5 months = 5/12 proration.

---

## 6. Data sources & hardcoded external figures

- **Little Wing revenue:** Toast H1-2026 item detail ×2 by category (Food $106,838 / NA-Coffee $131,727 / Alcohol $13,996 / Retail $5,848 / Other $7,793). COGS %: Food 44.07 / NA 22.16 / Alc 33.28 / Retail 0 / Other 0 (GL actual; no COGS booked for retail/other).
- **LW T12 (GL actual):** Revenue $258,287 · COGS $81,599 · Labor $164,857 · NOI −$157,155.
- **LW 2026 Forecast** (uploaded `Little Wing V2.pdf`): Revenue $287,305 · COGS $99,691 · Labor $168,162 · NOI −$158,056.
- **Vessel 2026 Forecast** (uploaded `Vessel forecast 2.pdf`): Revenue $344,171 · COGS $116,784 · Labor $75,138 · NOI −$12,309. **F&B base for admin fee = $230,063** (food + NA bev + liquor + beer + wine).
- **Vessel 2027 Plan drivers:** $4,000 F&B minimum/event × 80% of run-rate volume (83 events) → Revenue $398,400; food cost 60%, bev cost 25%; 75/25 Method split **removed**.

These 2026/T12 figures are entered as constants (blue) on the Scenario Summary and 2026 Bridge; the 2027 Plan columns link live to the Budget tabs.

---

## 7. Modeling conventions / notes

- **Blue font = editable input.** Everything else is formula-driven.
- **2026 Modified proration:** each summary line blends 7/12 forecast + 5/12 modified-annual using the change's effective-date factor. The 2026 Bridge waterfall carries a small "interaction / rounding" line (~$61 LW) so it foots to the summary to the dollar — this is the 4% fee + 6% rent landing on newly-added revenue.
- **Admin fee base** taken as food + beverage only (excludes service charge / other income). Easy to switch to total revenue by re-pointing `Vessel Budget` row 27.
- CC fees: go-forward 2.5% target in the plan; GL actual (~3.9%) used only in the LW "Current" column.
- H1→annual = ×2 (preferred over ×12/5). June run-rate (~$327K/yr LW) is the bullish alternative base.

---

## 8. Open items / possible next steps

- **Tune the two placeholder inputs:** retail uplift % (currently 50%) and pricing capture % (currently 90%).
- **Vessel T12:** replace the seeded placeholder if a true prior-year Vessel GL is available.
- **Stagger effective dates** on the 2026 Bridge if changes don't all go live Aug 1 (e.g., labor + mgmt fee first, pricing/retail later).
- **Optional:** monthly build of the 2026 Modified to see which months flip positive.
- **Related deliverables (separate files, not updated here):** `Little_Wing_H1_2026_Sales_Analysis.xlsx` (9-tab analysis workbook) and `Little_Wing_Repositioning_Plan.pptx` (19-slide deck, on hold). The analysis workbook still uses the old owner-economics convention — align it if needed.
