import { db } from "@/lib/db";
import { ClientsActions } from "@/components/forms/clients-actions";

export default async function ClientsPage() {
  const [clients, financialCategories] = await Promise.all([
    db.client.findMany({
      where: { status: { not: "prospect" } },
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
    }),
    // Fetch HubSpot deal categories per client for the category column
    db.financialRecord.findMany({
      where: { source: "hubspot", type: { in: ["retainer", "project"] } },
      select: { clientId: true, category: true },
      distinct: ["clientId", "category"],
    }),
  ]);

  // Build category lookup: clientId → set of deal names
  const categoryMap = new Map<string, Set<string>>();
  for (const f of financialCategories) {
    if (!f.category) continue;
    const dealName = f.category.replace(/^hubspot:/, "");
    if (!categoryMap.has(f.clientId)) categoryMap.set(f.clientId, new Set());
    categoryMap.get(f.clientId)!.add(dealName);
  }

  // Enrich clients with HubSpot categories
  const enrichedClients = clients.map((c) => ({
    ...c,
    hubspotCategory: categoryMap.has(c.id)
      ? Array.from(categoryMap.get(c.id)!).join(", ")
      : null,
  }));

  return (
    <div className="space-y-6">
      <ClientsActions clients={enrichedClients} />
    </div>
  );
}
