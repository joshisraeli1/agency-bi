# Revenue Forecaster — Design

**Date:** 2026-06-10
**Status:** Approved (pending build)
**Location:** Section on the Overview page · **Horizon:** next 6 months

## Goal
Project monthly recurring revenue forward, showing revenue **coming in** (newly
signed deals) vs **going out** (deals churning), with a net run-rate line and
click-to-drill into the exact deals for any month.

## Methodology (from HubSpot deal stages + dates)
Classification is by the raw HubSpot stage label, with ex-GST amounts:
- **Currently billing** — `Closed Won` (active, started, not yet churned).
- **Coming in** — `Contract out` **with a Start Date** → revenue begins in the Start-Date month. `Contract out` **without** a Start Date is excluded until one is set (count surfaced).
- **Going out** — `Closed Won` or `Churned but still active` **with a Churn Date** → revenue drops in the Churn-Date month.
- **Edge case** — `Current (Not Paying)` → excluded from the line (billing paused), shown separately as "paused, expected to resume".
- **Date rule** — Start Date = month revenue comes in; Churn Date = month it comes out.

## Data layer
- Add `"1367663138": "Current (Not Paying)"` to `STAGE_LABELS` in `refresh-syncs.ts` (today those deals store a bare numeric `stageLabel`). **Do not change `mapDealStage`'s existing mapped values** — the forecaster reads the raw `stageLabel`, so churn/revenue/reconciliation are untouched. Re-sync afterward.
- ex-GST resolution: `amountExGst` when present; else `amount ÷ gstDivisor` (Contract Out only stores inc-GST `amount`).

## Analytics — `src/lib/analytics/forecast.ts`
`getRevenueForecast(monthsForward = 6): RevenueForecast`
- Relevant deals: `Closed Won`, `Churned but still active`, and `Contract out` **with** a Start Date; exclude excluded clients.
- For each month `M` in the forward window:
  - `netMrr` = Σ ex-GST of deals active during `M` (startMonth ≤ M and (no churn or churnMonth > M)).
  - `incoming` / `incomingDeals` = deals with startMonth === M.
  - `outgoing` / `outgoingDeals` = deals with churnMonth === M.
  - Invariant: `netMrr(M) = netMrr(M-1) + incoming(M) − outgoing(M)`.
- Also returns `pausedRevenue` + `pausedDeals` (Current Not Paying) and `unsignedContractOut` (count of Contract Out without a Start Date).

## UI — `src/components/dashboard/revenue-forecast-section.tsx`
- **Waterfall / revenue bridge** (grouped over the horizon): four bars —
  Current MRR → +Incoming (green) → −Outgoing (red) → Projected MRR (blue).
  Rendered as a stacked `BarChart` with a transparent `base` segment under a
  coloured `value` segment (recharts has no native waterfall).
- Click the Incoming or Outgoing bar → drill panel listing the deals across the
  horizon (name + month + ex-GST amount).
- Caption: net change over the horizon + paused revenue + count of unsigned
  Contract-Out deals.
- Rendered on the Overview page (`getRevenueForecast(6)` added to its `Promise.all`).

## Out of scope
Scenario modelling, editable assumptions, probability-weighting by stage.
