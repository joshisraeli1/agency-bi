import { db } from "@/lib/db";
import { foldUpsells } from "./upsells";

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
 * Maps raw HubSpot contentPackageType values to the three canonical service-line buckets used
 * across the app (matching HubSpot's Revenue by Package Type grouping). One-off / null /
 * unrecognized types all fall into "Content Delivery Paid".
 */
function classifyPackageType(raw: string | null | undefined): string {
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
    select: { name: true, stage: true, amount: true, amountExGst: true, contentPackageType: true, packageDescription: true },
  });
  // Fold upsells onto their base deal — an upsell is extra revenue for an
  // existing company, not a separate deal in the count / package breakdown.
  const { deals } = foldUpsells(rawDeals);

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
