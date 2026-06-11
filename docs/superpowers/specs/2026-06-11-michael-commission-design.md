# Michael's Commission — Design

**Date:** 2026-06-11 · **Status:** Approved (building)

## Two commission streams (both from HubSpot data)

**1. Meeting commission** — a "meeting booked" = a deal Michael *created*.
- `meetingsBooked(month)` = count of Michael-owned deals with `createDate` in that month.
- `rate(month)` = **$185**, except **`2026-06` = $175** (July onward = $185).
- `meetingCommission(month) = meetingsBooked × rate`.

**2. Deal commission (recurring, Option A/B)** — for each Michael-owned deal with
`commission_type = "Owned"`:
- `monthly = 0.09 × (amountExGst ?? amount/1.1)` (the deal's monthly ex-GST value).
- Earned **every month for 6 months from the deal's start month** (`startDate`,
  fallback `closeDate`) — i.e. months `[startMonth … startMonth+5]`.

`total(month) = meetingCommission + dealCommission`.

## Data layer
- Add `commissionType String?` to `HubspotDeal`; fetch `"commission_type"` in
  `refresh-syncs.ts`; `prisma db push` + re-sync. (Same pattern as
  `packageDescription`.)
- Owner = Michael (`76570622`), already filtered in `getMichaelSalesData`.

## Calculation
Compute inside `getMichaelSalesData` (it already queries Michael's deals — just
add `commissionType` to the select). Returns `commission`:
```
months: { month, meetingsBooked, meetingCommission, dealCommission, total,
          ownedDeals: { name, monthly }[] }[]
total, currentMonthTotal
```
Month window: **2026-05** → max(current month, latest owned-deal 6-month window end).

## UI — top of Michael's tab
- A **Commission card at the very top** (above the existing tiles): headline =
  this-month commission + running total.
- A **breakdown table**: `Month | Meetings | Meeting $ | Deal 9% $ | Total`,
  from May 2026; click a row → the owned deals contributing that month.

## Out of scope
- "commission_type = Support" deals (only "Owned" pays 9%).
- Changing the 6-month window origin (we use each deal's own start).
