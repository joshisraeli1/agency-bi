# Overview Pipeline-Stage Revenue Tool — Design

**Date:** 2026-07-21
**Location:** Overview page (`src/app/(dashboard)/page.tsx`)

## Purpose

Add a revenue-by-stage "pipeline" tool to the Overview page. It shows four
columns, each with a revenue total, and each clickable to expand the underlying
deals. It answers "how much revenue sits in each stage right now, and which
deals make it up" — a current-time snapshot.

## Columns

Evaluated as a snapshot **as of today** (no future-dating). Four columns, in
progression order:

| # | Column | Predicate | Notes |
|---|--------|-----------|-------|
| 1 | **Very Warm** | `stageLabel = "Very Warm"` | Pre-close pipeline, raw HubSpot stage label |
| 2 | **Contract out** | `stageLabel = "Contract out"` | Pre-close pipeline, raw HubSpot stage label |
| 3 | **Closed Won** | `stage = "closed_won"` | Full closed-won book — includes deals that carry a churn date |
| 4 | **Churned** | `churnDate` is set and on or before today | Deals that have actually churned as of the snapshot |

Notes on overlap:
- **Closed Won** is the full book and intentionally still counts deals that also
  appear under **Churned** (a churned deal remains in the closed-won total). The
  Churned column is a breakout, not a mutually-exclusive funnel stage. This
  matches the "full closed-won book" convention already used in
  `active-revenue.ts`.
- A closed-won deal with a churn date **in the future** counts under Closed Won
  only (it has not churned yet as of the snapshot).

## Value basis

Each deal's value uses `amountExGst ?? amount`, matching the existing
`michael-sales.ts` pipeline snapshot. A column total is the sum of its deals'
values, rounded. Deal lists are sorted by amount, high → low.

## Data layer

New analytics function, colocated with the existing active-revenue logic:

- **File:** `src/lib/analytics/active-revenue.ts` (add) or a small new
  `src/lib/analytics/pipeline-stages.ts` — decide during planning; the query
  overlaps with active-revenue's deal set.
- **Function:** `getPipelineStageSnapshot()` → returns an ordered array of
  `{ stage: string; total: number; deals: { name: string; amount: number }[] }`.
- **Query:** one `db.hubspotDeal.findMany` selecting
  `{ name, stage, stageLabel, amount, amountExGst, churnDate }`, filtered to the
  union of the four predicates, then bucketed in memory. Excludes excluded
  clients consistently with the other Overview analytics (reuse whatever
  exclusion helper active-revenue uses).
- Reuse the shared `DealRef`-style `{ name, amount }` shape used by the existing
  drill-downs.

## UI component

New client component `src/components/dashboard/pipeline-stage-tool.tsx`,
modeled on `michael-tiles.tsx`:

- Renders the four columns as clickable cards in a responsive grid
  (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`), each showing the column title
  and its `formatCurrency(total)`.
- `useState<string | null>` tracks the selected column. Clicking a card toggles
  it open; clicking again (or "Close") collapses it. Only one open at a time —
  same interaction as `MichaelTiles`.
- Expanded panel lists each deal (name left, `formatCurrency(amount)` right,
  truncated names) with a bold **Total** row at the bottom, reusing the exact
  markup pattern from `michael-tiles.tsx`.
- Wrapped in a `Card` with a `CardTitle` (e.g. "Revenue by Pipeline Stage") to
  match the surrounding Overview sections.

## Wiring

In `src/app/(dashboard)/page.tsx`:
- Add `getPipelineStageSnapshot()` to the existing `Promise.all` block.
- Render `<PipelineStageTool stages={...} />` as a new section, placed near the
  other package/revenue sections (exact position finalized in the plan).

## Out of scope (YAGNI)

- No date-range filtering — it is always a "now" snapshot, independent of the
  Overview's month picker.
- No new stages beyond the four above; no per-division breakdown; no charting
  library — plain cards and a list, matching `michael-tiles.tsx`.

## Testing

- Unit-test `getPipelineStageSnapshot` bucketing with fixture deals covering:
  a Very Warm deal, a Contract out deal, a closed-won deal with no churn date,
  a closed-won deal with a **future** churn date (Closed Won only, not Churned),
  a deal with a **past** churn date (Churned + still in Closed Won), and an
  excluded-client deal (dropped from all buckets). Assert totals and per-column
  deal membership.
- Follow the repo's existing test conventions for analytics functions.
