import { getClientBook } from "@/lib/analytics/client-book";
import { ClientsActions } from "@/components/forms/clients-actions";

export const dynamic = "force-dynamic";

/**
 * The client list is derived from deals, not from Client.status.
 *
 * Client.status and Client.retainerValue are written once and never revised, so
 * the stored view had drifted: companies holding live deals sat marked churned
 * and were missing from the page, while records whose deals had moved elsewhere
 * kept showing a stale retainer. getClientBook() resolves both from the deals
 * themselves, and its division totals tie exactly to the divisional dashboards.
 */
export default async function ClientsPage() {
  const book = await getClientBook();

  const clients = book.clients.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    industry: c.industry,
    website: c.website,
    retainerValue: c.revenue,
    percentOfRevenue: c.percentOfRevenue,
    contentRetainer: null,
    smRetainer: null,
    growthRetainer: null,
    productionRetainer: null,
    dealStage: null,
    source: c.source,
    notes: c.notes,
    startDate: c.startDate,
    endDate: c.endDate,
    ltv: c.ltv,
    division: c.division,
    revenueByDivision: c.revenueByDivision,
    unlinked: c.unlinked,
    _count: { aliases: c.aliasCount },
  }));

  return (
    <div className="space-y-6">
      <ClientsActions
        clients={clients}
        divisionRevenue={book.divisionRevenue}
        totalRevenue={book.totalRevenue}
      />
    </div>
  );
}
