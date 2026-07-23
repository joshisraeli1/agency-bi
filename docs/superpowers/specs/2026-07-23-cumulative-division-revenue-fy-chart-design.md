# Cumulative Revenue by Division (Financial Year) — Design

**Date:** 2026-07-23
**Location:** Analytics page (`src/app/(dashboard)/analytics/page.tsx`), directly below the existing "Revenue by Division vs Goal" (`DivisionGoals`) card.

## Purpose

A chart tracking **cumulative recognized revenue, per division, across the current financial year to date**. By month N of the FY, each division's value is the total revenue it has earned since the FY started. It answers "how is each division tracking, cumulatively, this financial year?"

## Financial year

Australian FY = **1 July → 30 June**. The chart covers the **current** FY: it starts at **July 2026** and extends month-by-month through the current month (today: 2026-07-23, so it currently shows July only and fills out as the year progresses, up to June 2027). The FY start is computed dynamically (if today's month ≥ July, FY starts July of the current calendar year; otherwise July of the previous year) — it is not hardcoded to 2026.

## Revenue basis

**Recognized monthly MRR, ex-GST**, identical to the existing `divisionRevenueTrend` in `src/lib/analytics/revenue-overview.ts`:
- A deal contributes its `amountExGst` to a month if that month is `>= startMonth` (from `startDate ?? closeDate`) and before its `churnDate` (if any).
- Division is derived from `contentPackageType`: `"social media"`/`"social media management"` → Social Media Management; `"meta ads"`/`"ads management"` → Ads Management; `"social and ads management"` → split **50/50** between Social Media Management and Ads Management; everything else → Content Delivery.
- Excluded clients (`getExcludedClientIds()`) are skipped.
- Three divisions: **Content Delivery, Social Media Management, Ads Management**.

Cumulative = running sum of each division's monthly recognized MRR from the FY start month through each subsequent month.

## Data layer

New analytics function in `src/lib/analytics/revenue-overview.ts` (colocated with the division logic it reuses), or a small new `src/lib/analytics/division-fy.ts` — decided in the plan:

- **Function:** `getCumulativeDivisionRevenueFY()` → returns an ordered array, one entry per FY month from the FY start through the current month:
  ```ts
  interface CumulativeDivisionMonth {
    month: string;      // display label, e.g. "Jul 2026" (via formatMonth)
    rawMonth: string;   // "2026-07"
    "Content Delivery": number;         // cumulative ex-GST, rounded
    "Social Media Management": number;
    "Ads Management": number;
  }
  ```
- Implementation: compute the per-month divisional recognized MRR using the **same rules as `divisionRevenueTrend`** (extract that per-month bucketing into a shared helper to avoid duplicating the classification logic — DRY), over the FY month range, then accumulate.

## Chart component

New client component `src/components/dashboard/cumulative-division-revenue-chart.tsx` (Recharts, matching existing dashboard charts):

- **Grouped (clustered) bar chart**: x-axis = FY months, **three bars per month**, one per division.
- Bars within a month sit **tight together / touching** — Recharts `barGap={0}` (no gap between the division bars in a group), with a normal `barCategoryGap` (e.g. `"20%"`) between months. **Not stacked.**
- Y-axis = cumulative ex-GST revenue (`formatCurrency`, abbreviated `$K` on axis ticks like the other charts).
- Tooltip shows each division's cumulative value plus the month total.
- Legend identifies the three divisions.
- **Colors:** the implementer MUST invoke the `dataviz` skill to pick an accessible, theme-consistent 3-series palette; anchor Content Delivery to the app's brand orange (`#ea580c`) and choose two further distinct hues. Wrapped in a `Card` titled **"Cumulative Revenue by Division — FY26/27"** (label derived from the FY, not hardcoded).

## Wiring

In `src/app/(dashboard)/analytics/page.tsx`:
- Call `getCumulativeDivisionRevenueFY()` (in the page's existing data-fetch block).
- Render `<CumulativeDivisionRevenueChart data={...} />` immediately after the `<DivisionGoals … />` card.

## Out of scope (YAGNI)

- No division goal/target overlay (that's the existing DivisionGoals card).
- No prior-FY comparison line, no date-range picker — always the current FY to date.
- No per-deal drill-down (this is a trend chart, not the pipeline-stage tool).

## Testing

- No test framework in the repo; verify the cumulative logic with a standalone `tsx` assertion script under `scripts/` (matching `scripts/check-*.ts`).
- The pure cumulation helper (given a list of per-month divisional totals) must: produce a monotonically non-decreasing running total per division; start the running total at the FY start month; and correctly carry forward across months with zero new revenue. Assert with a small fixture of 3 months × 3 divisions.
- FY-start computation asserted for a July date (FY starts same calendar year) and a pre-July date (FY starts previous year).
