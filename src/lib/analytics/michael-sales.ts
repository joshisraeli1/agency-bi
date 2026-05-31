import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";

export const MICHAEL_OWNER_ID = "76570622";
export const MICHAEL_NAME = "Michael Shenfield";

// Monthly goals
export const MICHAEL_MRR_GOAL = 100_000;
export const MICHAEL_DEALS_GOAL = 5;

export interface MonthlyValue {
  month: string; // YYYY-MM
  value: number;
}

export interface DealRef {
  name: string;
  amount: number;
}

export interface MichaelSalesData {
  ownerName: string;
  mrrGoal: number;
  dealsGoal: number;
  // Headline tiles
  currentMrr: number;
  lifetimeRevenue: number;
  activeDealCount: number;
  dealsCreatedLast12mo: number;
  // Trend series (24 months)
  monthlyRevenue: MonthlyValue[];
  newRevenuePerMonth: MonthlyValue[];
  dealsCreatedPerMonth: MonthlyValue[];
  // Per-month deal detail for drill-down (keyed by YYYY-MM)
  mrrDealsByMonth: Record<string, DealRef[]>;
  createdDealsByMonth: Record<string, DealRef[]>;
}

function emptySeries(months: string[]): MonthlyValue[] {
  return months.map((m) => ({ month: m, value: 0 }));
}

function applyToSeries(series: MonthlyValue[], month: string, delta: number): void {
  const idx = series.findIndex((s) => s.month === month);
  if (idx >= 0) series[idx].value += delta;
}

function toMonthKey(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getMichaelSalesData(): Promise<MichaelSalesData> {
  const months24 = getMonthRange(24);
  const currentMonth = months24[months24.length - 1];
  const twelveMonthsAgoKey = months24[months24.length - 12];

  // -----------------------------------------------------------------------
  // Deal-level data (HubspotDeal)
  // -----------------------------------------------------------------------
  const deals = await db.hubspotDeal.findMany({
    where: { ownerId: MICHAEL_OWNER_ID },
    select: {
      id: true,
      name: true,
      stage: true,
      amountExGst: true,
      amount: true,
      startDate: true,
      createDate: true,
      closeDate: true,
      churnDate: true,
    },
  });

  // Per-month deal detail for drill-down
  const mrrDealsByMonth: Record<string, DealRef[]> = {};
  const createdDealsByMonth: Record<string, DealRef[]> = {};

  // Active deals = stage closed_won and not yet churned (or no churn date)
  const now = new Date();
  const activeDealCount = deals.filter(
    (d) => d.stage === "closed_won" && (!d.churnDate || d.churnDate > now),
  ).length;

  // Deals created per month + total in last 12mo
  const dealsCreatedPerMonth = emptySeries(months24);
  let dealsCreatedLast12mo = 0;
  for (const d of deals) {
    const key = toMonthKey(d.createDate);
    if (!key) continue;
    applyToSeries(dealsCreatedPerMonth, key, 1);
    if (key >= twelveMonthsAgoKey) dealsCreatedLast12mo += 1;
    (createdDealsByMonth[key] ??= []).push({ name: d.name, amount: d.amountExGst ?? d.amount ?? 0 });
  }

  // New revenue per month = closed-won deals' ex-GST amount, bucketed by startDate
  // (fallback: closeDate). Counts the deal value once in the month it began.
  const newRevenuePerMonth = emptySeries(months24);
  for (const d of deals) {
    if (d.stage !== "closed_won") continue;
    const amt = d.amountExGst ?? d.amount ?? 0;
    if (!amt) continue;
    const startKey = toMonthKey(d.startDate ?? d.closeDate);
    if (!startKey) continue;
    applyToSeries(newRevenuePerMonth, startKey, amt);
  }

  // -----------------------------------------------------------------------
  // Monthly recurring revenue from deal active windows (closed_won / churned),
  // ex-GST. Avoids the stale/partial FinancialRecord store that made the
  // current month collapse.
  // -----------------------------------------------------------------------
  const monthlyRevenue = emptySeries(months24);
  let lifetimeRevenue = 0;
  let currentMrr = 0;

  const monthIndex = (key: string): number => {
    const [y, m] = key.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const currentIdx = monthIndex(currentMonth);

  for (const d of deals) {
    if (d.stage !== "closed_won" && !d.churnDate) continue;
    const startKey = toMonthKey(d.startDate ?? d.closeDate);
    if (!startKey) continue;
    const churnKey = toMonthKey(d.churnDate);
    const amt = d.amountExGst ?? d.amount ?? 0;
    if (!amt) continue;

    // Monthly series within the visible 24-month window
    for (const m of months24) {
      if (m >= startKey && (!churnKey || m < churnKey)) {
        applyToSeries(monthlyRevenue, m, amt);
        (mrrDealsByMonth[m] ??= []).push({ name: d.name, amount: amt });
        if (m === currentMonth) currentMrr += amt;
      }
    }

    // Lifetime = amount × number of active months (start → churn, else → now)
    const endIdx = churnKey ? monthIndex(churnKey) - 1 : currentIdx;
    const activeMonths = Math.max(0, endIdx - monthIndex(startKey) + 1);
    lifetimeRevenue += amt * activeMonths;
  }

  return {
    ownerName: MICHAEL_NAME,
    mrrGoal: MICHAEL_MRR_GOAL,
    dealsGoal: MICHAEL_DEALS_GOAL,
    currentMrr,
    lifetimeRevenue,
    activeDealCount,
    dealsCreatedLast12mo,
    monthlyRevenue,
    newRevenuePerMonth,
    dealsCreatedPerMonth,
    mrrDealsByMonth,
    createdDealsByMonth,
  };
}
