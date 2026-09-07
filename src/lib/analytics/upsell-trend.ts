import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import { isOneOff, isUpsell } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";

export interface UpsellMonth {
  month: string;
  label: string;
  upsellRevenue: number; // ex-GST MRR from live upsell deals
  totalRevenue: number; // ex-GST MRR from all live recurring deals
  upsellPercent: number;
  upsellCount: number;
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

    for (const d of recurring) {
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (!startKey) continue;
      const live = month >= startKey && (!churnKey || month < churnKey);
      if (!live) continue;
      const ex = d.amountExGst ?? 0;
      if (ex <= 0) continue;
      totalRevenue += ex;
      if (isUpsell(d)) {
        upsellRevenue += ex;
        upsellCount++;
      }
    }

    return {
      month,
      label: formatMonth(month),
      upsellRevenue: Math.round(upsellRevenue),
      totalRevenue: Math.round(totalRevenue),
      upsellPercent: totalRevenue > 0 ? Number(((upsellRevenue / totalRevenue) * 100).toFixed(1)) : 0,
      upsellCount,
    };
  });
}
