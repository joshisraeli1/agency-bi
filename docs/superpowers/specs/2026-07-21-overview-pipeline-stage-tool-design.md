# Overview Pipeline-Stage Revenue Tool — Design

**Date:** 2026-07-21
**Location:** Overview page (`src/app/(dashboard)/page.tsx`)

## Purpose

Add a revenue-by-stage "pipeline" tool to the Overview page. It shows four
columns, each with a revenue total, and each clickable to expand the underlying
deals. It answers "how much revenue sits in each stage right now, and which
deals make it up" — a current-time snapshot.

## Columns

Every column keys directly off the raw HubSpot `stageLabel` — these are the
literal pipeline stages, not values derived from `churnDate` or the mapped
`stage`. Four columns, in progression order:

| # | Column | Predicate (`stageLabel` ∈) | Notes |
|---|--------|-----------|-------|
| 1 | **Very Warm** | `"Very Warm"` | Pre-close pipeline stage |
| 2 | **Contract out** | `"Contract out"` **and no start date** | Contract-out deals not yet scheduled |
| 3 | **Incoming** | `"Contract out"` **and a start date is set** | Signed / scheduled — matches the forecast waterfall's "incoming" figure to the dollar |
| 4 | **Closed Won** | `"Closed Won"` | Won and currently paying — naturally includes deals that carry a future churn date |
| 5 | **Churned (still active)** | `"Churned but still active"`, `"Current (Not Paying)"` | Two post-close stages merged into one column |

(Contract out is split by start-date presence: a populated start date means the deal is signed and scheduled — "Incoming" — matching the forecast waterfall; no start date keeps it in "Contract out". The two columns together equal the full Contract-out book.)

Notes:
- These are **mutually exclusive** columns — each deal has exactly one
  `stageLabel`, so a deal appears in at most one column. (This replaces the
  earlier `churnDate`-overlap design, which did not match the real data.)
- The mapped `stage` field is NOT used for bucketing. Real HubSpot data maps
  several distinct labels onto the same `stage` (e.g. both `"Churned"` and
  `"Churned but still active"` map to `stage = "churned"`; `"Very Warm"` maps to
  `"negotiation"`), so `stageLabel` is the only field that distinguishes the
  columns we want.
- The large plain **`"Churned"`** stage (fully-lost deals) is intentionally
  **excluded** from all columns — it is not one of the four stages of interest.
- "Closed Won" here is the `stageLabel = "Closed Won"` set (currently-paying won
  deals), which is a subset of the app's mapped `stage = "closed_won"` book used
  elsewhere. That is intended: this tool is a pipeline-stage view, not the
  full-book revenue figure.

## Value basis

Every column is reported **ex-GST** so the totals reconcile with the Overview's
ex-GST revenue tile (the tool's Closed Won column then equals the "Monthly
Revenue (ex GST)" tile to the dollar). Each deal's value is
`amountExGst ?? (amount / 1.1)`: when a deal stores no ex-GST value (Very Warm
and Contract out deals don't), the inc-GST `amount` is converted to ex-GST by
removing the 10% GST — the same `amount / 1.1` fallback used in
`michael-sales.ts`. A column total is the sum of its deals' values, rounded.
Deal lists are sorted by amount, high → low.

## Data layer

New analytics module `src/lib/analytics/pipeline-stages.ts`:

- **Pure function** `bucketPipelineStages(deals, excludedIds, now)` → ordered
  array of `{ stage: string; total: number; deals: { name: string; amount: number }[] }`.
  Buckets purely on `stageLabel`. `now` is currently unused for bucketing (the
  columns no longer depend on dates) but is kept in the signature for a stable
  snapshot contract.
- **Function** `getPipelineStageSnapshot()` → runs the DB query + calls the pure
  function with `new Date()`.
- **Query:** one `db.hubspotDeal.findMany` selecting
  `{ name, clientId, stageLabel, amount, amountExGst }`, filtered to the four
  labels of interest (`"Very Warm"`, `"Contract out"`, `"Closed Won"`,
  `"Churned but still active"`, `"Current (Not Paying)"`), then bucketed in
  memory. Excludes excluded clients via `getExcludedClientIds()`.
- Deal shape is a local `{ name, amount }` (`PipelineDeal`).

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
- Render `<PipelineStageTool stages={...} />` as the **last section on the
  page**, after the At-Risk Clients / Recent Imports grid.

## Out of scope (YAGNI)

- No date-range filtering — it is always a "now" snapshot, independent of the
  Overview's month picker.
- No new stages beyond the four above; no per-division breakdown; no charting
  library — plain cards and a list, matching `michael-tiles.tsx`.

## Testing

- No test framework exists in this repo; verify `bucketPipelineStages` with a
  standalone `tsx` assertion script under `scripts/` (matching `scripts/check-*.ts`).
- Fixture deals cover: a Very Warm deal (ex-GST null → `amount` fallback), a
  Contract out deal, a Closed Won deal, a "Churned but still active" deal and a
  "Current (Not Paying)" deal (both land in the merged Churned column), a plain
  "Churned" deal (dropped — not one of the four columns), and an excluded-client
  deal (dropped from all buckets). Assert column order, totals, and per-column
  deal membership.
