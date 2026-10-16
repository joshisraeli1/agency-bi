import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import { isOneOff, isUpsell } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";

export interface UpsellDeal {
  id: string;
  name: string;
  revenue: number;
}

export interface UpsellMonth {
  month: string;
  label: string;
  upsellRevenue: number; // ex-GST MRR from live upsell deals
  totalRevenue: number; // ex-GST MRR from all live recurring deals
  upsellPercent: number;
  upsellCount: number;
  /** The deals behind the bar, so a month can be opened rather than guessed at. */
  upsells: UpsellDeal[];
  /**
   * Upsells WON in this month, and upsells that ended in it.
   *
   * The figures above are a stock — every upsell live that month — so they only
   * ever climb and say nothing about whether the team sold anything recently.
   * These two are the flow, and they answer a different question: what did we
   * win, and what did we lose.
   */
  newUpsellRevenue: number;
  newUpsells: UpsellDeal[];
  churnedUpsellRevenue: number;
  churnedUpsells: UpsellDeal[];
}

/**
 * Monthly upsell revenue and what share of the recurring book it represents.
 *
 * Upsells are NOT folded onto their base deal here — the whole point is to see
 * them separately. One-off and ad-hoc work is excluded from both sides so the
 * ratio is expansion against the recurring book, not against project spikes.
 */
export async function getUpsellTrend(months = 12): Promise<UpsellMonth[]> {
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: DOWNSELL_DEAL_SELECT,
    }),
    getDownsellResolution(),
  ]);

  const recurring = deals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (downsells.heldOutIds.has(d.id)) return false;
    return !isOneOff(d) && !/ad[\s-]?hoc/i.test(d.name);
  });

  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return keys.map((month) => {
    let upsellRevenue = 0;
    let totalRevenue = 0;
    let upsellCount = 0;
    const upsells: UpsellDeal[] = [];
    let newUpsellRevenue = 0;
    let churnedUpsellRevenue = 0;
    const newUpsells: UpsellDeal[] = [];
    const churnedUpsells: UpsellDeal[] = [];

    for (const d of recurring) {
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (!startKey) continue;
      const ex = d.amountExGst ?? 0;
      if (ex <= 0) continue;
      const upsell = isUpsell(d);
      const entry = { id: d.id, name: d.name.trim(), revenue: Math.round(ex) };

      // Won and lost are independent of whether the deal is live NOW, so they
      // are counted before the live check rather than inside it.
      if (upsell && startKey === month) {
        newUpsellRevenue += ex;
        newUpsells.push(entry);
      }
      if (upsell && churnKey === month) {
        churnedUpsellRevenue += ex;
        churnedUpsells.push(entry);
      }

      const live = month >= startKey && (!churnKey || month < churnKey);
      if (!live) continue;
      totalRevenue += ex;
      if (upsell) {
        upsellRevenue += ex;
        upsellCount++;
        upsells.push(entry);
      }
    }

    return {
      month,
      label: formatMonth(month),
      upsellRevenue: Math.round(upsellRevenue),
      totalRevenue: Math.round(totalRevenue),
      upsellPercent: totalRevenue > 0 ? Number(((upsellRevenue / totalRevenue) * 100).toFixed(1)) : 0,
      upsellCount,
      upsells: upsells.sort((a, b) => b.revenue - a.revenue),
      newUpsellRevenue: Math.round(newUpsellRevenue),
      newUpsells: newUpsells.sort((a, b) => b.revenue - a.revenue),
      churnedUpsellRevenue: Math.round(churnedUpsellRevenue),
      churnedUpsells: churnedUpsells.sort((a, b) => b.revenue - a.revenue),
    };
  });
}
