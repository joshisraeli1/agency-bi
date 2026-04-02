import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";

export default async function ClientsPage() {
  const [rawClients, settings] = await Promise.all([
    db.client.findMany({
      where: { status: { not: "prospect" }, hubspotDealId: { not: null } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        industry: true,
        website: true,
        retainerValue: true,
        dealStage: true,
        source: true,
        notes: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            timeEntries: true,
            aliases: true,
          },
        },
      },
    }),
    db.appSettings.findFirst(),
  ]);

  // retainerValue from HubSpot is GST-inclusive; convert to ex-GST for display
  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;
  const clients = rawClients.map((c) => ({
    ...c,
    retainerValue: c.retainerValue ? Math.round(c.retainerValue / gstDivisor) : c.retainerValue,
  }));

  return (
    <div className="space-y-6">
      <ClientsActions clients={clients} />
    </div>
  );
}
