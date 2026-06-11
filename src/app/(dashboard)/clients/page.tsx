import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";
import { getActiveRevenueSnapshot } from "@/lib/analytics/active-revenue";
import { clientDisplayName } from "@/lib/analytics/client-name";
import { foldUpsells } from "@/lib/analytics/upsells";

// Classify a client into a division from their deal's content package type
// (matches the deal-based Revenue by Package Type grouping).
function clientDivision(pkg: string | null | undefined): string {
  const p = (pkg || "").toLowerCase().trim();
  if (p === "social media" || p === "social media management") return "Social Media Management";
  if (p === "meta ads" || p === "ads management" || p === "social and ads management") return "Ads Management";
  return "Content Delivery";
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export default async function ClientsPage() {
  const snapshot = await getActiveRevenueSnapshot();

  // Divisional revenue is the SAME source of truth as the Overview's "Revenue
  // by Package Type" (deal-based, upsells folded), so the headline ties out.
  const divisionRevenue: Record<string, number> = {
    "Content Delivery": 0,
    "Social Media Management": 0,
    "Ads Management": 0,
  };
  for (const p of snapshot.byPackageType) {
    const label =
      p.packageType === "Social Media Management" ? "Social Media Management"
      : p.packageType === "Ads Management" ? "Ads Management"
      : "Content Delivery";
    divisionRevenue[label] += p.revenue;
  }

  const dealSelect = { name: true, stage: true, amountExGst: true, amount: true, contentPackageType: true, packageDescription: true } as const;
  const raw = await db.client.findMany({
    where: { status: "active", hubspotDealId: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      industry: true,
      website: true,
      retainerValue: true,
      contentRetainer: true,
      smRetainer: true,
      growthRetainer: true,
      productionRetainer: true,
      dealStage: true,
      source: true,
      notes: true,
      startDate: true,
      endDate: true,
      // Closed-won deals are the source of truth for pricing — Client.retainerValue
      // drifts stale, so derive the displayed retainer from the deals.
      hubspotDeals: { where: { stage: "closed_won" }, select: dealSelect },
      _count: { select: { aliases: true } },
    },
  });

  // Some base deals have no client link (clientId = null) — e.g. "Copper Culture
  // Ads Management" while only the upsell is linked. Attach those orphans to the
  // best-matching client by name so the company's full deal size is counted.
  const orphanDeals = await db.hubspotDeal.findMany({
    where: { stage: "closed_won", clientId: null },
    select: dealSelect,
  });
  const clientByNorm = raw
    .map((c) => ({ id: c.id, n: norm(c.name) }))
    .filter((c) => c.n.length >= 3)
    .sort((a, b) => b.n.length - a.n.length); // longest (most specific) first
  const orphansByClient = new Map<string, typeof orphanDeals>();
  for (const o of orphanDeals) {
    const on = norm(o.name);
    const match = clientByNorm.find((c) => on.startsWith(c.n));
    if (match) {
      const arr = orphansByClient.get(match.id) ?? [];
      arr.push(o);
      orphansByClient.set(match.id, arr);
    }
  }

  const now = Date.now();
  const clients = raw.map(({ hubspotDeals, ...c }) => {
    // Company deal size = all the company's closed-won deals (linked + orphaned),
    // with upsells folded onto their base deal.
    const allDeals = [...hubspotDeals, ...(orphansByClient.get(c.id) ?? [])];
    const { deals: folded } = foldUpsells(allDeals);
    const dealRetainer = folded.reduce((s, d) => s + (d.amountExGst ?? d.amount ?? 0), 0);
    const dealSize = dealRetainer > 0 ? dealRetainer : (c.retainerValue ?? 0);
    const primary = [...folded].sort((a, b) => (b.amountExGst ?? b.amount ?? 0) - (a.amountExGst ?? a.amount ?? 0))[0];

    // LTV = deal size × actual months as a client (no projection).
    const startMs = c.startDate ? new Date(c.startDate).getTime() : now;
    const endMs = c.endDate ? new Date(c.endDate).getTime() : now;
    const tenureMonths = Math.max(1, Math.round((endMs - startMs) / MS_PER_MONTH));

    return {
      ...c,
      // Show a readable name when the HubSpot company name is uninformative.
      name: clientDisplayName(c.name, allDeals.map((d) => d.name)),
      retainerValue: dealSize,
      ltv: dealSize > 0 ? dealSize * tenureMonths : null,
      division: clientDivision(primary?.contentPackageType),
    };
  });

  return (
    <div className="space-y-6">
      <ClientsActions clients={clients} divisionRevenue={divisionRevenue} />
    </div>
  );
}
