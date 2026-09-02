# Venue Tax Rates — Sourcing & Reconciliation

**Standard:** every venue's `salesTax` (food + non-alcoholic beverages) and
`liqTax` (alcoholic beverages, on-premise) must be set to the rate a guest
actually pays, established two ways:

1. **Reference Tripleseat** — the effective tax billed on real contracted events
   at the property (operational source of truth).
2. **Cross-reference the Department of Revenue** — the published state + county +
   city statutory rate, so the number is defensible and matches the final invoice.

When the two disagree, treat it as a flag for a human, not a silent override.

Rates live in the `venues.config` jsonb (`config.fixedRates.salesTax` /
`config.fixedRates.liqTax`), **not** in code. A venue with no `fixedRates` block
inherits the Vessel/Maryland default (6 / 9) — which is only correct for Vessel.
Tripleseat import (`mapEvent`) captures no per-event tax field, and
`applyFixedRates()` overwrites every event with its venue default, so the venue
default is the single source of truth for tax.

## Current rates (verified 2026-08-04)

| Venue | City | Sales tax (food) | Liquor tax (alcohol) | Basis |
|---|---|---|---|---|
| Vessel | Baltimore, MD | 6% | 9% | MD state sales tax 6%; MD alcoholic-beverage sales tax 9%. State-level only — no Baltimore City add-on. |
| Anthology | Detroit, MI | 6% | 6% | MI state sales tax 6% on both food and on-premise alcohol. Michigan has no separate liquor-by-the-drink tax; no Detroit add-on. |
| Lowland | Charleston, SC | 11% | 16% | 6% state + 3% Charleston County local option + 2% City hospitality tax = 11% food; alcohol adds the 5% SC liquor-by-the-drink tax = 16%. |
| The Nickel Hotel | Charleston, SC | 11% | 16% | Same Charleston stack as Lowland. |
| Wm. Mulherin's Sons | Philadelphia, PA | 8% | 10% | 6% PA state + 2% Philadelphia local = 8% food. Alcohol carries ONLY the 10% Philadelphia liquor tax — poured drinks are excluded from PA sales tax at retail (tax paid at wholesale purchase). |

### Component detail

- **Maryland (Vessel):** 6% sales / 9% alcohol are statewide and separately
  calculated; no local add-on.
- **Michigan (Anthology):** flat 6% sales tax applies to on-premise alcohol; no
  liquor-by-the-drink excise.
- **South Carolina (Lowland, Nickel):** 6% state + Charleston County 3% local
  (1% county + 2% special/transportation district) + 2% City of Charleston
  hospitality tax on prepared food & beverage. Alcohol sold for on-premise
  consumption adds the 5% SC liquor-by-the-drink tax on top.
- **Pennsylvania (Mulherin's):** 6% PA state + 2% Philadelphia local = 8% on
  prepared food and non-alcoholic beverages. Alcoholic drinks sold for
  on-premise consumption are **excluded from PA sales tax** at the point of sale
  (the licensee pays sales tax when it buys the liquor at wholesale — 61 Pa.
  Code § 60.7), so a poured drink carries ONLY Philadelphia's 10% liquor tax.
  The 8% sales tax does NOT stack on top of the drink.

## History

- **2026-08-04** — Full DOR cross-reference of all five venues.
  - Mulherin's (Philadelphia) had **no** `fixedRates` block and was silently
    inheriting Vessel's Maryland 6 / 9. Set to DOR-correct **8 / 10** (8% food;
    10% Philadelphia liquor tax on alcohol, with no PA sales tax on poured drinks).
  - Lowland & Nickel (Charleston) were **8 / 13** (from earlier Tripleseat
    contract scans), which omitted Charleston County's 3% local option sales tax.
    Updated to the DOR statutory **11 / 16**.
  - Vessel (Baltimore) and Anthology (Detroit) confirmed correct — no change.

### DOR sources

- Maryland alcohol 9% / food 6% — marylandtaxes.gov (Alcohol Sales Tax; Sales of Food)
- Michigan 6%, no liquor-by-drink — michigan.gov/lara (Sales Tax on Alcoholic Liquor Products)
- South Carolina — dor.sc.gov (Liquor by the Drink, 5%); charleston-sc.gov (2% Hospitality Tax); Charleston County combined sales tax 9% (6% state + 3% local)
- Pennsylvania / Philadelphia — phila.gov (Liquor Tax, 10%; 8% combined sales tax = 6% PA + 2% Phila); PA Revenue + 61 Pa. Code § 60.7 (poured alcoholic drinks excluded from retail sales tax — tax paid at wholesale)
