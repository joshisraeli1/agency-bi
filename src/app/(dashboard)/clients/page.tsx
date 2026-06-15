import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";
import { getActiveRevenueSnapshot } from "@/lib/analytics/active-revenue";
import { clientDisplayName } from "@/lib/analytics/client-name";
import { foldUpsells, isOneOff } from "@/lib/analytics/upsells";

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

  const dealSelect = { name: true, stage: true, amountExGst: true, amount: true, contentPackageType: true, packageDescription: true, startDate: true, closeDate: true, churnDate: true } as const;
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
      hubspotDeals: { where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] }, select: dealSelect },
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
  const currentMonth = new Date(now).toISOString().slice(0, 7);
  const dealChurnMonth = (d: { churnDate: Date | null }) =>
    d.churnDate ? new Date(d.churnDate).toISOString().slice(0, 7) : null;
  // A deal is still live if it's closed-won and hasn't churned (or churns in a
  // future month). Once a deal's churn month is reached it's churned revenue.
  const isLiveDeal = (d: { stage: string | null; churnDate: Date | null }) => {
    const cm = dealChurnMonth(d);
    return d.stage === "closed_won" && (!cm || cm > currentMonth);
  };

  const clients = raw.map(({ hubspotDeals, ...c }) => {
    // All of the company's deals (linked + orphaned), live and churned.
    // One-off deals (non-recurring) are excluded from deal size + LTV.
    const allDeals = [...hubspotDeals, ...(orphansByClient.get(c.id) ?? [])].filter((d) => !isOneOff(d));
    const liveDeals = allDeals.filter(isLiveDeal);

    // Company deal size = the company's LIVE closed-won deals, upsells folded
    // onto their base deal. Churned deals don't count toward current retainer.
    const { deals: folded } = foldUpsells(liveDeals);
    const dealRetainer = folded.reduce((s, d) => s + (d.amountExGst ?? d.amount ?? 0), 0);
    const dealSize = dealRetainer > 0 ? dealRetainer : (c.retainerValue ?? 0);
    const primary = [...folded].sort((a, b) => (b.amountExGst ?? b.amount ?? 0) - (a.amountExGst ?? a.amount ?? 0))[0];

    // LTV = each deal's monthly value × months it was actually live (from THAT
    // deal's start to its churn date, or to now if still live), so a recent
    // upsell only counts from its start and a churned deal stops at churn.
    const ltvVal = allDeals.reduce((sum, d) => {
      const monthly = d.amountExGst ?? (d.amount != null ? d.amount / 1.1 : 0);
      if (monthly <= 0) return sum;
      const ds = d.startDate ?? d.closeDate ?? c.startDate;
      const startMs = ds ? new Date(ds).getTime() : now;
      const endMs = d.churnDate
        ? new Date(d.churnDate).getTime()
        : c.endDate ? new Date(c.endDate).getTime() : now;
      const months = Math.max(1, Math.round((endMs - startMs) / MS_PER_MONTH));
      return sum + monthly * months;
    }, 0);

    // A client with deals but no live deal has churned — drop it from the
    // active clients list (it shows in the Churn Rate chart instead).
    const churned = allDeals.length > 0 && liveDeals.length === 0;

    return {
      ...c,
      // Show a readable name when the HubSpot company name is uninformative.
      name: clientDisplayName(c.name, allDeals.map((d) => d.name)),
      retainerValue: dealSize,
      ltv: ltvVal > 0 ? Math.round(ltvVal) : null,
      division: clientDivision(primary?.contentPackageType),
      _churned: churned,
    };
  }).filter((c) => !c._churned);

  // Collapse duplicate client records that resolve to the same display name
  // (e.g. a "Gem" record and a "Blue Light Card" record for the same company),
  // keeping the higher-LTV one. Division totals are unaffected (they come from
  // the deal-based snapshot, not these rows).
  const byDisplayName = new Map<string, (typeof clients)[number]>();
  for (const c of clients) {
    const key = norm(c.name);
    const existing = byDisplayName.get(key);
    if (!existing || (c.ltv ?? 0) > (existing.ltv ?? 0)) byDisplayName.set(key, c);
  }
  const deduped = [...byDisplayName.values()];

  return (
    <div className="space-y-6">
      <ClientsActions clients={deduped} divisionRevenue={divisionRevenue} />
    </div>
  );
}
