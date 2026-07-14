import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";
import { classifyPackageType } from "./active-revenue";
import { foldUpsells } from "./upsells";
import { formatMonth } from "@/lib/utils";

// Package-type buckets in the order shown on the slide.
const DIVISIONS = ["Social Media Management", "Ads Management", "Content Delivery Paid"] as const;

export interface AvgDealSizeRow {
  division: string;
  prevAvg: number; // ex-GST
  currAvg: number; // ex-GST
  prevCount: number;
  currCount: number;
  growthPct: number | null; // null when prev has no deals
}

export interface AvgDealSizeComparison {
  prevMonth: string;
  currMonth: string;
  prevLabel: string;
  currLabel: string;
  rows: AvgDealSizeRow[];
}

const monthKey = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

/**
 * Average deal size (ex-GST) per package type, comparing two point-in-time
 * months (default Jun 2025 vs Jun 2026). "Active in month" = deal started on or
 * before the month and not yet churned. Upsells are folded onto their base deal
 * so they don't count as separate deals; amounts are the ex-GST deal value.
 */
export async function getAvgDealSizeComparison(
  prevMonth = "2025-06",
  currMonth = "2026-06"
): Promise<AvgDealSizeComparison> {
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: {
        clientId: true, name: true, stage: true, contentPackageType: true,
        packageDescription: true, amount: true, amountExGst: true,
        startDate: true, closeDate: true, churnDate: true,
      },
    }),
  ]);

  // Sum ex-GST + count of active, upsell-folded deals per division for a month.
  const statsFor = (month: string) => {
    const active = deals.filter((d) => {
      if (d.clientId && excludedIds.has(d.clientId)) return false;
      const start = monthKey(d.startDate ?? d.closeDate);
      if (!start) return false;
      const churn = monthKey(d.churnDate);
      return month >= start && (!churn || month < churn);
    });
    const { deals: folded } = foldUpsells(active);
    const agg: Record<string, { sum: number; n: number }> = {};
    for (const d of folded) {
      const ex = d.amountExGst ?? 0;
      if (ex <= 0) continue;
      const div = classifyPackageType(d.contentPackageType);
      (agg[div] ??= { sum: 0, n: 0 });
      agg[div].sum += ex;
      agg[div].n += 1;
    }
    return agg;
  };

  const prev = statsFor(prevMonth);
  const curr = statsFor(currMonth);

  const rows: AvgDealSizeRow[] = DIVISIONS.map((division) => {
    const p = prev[division];
    const c = curr[division];
    const prevAvg = p && p.n > 0 ? Math.round(p.sum / p.n) : 0;
    const currAvg = c && c.n > 0 ? Math.round(c.sum / c.n) : 0;
    return {
      division,
      prevAvg,
      currAvg,
      prevCount: p?.n ?? 0,
      currCount: c?.n ?? 0,
      growthPct: prevAvg > 0 ? ((currAvg - prevAvg) / prevAvg) * 100 : null,
    };
  });

  return {
    prevMonth,
    currMonth,
    prevLabel: formatMonth(prevMonth),
    currLabel: formatMonth(currMonth),
    rows,
  };
}
