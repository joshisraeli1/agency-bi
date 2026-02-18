import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";

export default async function ClientsPage() {
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
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
