import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";
import { getLTVData } from "@/lib/analytics/advanced-analytics";
import { getActiveRevenueSnapshot } from "@/lib/analytics/active-revenue";
import { clientDisplayName } from "@/lib/analytics/client-name";

// Classify a client into a division from their deal's content package type
// (matches the deal-based Revenue by Package Type grouping).
function clientDivision(pkg: string | null | undefined): string {
  const p = (pkg || "").toLowerCase().trim();
  if (p === "social media" || p === "social media management") return "Social Media Management";
  if (p === "meta ads" || p === "ads management" || p === "social and ads management") return "Ads Management";
  return "Content Delivery";
}

export default async function ClientsPage() {
  const [ltvData, snapshot] = await Promise.all([getLTVData(), getActiveRevenueSnapshot()]);
  const ltvByClient = new Map(ltvData.clients.map((c) => [c.clientId, c.totalRevenue]));

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
      hubspotDeals: {
        where: { stage: "closed_won" },
        select: { name: true, amountExGst: true, amount: true, contentPackageType: true },
      },
      _count: {
        select: {
          timeEntries: true,
          aliases: true,
        },
      },
    },
  });

  const clients = raw.map(({ hubspotDeals, ...c }) => {
    const dealRetainer = hubspotDeals.reduce((s, d) => s + (d.amountExGst ?? d.amount ?? 0), 0);
    // Division = the content-package of the client's largest closed-won deal.
    const primary = [...hubspotDeals].sort((a, b) => (b.amountExGst ?? 0) - (a.amountExGst ?? 0))[0];
    return {
      ...c,
      // Show a readable name when the HubSpot company name is uninformative.
      name: clientDisplayName(c.name, hubspotDeals.map((d) => d.name)),
      retainerValue: dealRetainer > 0 ? dealRetainer : c.retainerValue,
      ltv: ltvByClient.get(c.id) ?? null,
      division: clientDivision(primary?.contentPackageType),
    };
  });

  return (
    <div className="space-y-6">
      <ClientsActions clients={clients} divisionRevenue={divisionRevenue} />
    </div>
  );
}
