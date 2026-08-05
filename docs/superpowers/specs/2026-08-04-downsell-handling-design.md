# Downsell handling — design

Date: 2026-08-04
Status: approved, ready for implementation plan

## Problem

When a client downgrades their package, the HubSpot workflow is to **churn the existing
deal and create a new deal at the lower amount**. To every analytics surface in this tool
that reads like two events: a client that churned, and an unrelated new client that
arrived the same month.

The damage, using the live example (Hello Fresh NZ, $9,900 → $7,425):

| Surface | Wrong result today | Correct result |
|---|---|---|
| Churn chart | $9,900 churned | $2,475 churned |
| New revenue | $7,425 new | $0 |
| Deal count | 2 deals | 1 deal |
| Avg deal size | dragged down by a phantom deal | unaffected |
| Tenure / LTV | lifecycle resets to the new deal's start | continuous from 2026-04-01 |
| Michael's tab | +1 deal created, commission on $7,425 | neither |

Tenure is the sharpest of these. It is computed from `Client.startDate → endDate`
(`advanced-analytics.ts:106-128`), and the deal sync only sets `HubspotDeal.clientId` when
a `Client` row already carries that `hubspotDealId` (`refresh-syncs.ts:110-119`) — a
unique column, one deal per client. A newly created downsell deal therefore arrives
**unlinked to any client**, which is precisely how a lifecycle gets split.

## Signals available

`Package Description` (`package_description`) gained a **Downsell** option, alongside the
existing Upsell. It already syncs into `HubspotDeal.packageDescription`.

`Reasons for Churn` (`reasons_for_churn`) is an existing enumeration — Price, Results,
Not seeing Value, Going In-house, Business Closure, etc. A **Downsell** option is being
added to it. The field is **not currently synced** and is **not yet populated**.

Deal→company associations are absent on all four Hello Fresh deals, so company-association
pairing is not viable.

Current state of the live example:

| Deal | Amount | Stage | Start | Churn | Package Description |
|---|---|---|---|---|---|
| Hello Fresh NZ `59153676324` | $9,900 | closed-won | 2026-04-01 | — | — |
| Hello Fresh NZ `63433823302` | $7,425 | not closed-won | — | — | Downsell |
| Hello Fresh AU `56116135556` | $14,850 | closed-won | 2026-04-01 | — | — |
| Hello Fresh AU **Dowsell** `63433698333` | $11,550 | not closed-won | 2026-08-01 | — | — |

Neither predecessor is churned yet, one downsell is untagged, and one name is misspelled.
The design must tolerate exactly this kind of partial data.

## Model: a downsell pair is one continuous deal

New module `src/lib/analytics/downsells.ts`, structured like `upsells.ts` — pure functions,
single source of truth, every surface that enumerates deals runs it.

### Identify

`isDownsell(d)`: the `packageDescription` tag set contains `downsell`, OR the name matches
`/\bdown-?sells?\b/i`. The `Dowsell` misspelling is also matched — cheap insurance against
typos, removable once HubSpot is clean.

### Pair

For each downsell `D`, find the deal it replaces:

- **Required** — company-root name match against a non-downsell closed-won or churned deal.
  Reuses `companyRoot()` from `upsells.ts` (strips the downsell token plus trailing
  service-line qualifiers), so `Hello Fresh NZ` → `hellofreshnz` and
  `Hello Fresh AU Dowsell` → `hellofreshau`.
- **Confirming, at least one** — the candidate's `churnReason === "Downsell"`, or its
  `churnDate` falls within ±1 month of `D`'s start month.
- **Ranking** when several candidates match — churn-reason match, then closest date, then
  same division, then largest amount.

Requiring a name match but only one of the two confirming signals means the rule works on
dates alone today, and tightens by itself as churn reasons get populated.

### Continue

A paired downsell extends its predecessor rather than standing alone:

| Aspect | Rule |
|---|---|
| Identity | One logical deal keyed on the **predecessor's** id and `clientId`; the downsell inherits that `clientId`, which is what holds tenure and LTV on a single client row |
| Timeline | Predecessor's amount runs to the **handover month**, the downsell's amount from that month on. Handover = month of the downsell's start date, falling back to the predecessor's churn month. Derived from the pair, so a few days' mismatch in the raw dates cannot open a gap or double-count a month |
| Deal count | One, at the current (lower) amount |
| Churn | At the handover month, churn = `predecessorExGst − downsellExGst`; new revenue = 0 |
| Never new business | A downsell is **never** new business on any surface. It is not a new deal, not new revenue, not a new client, and not an upsell. Wherever deals are classified by start month, a paired downsell classifies as **existing** revenue. Enumerated exhaustively below |
| Tenure | Lifecycle start = earliest deal in the chain. A downsell of a downsell walks back, so tenure never resets |
| Expansion | If the replacement is *larger*, the delta books as new revenue instead of negative churn — symmetric, and no chart ever renders a negative bar |
| Churn count | The predecessor is **not** a churned client. Churn counts, churn percentage and churned-client lists all skip it — only the dollar contraction registers |
| Not yet closed-won | A paired downsell supersedes its predecessor **only once it reaches closed-won**. Before that the predecessor keeps running at full amount, and the downsell counts as neither pipeline nor forecast revenue — it is a scheduled reduction, not incoming new money. Both current Hello Fresh downsells are in this state |

Upsells are folded **before** downsells are paired: an upsell folded onto the old deal is
part of what the client was actually paying, so the contraction is measured against the
real total.

`pairDownsells(deals)` returns `{ deals, pairs, unpaired }`.

### Hold out the unpaired

An unpaired downsell is **excluded from all revenue, count and pipeline surfaces** until
its HubSpot data is complete. This avoids double-counting during the population period, at
the cost of temporarily understating revenue — so the held-out set must be visible.

A **"Downsells needing attention"** card sits at the bottom of the Overview beside Recent
Imports: deal name, amount, and the reason it did not pair (no predecessor found /
predecessor has no churn date or churn reason / dates too far apart). Both Hello Fresh
deals appear there today, since neither predecessor is churned.

## Changes

### Schema and sync

- `HubspotDeal.churnReason String?` — added via `npx prisma db push` (this project's Prisma
  migration history is locked to SQLite; `migrate dev` is not used).
- `refresh-syncs.ts` — add `reasons_for_churn` to the fetched properties and map it to
  `churnReason`.

### Every surface that could report a downsell as new business

These are the complete set of places that classify a deal as "new", and all must treat a
paired downsell as existing revenue. Verified by grepping every `newRevenue` / `newDeals` /
`createdDeals` computation in `src/lib/analytics`:

| Surface | Code | Leak if unfixed (August) |
|---|---|---|
| New Revenue vs Churn (Overview) | `revenue-overview.ts:377` `getRevenueVsChurn` | $29,250 new + $40,250 churn instead of $0 new + $11,000 churn |
| Revenue Composition (Analytics) | `active-revenue.ts:111-126` — buckets on `deal start month === selected month`, no downsell carve-out | $29,250 booked as new revenue across Content Delivery; must land in `existing` |
| Michael — New Revenue goal | `michael-sales.ts:269-277` `newRevenuePerMonth` | Would inflate his $20k/mo goal. Not triggered by the current three (owner `250378614`, not Michael `76570622`), but must hold for future downsells he owns |
| Michael — deals created | `michael-sales.ts:245-264` `createdDealsByMonth` | Would inflate the 5-deals/month goal |
| Michael — commission | `michael-sales.ts:199-206` | Would pay commission on the replacement amount |
| New-client deal size | `advanced-analytics.ts` `getNewClientDealSize`, `avg-deal-size-comparison.ts` | A downsell would register as a newly acquired client |
| 3-month forecast | `forecast-3month.ts` | Would forecast the replacement as incoming revenue |

The downsell is also **not** an upsell: it must never appear in the composition chart's
`upsell` bucket or `upsellDeals` list.

### Call sites

| File | Change |
|---|---|
| `active-revenue.ts` (2 sites) | snapshot deal count, by-package-type |
| `active-revenue.ts` composition | paired downsell classified as `existing`, never `newRevenue` or `upsell` |
| `agency-kpis.ts:347` | division counts and averages |
| `avg-deal-size-comparison.ts:61` | average deal size |
| `clients/page.tsx:105` | client list retainer and service tab |
| `revenue-overview.ts` | monthly MRR windows keyed off the handover month, not raw start/churn dates |
| `revenue-overview.ts` `getRevenueVsChurn` | contraction as churn, $0 new |
| `advanced-analytics.ts` `getLTVData` | `clientId` inheritance, chain-aware lifecycle |
| `michael-sales.ts` | downsells excluded from deals-created and from commission |
| `forecast-3month.ts` | no downsell surfaces as pipeline — held-out ones because they are excluded outright, paired-but-not-yet-won ones because they are a reduction rather than incoming revenue |
| Overview page | "Downsells needing attention" card |

### Explicitly unchanged

- **Upsell handling.** `foldUpsells` keeps its current behaviour; downsells are a separate
  module.
- **Reconciliation.** It matches individual deals to Xero invoices, so it reads raw deals —
  the same carve-out upsells already have.
- **Churn-reason UI.** The field is synced but not surfaced. `reasons_for_churn` is
  unpopulated, so any chart built on it now would be empty. Revisit once there is data.

## Verification

The project has no test runner. Following the existing convention (`scripts/check-*.ts`
with `tsx`), the logic lives in pure functions and `scripts/check-downsells.ts` asserts
over fixtures:

- clean pair (tag + churn reason + aligned dates)
- pair on dates alone, churn reason absent — must still pair
- pair on churn reason alone, dates loose — must still pair
- misspelled `Dowsell` name, untagged
- no predecessor → unpaired, held out
- predecessor with neither churn reason nor churn date → unpaired, held out
- dates more than a month apart with no churn reason → unpaired
- downsell of a downsell → tenure walks back to the original start
- expansion case → delta books as new revenue, churn stays 0
- handover month boundary → no gap, no double-counted month
- paired downsell not yet closed-won → predecessor keeps its full amount, nothing in pipeline or forecast
- predecessor of a paired downsell → absent from churn counts and churned-client lists
- upsell folded onto the predecessor before the contraction is measured

### Real-data acceptance test

The three live pairs make August 2026 a precise acceptance test. All three predecessors
carry `reasons_for_churn = Downsell` and `churn_date = 2026-08-01`; all three successors
are closed-won with `start_date = 2026-08-01`.

| Pair | ex-GST | Contraction |
|---|---|---|
| Hello Fresh NZ (`59153676324` → `63433823302`) | $9,000 → $6,750 | $2,250 |
| Hello Fresh AU (`56116135556` → `63433698333`) | $13,500 → $10,500 | $3,000 |
| YouFoodz (`58208775747` → `63436346972`) | $17,750 → $12,000 | $5,750 |
| **Total** | | **$11,000** |

August must report **$11,000 churn and $0 new revenue** — not the $40,250 churn / $29,250
new that the current code would produce. Deal count unchanged, no churned clients, three
lifecycles continuous from April, MRR down exactly $11,000 month on month.

Measured against the live local DB on 2026-08-05, the whole-chart figures for the
*New Revenue vs Churn* bars are:

| August 2026 | Current | Required after fix |
|---|---|---|
| New Revenue (ex-GST) | $95,050 | **$65,800** |
| Churned Revenue (ex-GST) | $104,900 | **$75,650** |

This flips August from −$9,850 net to +$9,850 net. The remaining August churn is genuine
and must be untouched: EatClub Upsell $17,000, Mighty Munch $9,000, Affinity Education
$8,000, Shift4 Ads Mgmt $8,000, Shift4 Content $6,500, Juniper Ad Hoc Shoot $6,000, Sortd
$5,650, Credabl $4,500.

Upsells continue to appear as new revenue in this chart (Juniper Upsell $15,000, Chill
Chair Upsell $7,500, and others in August) — that is existing, intended behaviour and is
explicitly out of scope.

Note `Hello Fresh NZ` and `Hello Fresh AU` must not cross-pair: `NZ` and `AU` are not in
`QUALIFIER_WORDS`, so the company roots stay distinct (`hellofreshnz` / `hellofreshau`).
This gets an explicit assertion.

Then `npx tsc --noEmit` clean before any push.

## Dependencies on HubSpot data

Nothing below blocks implementation, but the numbers stay held-out until they are done:

1. Add **Downsell** to the *Reasons for Churn* options.
2. Set churn date and churn reason on each superseded deal.
3. Tag each replacement deal `Package Description = Downsell` and move it to closed-won.
4. Fix the `Hello Fresh AU Dowsell` spelling (or rely on the typo fallback).
