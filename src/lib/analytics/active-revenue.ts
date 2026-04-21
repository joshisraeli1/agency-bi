import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";

export interface PackageTypeRow {
  packageType: string;
  count: number;
  revenue: number; // monthly, ex-GST
}

export interface ActiveRevenueSnapshot {
  dealCount: number;
  monthlyRevenueExGst: number; // sum of active retainers — source-of-truth for current month
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
 * Current snapshot of active HubSpot deals — mirrors the "Revenue Summary" + "Revenue by
 * Package Type" tiles in HubSpot (all-time filter, status=active). Treats each active client's
 * retainerValue as the current monthly revenue (ex-GST, as HubSpot stores it).
 */
export async function getActiveRevenueSnapshot(): Promise<ActiveRevenueSnapshot> {
  const [excludedIds, clients] = await Promise.all([
    getExcludedClientIds(),
    db.client.findMany({
      where: {
        status: "active",
        OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }],
      },
      select: {
        id: true,
        retainerValue: true,
        contentPackageType: true,
      },
    }),
  ]);

  const active = clients.filter((c) => !excludedIds.has(c.id));

  const byPkg = new Map<string, { count: number; revenue: number }>();
  let total = 0;
  for (const c of active) {
    const amt = c.retainerValue ?? 0;
    total += amt;
    const pkg = classifyPackageType(c.contentPackageType);
    const row = byPkg.get(pkg) ?? { count: 0, revenue: 0 };
    row.count++;
    row.revenue += amt;
    byPkg.set(pkg, row);
  }

  const byPackageType = Array.from(byPkg.entries())
    .map(([packageType, r]) => ({ packageType, count: r.count, revenue: Math.round(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    dealCount: active.length,
    monthlyRevenueExGst: Math.round(total),
    byPackageType,
  };
}
