import { db } from "@/lib/db";
import { foldUpsells } from "./upsells";
import { getExcludedClientIds } from "./excluded-clients";

export const DIVISION_GOALS_PROVIDER = "division_goals";

// Monthly revenue goals per package/division (editable in-app)
export const DEFAULT_DIVISION_GOALS: Record<string, number> = {
  "Content Delivery Paid": 400_000,
  "Social Media Management": 100_000,
  "Ads Management": 100_000,
};

export async function getDivisionGoals(): Promise<Record<string, number>> {
  const row = await db.integrationConfig.findUnique({ where: { provider: DIVISION_GOALS_PROVIDER } });
  const goals = { ...DEFAULT_DIVISION_GOALS };
  if (row?.configJson && row.configJson !== "{}") {
    try {
      const g = JSON.parse(row.configJson) as Record<string, unknown>;
      for (const k of Object.keys(goals)) {
        if (typeof g[k] === "number" && (g[k] as number) > 0) goals[k] = g[k] as number;
      }
    } catch {
      // defaults
    }
  }
  return goals;
}

export interface PackageDeal {
  name: string;
  revenue: number; // monthly ex-GST
}

export interface PackageTypeRow {
  packageType: string;
  count: number;
  revenue: number; // monthly, ex-GST
  deals: PackageDeal[]; // deals under this package type (for drill-down)
}

export interface ActiveRevenueSnapshot {
  dealCount: number;
  monthlyRevenueIncGst: number; // sum of closed-won deal Amount (inc-GST) — matches HubSpot
  monthlyRevenueExGst: number; // sum of closed-won deal ex-GST property
  byPackageType: PackageTypeRow[];
}

/**
 * Revenue (ex-GST) by package type for deals ACTIVE in a given month, using the
 * historically-correct deal set — closed-won OR since-churned — so past months
 * aren't understated by survivorship (a client active last July that has since
 * churned still counts for last July). Excludes excluded clients and folds
 * upsells. Powers the "compare to last year" toggle.
 */
export async function getPackageRevenueByMonth(
  monthKey: string
): Promise<{ packageType: string; revenue: number; count: number }[]> {
  const [excludedIds, rawDeals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { clientId: true, name: true, stage: true, amount: true, amountExGst: true, contentPackageType: true, packageDescription: true, startDate: true, closeDate: true, churnDate: true },
    }),
  ]);
  const monthOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
  const active = rawDeals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    const start = monthOf(d.startDate ?? d.closeDate);
    if (!start) return false;
    const churn = monthOf(d.churnDate);
    return monthKey >= start && (!churn || monthKey < churn);
  });
  const { deals } = foldUpsells(active);
  const byPkg = new Map<string, { revenue: number; count: number }>();
  for (const d of deals) {
    const pkg = classifyPackageType(d.contentPackageType);
    const r = byPkg.get(pkg) ?? { revenue: 0, count: 0 };
    r.revenue += d.amountExGst ?? 0;
    r.count += 1;
    byPkg.set(pkg, r);
  }
  return Array.from(byPkg.entries())
    .map(([packageType, r]) => ({ packageType, revenue: Math.round(r.revenue), count: r.count }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Maps raw HubSpot contentPackageType values to the three canonical service-line buckets used
 * across the app (matching HubSpot's Revenue by Package Type grouping). One-off / null /
 * unrecognized types all fall into "Content Delivery Paid".
 */
export function classifyPackageType(raw: string | null | undefined): string {
  const p = (raw || "").toLowerCase().trim();
  if (p === "social media" || p === "social media management") return "Social Media Management";
  if (p === "meta ads" || p === "ads management") return "Ads Management";
  if (p === "social and ads management") return "Ads Management"; // lean to Ads for the bar; split shown elsewhere
  return "Content Delivery Paid";
}

/**
 * Current snapshot of closed-won HubSpot deals — mirrors HubSpot's "Revenue Summary" +
 * "Revenue by Package Type". Source of truth is the deal-level amounts (matching HubSpot
 * exactly), NOT a flat GST multiplier:
 *   - inc-GST = sum of each deal's Amount property (`amount`)
 *   - ex-GST  = sum of each deal's ex-GST property (`amountExGst`)
 * Counts every closed-won deal in the pipeline (HubSpot's closed-won total).
 */
export async function getActiveRevenueSnapshot(): Promise<ActiveRevenueSnapshot> {
  const rawDeals = await db.hubspotDeal.findMany({
    where: { stage: "closed_won" },
    select: { name: true, stage: true, amount: true, amountExGst: true, contentPackageType: true, packageDescription: true, startDate: true, closeDate: true, churnDate: true },
  });
  // Keep only deals active in the current month — started on/before now and not
  // yet churned — so the revenue tiles match the Monthly Revenue chart's
  // current-month bar. Some deals keep stage=closed_won even after a churnDate
  // is set; counting those overstated current MRR.
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
  const activeDeals = rawDeals.filter((d) => {
    const start = monthOf(d.startDate ?? d.closeDate);
    if (!start) return false;
    const churn = monthOf(d.churnDate);
    return curKey >= start && (!churn || curKey < churn);
  });
  // Fold upsells onto their base deal — an upsell is extra revenue for an
  // existing company, not a separate deal in the count / package breakdown.
  const { deals } = foldUpsells(activeDeals);

  const byPkg = new Map<string, { count: number; revenue: number; deals: PackageDeal[] }>();
  let totalInc = 0;
  let totalEx = 0;
  for (const d of deals) {
    const inc = d.amount ?? 0;
    const ex = d.amountExGst ?? 0;
    totalInc += inc;
    totalEx += ex;
    const pkg = classifyPackageType(d.contentPackageType);
    const row = byPkg.get(pkg) ?? { count: 0, revenue: 0, deals: [] };
    row.count++;
    row.revenue += ex;
    row.deals.push({ name: d.name, revenue: Math.round(ex) });
    byPkg.set(pkg, row);
  }

  const byPackageType = Array.from(byPkg.entries())
    .map(([packageType, r]) => ({
      packageType,
      count: r.count,
      revenue: Math.round(r.revenue),
      deals: r.deals.sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    dealCount: deals.length,
    monthlyRevenueIncGst: Math.round(totalInc),
    monthlyRevenueExGst: Math.round(totalEx),
    byPackageType,
  };
}
