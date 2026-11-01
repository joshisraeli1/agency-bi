import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import { isOneOff } from "./upsells";
import { DOWNSELL_DEAL_SELECT } from "./downsells";

export interface OneOffDeal {
  id: string;
  name: string;
  revenue: number;
  division: string;
}

export interface OneOffMonth {
  month: string;
  label: string;
  /** Packages sold that month. */
  count: number;
  revenue: number;
  deals: OneOffDeal[];
}

export interface OneOffSales {
  months: OneOffMonth[];
  totalRevenue: number;
  totalCount: number;
  /** Mean value of a one-off package across the window. */
  avgValue: number;
}

/**
 * One-off packages sold each month — shoots, statics, websites, campaign work.
 *
 * These are excluded from every recurring surface in the tool, which is right:
 * a photoshoot is not MRR and treating it as such makes a busy project month
 * look like a wave of wins followed by a wave of churn. But excluding them
 * everywhere left real revenue invisible — $241,058 of it — so this is the one
 * place it is counted on its own terms.
 *
 * Dated by when the work was SOLD (start date, falling back to close), not by
 * when it was delivered or when it ended. A one-off has no term to run.
 */
export async function getOneOffSales(months = 12): Promise<OneOffSales> {
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { ...DOWNSELL_DEAL_SELECT, companyName: true, contentPackageType: true },
    }),
  ]);

  const sold = deals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (!isOneOff(d)) return false;
    return (d.amountExGst ?? 0) > 0;
  });

  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const byMonth = new Map<string, OneOffDeal[]>();
  for (const d of sold) {
    const soldAt = d.startDate ?? d.closeDate;
    if (!soldAt) continue;
    const key = `${soldAt.getFullYear()}-${String(soldAt.getMonth() + 1).padStart(2, "0")}`;
    if (!keys.includes(key)) continue;
    const list = byMonth.get(key) ?? [];
    list.push({
      id: d.id,
      name: d.name.trim(),
      revenue: Math.round(d.amountExGst ?? 0),
      // The package type as sold, which is as much division as a one-off has:
      // it never ran long enough to belong to a division's recurring book.
      division: d.contentPackageType ?? "—",
    });
    byMonth.set(key, list);
  }

  const monthRows: OneOffMonth[] = keys.map((month) => {
    const list = (byMonth.get(month) ?? []).sort((a, b) => b.revenue - a.revenue);
    return {
      month,
      label: formatMonth(month),
      count: list.length,
      revenue: list.reduce((s, d) => s + d.revenue, 0),
      deals: list,
    };
  });

  const totalRevenue = monthRows.reduce((s, m) => s + m.revenue, 0);
  const totalCount = monthRows.reduce((s, m) => s + m.count, 0);

  return {
    months: monthRows,
    totalRevenue,
    totalCount,
    avgValue: totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0,
  };
}
