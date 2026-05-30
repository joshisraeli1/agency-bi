import { db } from "@/lib/db";

export interface PackageTypeRow {
  packageType: string;
  count: number;
  revenue: number; // monthly, ex-GST
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
  const deals = await db.hubspotDeal.findMany({
    where: { stage: "closed_won" },
    select: { amount: true, amountExGst: true, contentPackageType: true },
  });

  const byPkg = new Map<string, { count: number; revenue: number }>();
  let totalInc = 0;
  let totalEx = 0;
  for (const d of deals) {
    const inc = d.amount ?? 0;
    const ex = d.amountExGst ?? 0;
    totalInc += inc;
    totalEx += ex;
    const pkg = classifyPackageType(d.contentPackageType);
    const row = byPkg.get(pkg) ?? { count: 0, revenue: 0 };
    row.count++;
    row.revenue += ex;
    byPkg.set(pkg, row);
  }

  const byPackageType = Array.from(byPkg.entries())
    .map(([packageType, r]) => ({ packageType, count: r.count, revenue: Math.round(r.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    dealCount: deals.length,
    monthlyRevenueIncGst: Math.round(totalInc),
    monthlyRevenueExGst: Math.round(totalEx),
    byPackageType,
  };
}
