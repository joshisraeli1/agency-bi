# Churn Reasons Charts — Design

**Date:** 2026-08-20
**Status:** Approved

## Problem

HubSpot's "Reasons for Churn" property already syncs into
`HubspotDeal.churnReason`, but nothing in the app reads it. The Analytics tab
shows *how much* churn happens (`ChurnRateSection`) and never *why*.

## Goal

Two charts on the Analytics tab, directly beneath the existing Monthly Churn
Rate section:

1. A donut of total churn-reason counts.
2. A monthly stacked bar chart of churn reasons over time.

No schema change, no sync change, no new dependency.

## Data shape in HubSpot

`reasons_for_churn` is a **multi-select**, stored as a semicolon-delimited
string. Observed live (271 deals with a churn date):

| Reason | Mentions |
|---|---|
| Peformance *(HubSpot's own typo)* | 65 |
| Campaign Shoot Only | 55 |
| Proactive Churn from Swan Studio | 41 |
| Account Management | 40 |
| Not seeing Value | 31 |
| (unspecified) | 20 |
| Other | 19 |
| Going In-house | 17 |
| Business Closure | 12 |
| Too many creatives/deliverables | 11 |
| Price | 8 |
| Lack of connection to data | 7 |
| Downsell | 3 |

13 distinct reasons. 55 of 271 deals carry more than one. Churn volume runs
3–16 deals per month across 2024–2026.

## Decisions

**Multi-select counts once per reason.** A deal tagged
`"Peformance;Account Management"` adds +1 to both buckets. Totals therefore
exceed the deal count, so both cards state the deal count and the mention
count explicitly — the donut reads as *share of reasons cited*, not *share of
churned clients*. The alternatives (one bucket per exact combination, or
first-reason-only) were rejected: the first produces ~40 slices most holding
1–2 deals, the second silently discards the second reason on 55 deals.

**Over time = monthly stacked bars.** Matches the churn-rate chart directly
above it and the rest of the page's monthly cadence. At 3–16 churns a month
the segments stay readable.

**Top 6 reasons + a rollup.** Thirteen stacked series exceeds the 12-colour
palette and produces indistinguishable 1-deal slivers. The donut still shows
all 13, so nothing is hidden — only the stack is trimmed. The rollup is
labelled **"Less common reasons"**, not "Other": HubSpot has a literal "Other"
reason of its own that ranks inside the top 6, so two near-identical legend
entries would otherwise sit side by side.

**Scope follows the page date picker and excludes downsells.** Both charts
honour the existing `?months=` param like every other card on the page.
Downsell predecessors are dropped, because the codebase already treats a
downsell as a contraction rather than a lost client.

**HubSpot's typo is corrected at display time only.** `Peformance` renders as
`Performance`; the raw value is what gets matched, so a later fix in HubSpot
needs no code change here.

## Architecture

### `src/lib/analytics/churn-reason-labels.ts` (new)

The rollup label, the unspecified label, and the display-name map, in a module
that imports nothing. `churn-reasons.ts` reaches Prisma, so a client component
value-importing a constant from there pulls the whole server stack into the
client bundle — `tsc` passes and `next build` fails on `node:module`. Keeping
the labels db-free is what lets both sides share them.

### `src/lib/analytics/churn-reasons.ts` (new)

```ts
export interface ChurnReasonTotal { reason: string; count: number }

export interface ChurnReasonMonthRow {
  month: string;                     // "2026-08"
  counts: Record<string, number>;    // top-6 reasons + "Other"
  deals: Record<string, string[]>;   // reason -> deal names, for the drill-down
}

export interface ChurnReasonsData {
  totals: ChurnReasonTotal[];        // all reasons, descending
  topReasons: string[];              // the 6 charted series
  byMonth: ChurnReasonMonthRow[];
  churnedDeals: number;              // deals in range
  reasonMentions: number;            // >= churnedDeals, from the multi-select
  unspecified: number;               // churned with no reason set
}

export async function getChurnReasons(months: number): Promise<ChurnReasonsData>
```

Implementation, one query plus the two shared cached loaders:

1. `db.hubspotDeal.findMany({ where: { churnDate: { not: null } }, select: { id, clientId, name, churnDate, churnReason } })`.
2. Drop deals whose `clientId` is in `getExcludedClientIds()` — prospects and
   Legacy Urban Swan, the same filter `getMonthlyChurn` applies.
3. Drop deals in `getDownsellResolution().predecessorIds` — the identical
   `churnVisible` filter used at `advanced-analytics.ts:687`.
4. Bucket by `toMonthKey(churnDate)`, restricted to `getMonthRange(months)`.
5. Split `churnReason` on `;`, trim, drop empties and any `Downsell` token;
   an empty result becomes `"Unspecified"`.
6. Map raw labels through a display table (`Peformance` -> `Performance`).
7. `topReasons` = the 6 highest totals; every other reason folds into
   `"Other"` in `byMonth` only.

Plain `toMonthKey(churnDate)` is correct here rather than `windowKeys` —
handover-shifted churn months only exist for downsell predecessors, which
step 3 has already removed.

### `src/components/dashboard/churn-reasons-section.tsx` (new)

A client component holding both charts, side by side on desktop and stacked on
mobile. Returns `null` when there is no churn in range.

- **Donut** is a local Recharts `PieChart` over all reasons, paired with a
  ranked reason/count/percent list. It does not reuse `PieChartCard`, whose
  built-in slice labels overlap illegibly at 13 slices, and the exact counts
  are the point. Slice colours are indexed off the same descending order the
  stack uses, so a reason keeps one colour across both charts. Caption:
  "N churned deals cited M reasons — a deal can have more than one."
- **Stacked bars** is a Recharts `BarChart` with seven `<Bar stackId="a">`
  series coloured from `getChartColor`, `TOOLTIP_STYLE` for the tooltip, and a
  click-a-month drill-down listing which deals cited which reason — the same
  interaction idiom as `ChurnRateSection` and `RevenueByServiceLineChart`.

### `src/app/(dashboard)/analytics/page.tsx` (edit)

`getChurnReasons(months)` joins the existing `Promise.all`;
`<ChurnReasonsSection data={churnReasons} />` renders immediately after
`<ChurnRateSection>` so both churn views sit together.

## Error handling

A deal with a churn date outside the selected range is simply absent. A null or
whitespace-only `churnReason` becomes `"Unspecified"`, never a blank slice.
Months with zero churn render as an empty column, preserving the x-axis. An
empty range renders nothing rather than an axis with no bars.

## Verification

`scripts/check-churn-reasons.ts`, in the house `assert`/`FAIL` style, asserting:

- `reasonMentions` equals the sum of `totals[].count`
- summing `byMonth[].counts` equals the range's mention total
- no `"Downsell"` slice appears, and no known predecessor deal is counted
- `topReasons.length <= 6` and each appears in `totals`
- `unspecified` matches the count of in-range deals with a null/blank reason

Then `npm run build`, which is required before any push on this project —
and which is what caught the client-bundle import described above.

Live result over a 12-month range: 108 churned deals citing 140 reasons, 12
distinct reasons, 3 downsell predecessors correctly excluded, all assertions
passing.

## Out of scope

Revenue-weighted churn reasons, filtering by division, and reason breakdown on
the client detail page. The request is a count of reasons, total and over time.
