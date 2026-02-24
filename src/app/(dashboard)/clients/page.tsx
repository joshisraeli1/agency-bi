import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";

export default async function ClientsPage() {
  const clients = await db.client.findMany({
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
          deliverables: true,
          aliases: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <ClientsActions clients={clients} />
    </div>
  );
}
