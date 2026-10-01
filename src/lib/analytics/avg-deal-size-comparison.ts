import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";
import { classifyPackageType } from "./active-revenue";
import { foldUpsells } from "./upsells";
import { formatMonth } from "@/lib/utils";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";

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
  /** Every month the picker may offer, newest last. A month is selectable only
   *  when the month 12 before it also has deals, since the card compares a
   *  month against its own year-ago counterpart. */
  selectableMonths: { month: string; label: string }[];
  /** Per-month, per-division stats so the picker recomputes in the browser
   *  rather than round-tripping to the server for a figure already derived. */
  byMonth: Record<string, Record<string, { avg: number; count: number }>>;
}

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
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: DOWNSELL_DEAL_SELECT,
    }),
    getDownsellResolution(),
  ]);

  // Sum ex-GST + count of active, upsell-folded deals per division for a month.
  const statsFor = (month: string) => {
    const active = deals.filter((d) => {
      if (d.clientId && excludedIds.has(d.clientId)) return false;
      if (downsells.heldOutIds.has(d.id)) return false;
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (!startKey) return false;
      return month >= startKey && (!churnKey || month < churnKey);
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

  // Two years of months, so a 12-month-back comparison is available for every
  // month in the most recent year.
  const window: string[] = [];
  {
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      window.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
  }
  const byMonth: Record<string, Record<string, { avg: number; count: number }>> = {};
  for (const m of [...new Set([...window, prevMonth, currMonth])]) {
    const agg = statsFor(m);
    byMonth[m] = Object.fromEntries(
      DIVISIONS.map((d) => {
        const a = agg[d];
        return [d, { avg: a && a.n > 0 ? Math.round(a.sum / a.n) : 0, count: a?.n ?? 0 }];
      })
    );
  }

  const monthsBack = (m: string, n: number) => {
    const [y, mo] = m.split("-").map(Number);
    const d = new Date(y, mo - 1 - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const hasDeals = (m: string) =>
    Object.values(byMonth[m] ?? {}).some((v) => v.count > 0);
  const selectableMonths = window
    .filter((m) => hasDeals(m) && hasDeals(monthsBack(m, 12)))
    .map((m) => ({ month: m, label: formatMonth(m) }));

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
    selectableMonths,
    byMonth,
  };
}
