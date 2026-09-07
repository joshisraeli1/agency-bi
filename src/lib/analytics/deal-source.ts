import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";
import { foldUpsells, isOneOff } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";

export interface DealSourceRow {
  source: string;
  deals: number;
  revenue: number; // ex-GST MRR of deals still live
  avgDealSize: number;
  percentOfRevenue: number;
}

/**
 * Where the live book came from, per HubSpot's "Outreach Source".
 *
 * A handful of deals carry several sources (";"-separated, e.g.
 * "Sales Outreach;Network"); the first is treated as primary rather than
 * counting the deal twice. Upsells are folded onto their base deal so a client
 * won through outreach isn't re-counted as an "Upsell" source later.
 */
export async function getDealSourceBreakdown(): Promise<DealSourceRow[]> {
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { stage: "closed_won" },
      select: { ...DOWNSELL_DEAL_SELECT, outreachSource: true },
    }),
    getDownsellResolution(),
  ]);

  const live = deals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (downsells.heldOutIds.has(d.id)) return false;
    if (isOneOff(d)) return false;
    const { churnKey } = windowKeys(d, downsells);
    return !churnKey; // still live
  });

  const { deals: folded } = foldUpsells(live);
  const sourceById = new Map(deals.map((d) => [d.id, d.outreachSource]));

  const agg = new Map<string, { deals: number; revenue: number }>();
  for (const d of folded) {
    const raw = (sourceById.get(d.id) ?? "").split(";")[0].trim();
    const source = raw || "Unattributed";
    const cur = agg.get(source) ?? { deals: 0, revenue: 0 };
    cur.deals += 1;
    cur.revenue += d.amountExGst ?? 0;
    agg.set(source, cur);
  }

  const total = [...agg.values()].reduce((s, v) => s + v.revenue, 0);

  return [...agg.entries()]
    .map(([source, v]) => ({
      source,
      deals: v.deals,
      revenue: Math.round(v.revenue),
      avgDealSize: v.deals > 0 ? Math.round(v.revenue / v.deals) : 0,
      percentOfRevenue: total > 0 ? Number(((v.revenue / total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
