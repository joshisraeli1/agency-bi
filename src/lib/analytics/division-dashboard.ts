import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import { foldUpsells, isOneOff, resolveDealDivisions } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";

export interface DivisionClient {
  id: string;
  name: string;
  revenue: number; // ex-GST MRR
}

export interface DivisionMonth {
  month: string;
  label: string;
  revenue: number;
  clientCount: number;
  newRevenue: number;
  churnedRevenue: number;
  newClients: DivisionClient[];
  churnedClients: DivisionClient[];
}

export interface DivisionDashboard {
  division: string;
  months: DivisionMonth[];
  currentRevenue: number;
  currentClientCount: number;
  avgDealSize: number;
  clients: DivisionClient[];
}

const monthKeyOf = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

/**
 * Everything a divisional leader sees, scoped to one division.
 *
 * All figures are ex-GST recurring revenue from closed-won HubSpot deals — the
 * same basis as the agency Division Summary, so a leader's numbers reconcile to
 * the ones leadership sees rather than to the Xero P&L (which runs higher
 * because it also carries one-off and ad-hoc work).
 *
 * The `division` argument must come from requireDivision(), never from a query
 * string — this function trusts its caller to have authorised the scope.
 */
export async function getDivisionDashboard(
  division: string,
  months = 12
): Promise<DivisionDashboard> {
  const [excludedIds, allDeals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { ...DOWNSELL_DEAL_SELECT, companyName: true },
    }),
    getDownsellResolution(),
  ]);

  // Resolve divisions across the whole book first, so a deal with an unspecified
  // package type can inherit the division of the client it belongs to.
  const divisionByDeal = resolveDealDivisions(allDeals);

  // Scope once. Everything below works on this division's deals only.
  const deals = allDeals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (downsells.heldOutIds.has(d.id)) return false;
    if (isOneOff(d) || /ad[\s-]?hoc/i.test(d.name)) return false;
    return divisionByDeal.get(d.id) === division;
  });

  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthRows: DivisionMonth[] = keys.map((month) => {
    let revenue = 0;
    let newRevenue = 0;
    let churnedRevenue = 0;
    const liveClients = new Set<string>();
    const newClients: DivisionClient[] = [];
    const churnedClients: DivisionClient[] = [];

    for (const d of deals) {
      const amt = d.amountExGst ?? 0;
      if (amt <= 0) continue;
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (!startKey) continue;

      if (month >= startKey && (!churnKey || month < churnKey)) {
        revenue += amt;
        liveClients.add(d.clientId ?? d.id);
      }
      // A downsell replacement is never new business, and the deal it replaces
      // never churns in full — the pair's net movement is handled below.
      if (monthKeyOf(d.startDate ?? d.closeDate) === month && !downsells.successorIds.has(d.id)) {
        newRevenue += amt;
        newClients.push({ id: d.clientId ?? d.id, name: d.name, revenue: Math.round(amt) });
      }
      if (monthKeyOf(d.churnDate) === month && !downsells.predecessorIds.has(d.id)) {
        churnedRevenue += amt;
        churnedClients.push({ id: d.clientId ?? d.id, name: d.name, revenue: Math.round(amt) });
      }
    }

    // Net movement for downsell pairs handing over this month, so a contraction
    // shows as churn and an upgrade as new revenue — never a negative bar.
    for (const p of downsells.contractionsByMonth.get(month) ?? []) {
      if (p.clientId && excludedIds.has(p.clientId)) continue;
      if (!deals.some((d) => d.id === p.successorId)) continue; // other division
      if (p.contractionExGst > 0) {
        churnedRevenue += p.contractionExGst;
        churnedClients.push({
          id: p.clientId ?? p.successorId,
          name: `${p.predecessorName} (downsell)`,
          revenue: p.contractionExGst,
        });
      } else if (p.contractionExGst < 0) {
        const gain = -p.contractionExGst;
        newRevenue += gain;
        newClients.push({
          id: p.clientId ?? p.successorId,
          name: `${p.predecessorName} (upgrade)`,
          revenue: gain,
        });
      }
    }

    return {
      month,
      label: formatMonth(month),
      revenue: Math.round(revenue),
      clientCount: liveClients.size,
      newRevenue: Math.round(newRevenue),
      churnedRevenue: Math.round(churnedRevenue),
      newClients: newClients.sort((a, b) => b.revenue - a.revenue),
      churnedClients: churnedClients.sort((a, b) => b.revenue - a.revenue),
    };
  });

  // Current live book for this division, upsells folded so an expansion isn't
  // counted as a separate client or deal.
  const currentMonth = keys[keys.length - 1];
  const liveDeals = deals.filter((d) => {
    const { startKey, churnKey } = windowKeys(d, downsells);
    return !!startKey && currentMonth >= startKey && (!churnKey || currentMonth < churnKey);
  });
  const { deals: folded } = foldUpsells(liveDeals);

  const byClient = new Map<string, DivisionClient>();
  for (const d of folded) {
    const key = d.clientId ?? d.id;
    const existing = byClient.get(key);
    const amt = Math.round(d.amountExGst ?? 0);
    if (existing) existing.revenue += amt;
    else byClient.set(key, { id: key, name: d.name, revenue: amt });
  }
  const clients = [...byClient.values()].sort((a, b) => b.revenue - a.revenue);
  const currentRevenue = clients.reduce((s, c) => s + c.revenue, 0);

  return {
    division,
    months: monthRows,
    currentRevenue,
    currentClientCount: clients.length,
    avgDealSize: folded.length > 0 ? Math.round(currentRevenue / folded.length) : 0,
    clients,
  };
}
