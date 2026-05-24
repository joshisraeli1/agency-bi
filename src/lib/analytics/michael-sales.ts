import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";

export const MICHAEL_OWNER_ID = "76570622";
export const MICHAEL_NAME = "Michael Shenfield";

export interface MonthlyValue {
  month: string; // YYYY-MM
  value: number;
}

export interface MichaelSalesData {
  ownerName: string;
  // Headline tiles
  currentMrr: number;
  lifetimeRevenue: number;
  activeDealCount: number;
  dealsCreatedLast12mo: number;
  // Trend series (24 months)
  monthlyRevenue: MonthlyValue[];
  newRevenuePerMonth: MonthlyValue[];
  dealsCreatedPerMonth: MonthlyValue[];
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
      stage: true,
      amountExGst: true,
      amount: true,
      startDate: true,
      createDate: true,
      closeDate: true,
      churnDate: true,
    },
  });

  const dealIds = deals.map((d) => d.id);

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
  // Monthly revenue trend (FinancialRecord, restricted to Michael's dealIds)
  // -----------------------------------------------------------------------
  const monthlyRevenue = emptySeries(months24);
  let lifetimeRevenue = 0;
  let currentMrr = 0;

  if (dealIds.length > 0) {
    const records = await db.financialRecord.findMany({
      where: {
        source: "hubspot",
        type: "retainer",
        externalId: { in: dealIds },
      },
      select: { month: true, amount: true },
    });

    for (const r of records) {
      lifetimeRevenue += r.amount;
      if (r.month === currentMonth) currentMrr += r.amount;
      applyToSeries(monthlyRevenue, r.month, r.amount);
    }
  }

  return {
    ownerName: MICHAEL_NAME,
    currentMrr,
    lifetimeRevenue,
    activeDealCount,
    dealsCreatedLast12mo,
    monthlyRevenue,
    newRevenuePerMonth,
    dealsCreatedPerMonth,
  };
}
