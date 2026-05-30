import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";

export default async function ClientsPage() {
  const raw = await db.client.findMany({
    where: { status: { not: "prospect" }, hubspotDealId: { not: null } },
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
        select: { amountExGst: true, amount: true },
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
    return { ...c, retainerValue: dealRetainer > 0 ? dealRetainer : c.retainerValue };
  });

  return (
    <div className="space-y-6">
      <ClientsActions clients={clients} />
    </div>
  );
}
