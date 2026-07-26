# 3-Month Revenue Forecast — Design

**Date:** 2026-07-24
**Location:** Overview page (`src/app/(dashboard)/page.tsx`), directly below the pipeline-stage tool (`PipelineStageTool`).

## Purpose

Forecast a concrete recognized-MRR figure for **each of the next three months**, starting from the current closed-won book and netting expected new revenue (from pipeline conversion + net-new business) against expected churn (known + statistical). Not a waterfall — a month-by-month projected number, each decomposable and drillable to the contributing deals.

## Model (ex-GST throughout, monthly running balance)

Base: **current MRR = Closed Won ex-GST book** (`stageLabel = "Closed Won"`, excluded clients removed, value `amountExGst ?? amount / 1.1`). This equals the Overview's ex-GST revenue tile.

Forecast the next three calendar months (current month + 1, + 2, + 3). Carry a running MRR forward:

```
projected[0]      = currentMrr
for each month m in (next 3 months):
    starting      = projected[m-1]
    pipelineAdded = Σ expected value of pipeline deals whose expected start month == m
    netNewAdded   = netNewMonthly            (trailing-12-mo run-rate)
    knownChurn    = Σ ex-GST of deals whose churnDate falls in m
    baselineChurn = churnRate × max(0, starting − knownChurn)
    projected[m]  = starting + pipelineAdded + netNewAdded − knownChurn − baselineChurn
```

Pipeline and net-new additions persist in later months (they join the recurring book); the running balance carries them forward automatically.

### Component inputs

- **Pipeline conversion (probability-weighted, timed).** For each open deal with `stageLabel ∈ {"Very Warm", "Contract out"}` (excluded clients removed):
  - `expected = dealValueExGst × STAGE_PROBABILITY[stageLabel]`, where `STAGE_PROBABILITY = { "Very Warm": 0.70, "Contract out": 0.90 }` — HubSpot's actual configured stage win-probabilities, held as constants (a future enhancement may sync `hs_deal_stage_probability` per deal so HubSpot changes flow through automatically).
  - **Expected start month:** `startDate`'s month if set; else the month of `createDate + medianLagDays`. `medianLagDays` = the median historical `createDate → startDate` lag across closed-won deals (~27 days from current data). Clamp: if the computed start month is at or before the current month, place it in the **first** forecast month (an open, "overdue" deal is expected imminently). If beyond the 3-month horizon, the deal is excluded.
  - Deal value ex-GST = `amountExGst ?? amount / 1.1` (Very Warm / Contract out store no ex-GST value).
- **Net-new business.** `netNewMonthly` = trailing-12-month average monthly new closed-won revenue (sum of ex-GST of closed-won deals whose start month falls in each of the last 12 months, ÷ 12). Added every forecast month.
- **Churn.**
  - `knownChurn[m]` = ex-GST of **Closed Won base** deals whose `churnDate` is in month m. Restricted to the Closed Won book because only revenue that is currently billing (the base) can churn out of it — subtracting a deal not in the base would over-reduce. (Historical churned deals still drive the `churnRate` below; they just don't double-subtract here.)
  - `churnRate` = (trailing-12-month total churned ex-GST ÷ 12) ÷ currentMrr — the monthly baseline rate (~7.1%/mo on current data; **surfaced prominently** as it is high).
  - `baselineChurn[m]` = `churnRate × max(0, starting − knownChurn[m])` — applies the statistical rate only to the base not already flagged with a known churn date, so no deal is double-counted.

### Current grounded values (2026-07-24, clean data)

Base $590,146 · net-new $34,691/mo · churn 7.1%/mo · pipeline-weighted ~$95,002 (lands across months by timing). Rough trajectory: **$590k → ~$611k → ~$630k → ~$647k**.

## Data layer

New module `src/lib/analytics/forecast-3month.ts`:

- **Pure helpers** (testable without a DB):
  - `medianCreateToStartLagDays(deals): number`
  - `expectedStartMonth(deal, medianLagDays, forecastMonths, now): string | null` (applies start-date-or-lag + clamp + horizon rules)
  - `buildForecast({ currentMrr, pipelineDeals, churnByMonth, netNewMonthly, churnRate, forecastMonths })`: the running-balance loop → `ForecastMonth[]`.
- **`getThreeMonthForecast(now = new Date())`**: one `db.hubspotDeal.findMany` for the relevant deal set (`stageLabel ∈ {Very Warm, Contract out, Closed Won, Churned but still active, Current (Not Paying)}` OR `churnDate != null`), computes currentMrr / netNewMonthly / churnRate / medianLag, then calls `buildForecast`. `db` and `getExcludedClientIds` imported lazily (module import-safe for the tsx test), consistent with `pipeline-stages.ts` and `division-fy.ts`.
- Reuse the ex-GST fallback (`amountExGst ?? amount / 1.1`) and `getExcludedClientIds()` exclusion already used across analytics.

### Types

```ts
interface ForecastDealRef { name: string; amount: number }
interface ForecastMonth {
  month: string;        // "Aug 2026"
  rawMonth: string;     // "2026-08"
  starting: number;
  pipelineAdded: number;
  netNewAdded: number;
  knownChurn: number;
  baselineChurn: number;
  projected: number;
  pipelineDeals: ForecastDealRef[]; // deals contributing pipelineAdded this month
  churnDeals: ForecastDealRef[];    // deals churning this month
}
interface ThreeMonthForecast {
  currentMrr: number;
  months: ForecastMonth[];          // exactly 3
  assumptions: {
    netNewMonthly: number;
    churnRatePct: number;           // e.g. 7.1
    medianLagDays: number;
    stageProbabilities: { stage: string; probability: number }[];
  };
}
```

## UI component

New client component `src/components/dashboard/three-month-forecast.tsx`:

- Card titled **"3-Month Revenue Forecast"**.
- A compact **assumptions strip** at the top: net-new/mo, churn rate %/mo (visually flagged since it's high), stage probabilities. Plain text, muted.
- **One block per forecast month** (three across on desktop, stacked on mobile), each showing the decomposition:
  `Starting → + Pipeline → + Net-new → − Known churn → − Baseline churn → **Projected MRR**` with the projected figure emphasized.
- **Pipeline** and **Known churn** lines are **clickable to expand** the contributing deals (name + ex-GST amount), reusing the drill-down interaction pattern from `pipeline-stage-tool.tsx` (`useState` selection, one open at a time). Net-new and Baseline churn are statistical — show the value and a short "(run-rate)" / "(7.1%/mo)" note, not deals.
- No charting library needed; plain cards + list, matching the pipeline-stage tool. Currency via `formatCurrency`.

## Wiring

In `src/app/(dashboard)/page.tsx`:
- Add `getThreeMonthForecast()` to the existing `Promise.all` block.
- Render `<ThreeMonthForecast data={...} />` immediately **after** `<PipelineStageTool … />` (which is currently the last section).

## Out of scope (YAGNI)

- No per-deal `hs_deal_stage_probability` sync / schema migration (deferred follow-up; constants used now).
- Does not modify or replace the existing `RevenueForecastSection` waterfall.
- No configurable horizon, scenario toggles, or confidence intervals — fixed 3-month, single projection.
- No date-range-picker dependence — always "next 3 months from now".

## Testing

- No test framework; verify the pure helpers with a standalone `tsx` assertion script under `scripts/` (run via `node node_modules/.bin/tsx`), matching `scripts/check-*.ts`.
- Cover: `medianCreateToStartLagDays` (odd/even lists); `expectedStartMonth` (start-date present → that month; no start date → createDate+lag month; overdue → clamped to first forecast month; beyond horizon → null); `buildForecast` running balance on a fixture (pipeline deal landing in month 2 persists into month 3; net-new added each month; known churn subtracted in its month; baseline churn = rate × (starting − knownChurn), no double-count; projected math ties out across all three months).
