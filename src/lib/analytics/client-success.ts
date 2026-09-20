import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import { foldUpsells, isOneOff, isUpsell, normalize, resolveDealDivisions } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";
import type { DivisionView } from "@/lib/divisions";
import { divisionDisplayName } from "@/lib/divisions";

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
const MONTHS = 12;

export interface PortfolioClient {
  id: string;
  name: string;
  revenue: number; // ex-GST MRR, upsells folded
  ltv: number | null;
  startDate: Date | null;
}

export interface PortfolioMovement {
  id: string;
  name: string;
  revenue: number;
}

export interface PortfolioMonth {
  month: string;
  label: string;
  /** Portfolio MRR, ex-GST. */
  revenue: number;
  /** The whole division's MRR that month, for context and for the share. */
  divisionRevenue: number;
  /** Portfolio as a percentage of the division. */
  sharePct: number;
  /** Companies carried into the month — the retention denominator. */
  clientsAtStart: number;
  clientsRetained: number;
  /** null in the first month, where there is nothing to have retained from. */
  retentionPct: number | null;
  /** Upsell revenue won this month. NOT new business — see the module note. */
  upsellRevenue: number;
  upsells: PortfolioMovement[];
  /** Revenue lost to companies that left entirely this month. */
  churnedRevenue: number;
  churnedClients: PortfolioMovement[];
}

export interface ClientSuccessDashboard {
  label: string;
  baseLabel: string;
  currentRevenue: number;
  currentClientCount: number;
  /** The whole division, so the portfolio can be read as a share of it. */
  divisionRevenue: number;
  sharePct: number;
  /** Mean lifetime value across the live portfolio. */
  avgLtv: number;
  /** Mean months live across the portfolio. */
  avgTenureMonths: number;
  /** Retention across the last 12 months: companies kept ÷ companies carried. */
  retentionPct: number | null;
  months: PortfolioMonth[];
  clients: PortfolioClient[];
}

/**
 * A company, not a contract. Retention is a statement about whether a client
 * stayed, so a company holding three deals that drops one has NOT churned — it
 * contracted. Keying on the deal would score that as a lost client and
 * understate retention badly.
 *
 * Mirrors the grouping in client-book.ts: clientId where there is one, the
 * normalised HubSpot company name otherwise (plenty of companies have no Client
 * record at all).
 */
const companyKeyOf = (d: { clientId?: string | null; companyName?: string | null; id: string }): string =>
  d.clientId ?? (d.companyName ? `name:${normalize(d.companyName)}` : d.id);

/**
 * The client-servicing dashboard: one manager's book, and how much of it they
 * keep.
 *
 * Deliberately NOT the divisional dashboard with a filter. A division lead is
 * measured on growth, so their page leads with new business. A client-servicing
 * lead is measured on retention, and new business is not their work — so this
 * reports UPSELLS against churn rather than new revenue against churn, and
 * leads with the share of the division they are trusted with.
 *
 * Churn here means a company leaving. A single deal ending while the company
 * keeps others is a contraction, and downsell pairs are already resolved by
 * downsells.ts before anything below runs.
 */
export async function getClientSuccessDashboard(
  view: DivisionView,
  months = MONTHS
): Promise<ClientSuccessDashboard> {
  const [excludedIds, allDeals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { ...DOWNSELL_DEAL_SELECT, companyName: true, clientManager: true },
    }),
    getDownsellResolution(),
  ]);

  // Divisions resolve over the whole book first, so a cut inherits the division
  // its deals already had rather than re-deciding it for a smaller set.
  const divisionByDeal = resolveDealDivisions(allDeals);

  const passesGates = (d: (typeof allDeals)[number]) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (downsells.heldOutIds.has(d.id)) return false;
    if (isOneOff(d) || /ad[\s-]?hoc/i.test(d.name)) return false;
    return divisionByDeal.get(d.id) === view.baseDivision;
  };

  const manager = view.clientManager.trim().toLowerCase();
  const divisionDeals = allDeals.filter(passesGates);
  const deals = divisionDeals.filter(
    (d) => (d.clientManager ?? "").trim().toLowerCase() === manager
  );

  const now = new Date();
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const liveIn = (d: (typeof allDeals)[number], month: string) => {
    const { startKey, churnKey } = windowKeys(d, downsells);
    return !!startKey && month >= startKey && (!churnKey || month < churnKey);
  };

  // Companies live in each month, with the revenue each carried.
  const companiesByMonth = new Map<string, Map<string, { name: string; revenue: number }>>();
  for (const month of keys) {
    const m = new Map<string, { name: string; revenue: number }>();
    for (const d of deals) {
      const amt = d.amountExGst ?? 0;
      if (amt <= 0 || !liveIn(d, month)) continue;
      const key = companyKeyOf(d);
      const existing = m.get(key);
      if (existing) existing.revenue += amt;
      else m.set(key, { name: d.name.trim(), revenue: amt });
    }
    companiesByMonth.set(month, m);
  }

  const monthKeyOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

  const monthRows: PortfolioMonth[] = keys.map((month, i) => {
    const here = companiesByMonth.get(month)!;
    const prev = i > 0 ? companiesByMonth.get(keys[i - 1])! : null;

    const revenue = [...here.values()].reduce((s, c) => s + c.revenue, 0);
    const divisionRevenue = divisionDeals.reduce(
      (s, d) => (liveIn(d, month) ? s + Math.max(0, d.amountExGst ?? 0) : s),
      0
    );

    // Retention is measured against the companies CARRIED INTO the month, so a
    // client won this month can neither be retained nor flatter the rate.
    let clientsAtStart = 0;
    let clientsRetained = 0;
    const churnedClients: PortfolioMovement[] = [];
    if (prev) {
      clientsAtStart = prev.size;
      for (const [key, c] of prev) {
        if (here.has(key)) clientsRetained++;
        else churnedClients.push({ id: key, name: c.name, revenue: Math.round(c.revenue) });
      }
    }

    // Upsells only — new business is not a client-servicing lead's work, so it
    // is excluded rather than shown and explained away.
    const upsells: PortfolioMovement[] = [];
    let upsellRevenue = 0;
    for (const d of deals) {
      const amt = d.amountExGst ?? 0;
      if (amt <= 0 || !isUpsell(d)) continue;
      if (downsells.successorIds.has(d.id)) continue; // a replacement, not an expansion
      if (monthKeyOf(d.startDate ?? d.closeDate) !== month) continue;
      upsellRevenue += amt;
      upsells.push({ id: d.clientId ?? d.id, name: d.name.trim(), revenue: Math.round(amt) });
    }

    return {
      month,
      label: formatMonth(month),
      revenue: Math.round(revenue),
      divisionRevenue: Math.round(divisionRevenue),
      sharePct: divisionRevenue > 0 ? Number(((revenue / divisionRevenue) * 100).toFixed(1)) : 0,
      clientsAtStart,
      clientsRetained,
      retentionPct:
        prev && clientsAtStart > 0
          ? Number(((clientsRetained / clientsAtStart) * 100).toFixed(1))
          : null,
      upsellRevenue: Math.round(upsellRevenue),
      upsells: upsells.sort((a, b) => b.revenue - a.revenue),
      churnedRevenue: Math.round(churnedClients.reduce((s, c) => s + c.revenue, 0)),
      churnedClients: churnedClients.sort((a, b) => b.revenue - a.revenue),
    };
  });

  // Current book, upsells folded so an expansion is not a separate client.
  const currentMonth = keys[keys.length - 1];
  const liveDeals = deals.filter((d) => liveIn(d, currentMonth));
  const { deals: folded } = foldUpsells(liveDeals);

  const ltvOf = (companyDeals: typeof deals) =>
    companyDeals.reduce((sum, d) => {
      const monthly = d.amountExGst ?? 0;
      if (monthly <= 0) return sum;
      const from = (d.startDate ?? d.closeDate)?.getTime();
      if (!from) return sum;
      const to = d.churnDate?.getTime() ?? now.getTime();
      return sum + monthly * Math.max(1, Math.round((to - from) / MS_PER_MONTH));
    }, 0);

  const byCompany = new Map<string, PortfolioClient>();
  for (const d of folded) {
    const key = companyKeyOf(d);
    const amt = Math.round(d.amountExGst ?? 0);
    const existing = byCompany.get(key);
    if (existing) existing.revenue += amt;
    else byCompany.set(key, { id: key, name: d.name.trim(), revenue: amt, ltv: null, startDate: null });
  }
  // LTV and tenure read every deal a company ever had, not just the live ones.
  for (const [key, client] of byCompany) {
    const companyDeals = deals.filter((d) => companyKeyOf(d) === key);
    const ltv = ltvOf(companyDeals);
    client.ltv = ltv > 0 ? Math.round(ltv) : null;
    const starts = companyDeals
      .map((d) => d.startDate ?? d.closeDate)
      .filter((d): d is Date => !!d);
    client.startDate = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  }

  const clients = [...byCompany.values()].sort((a, b) => b.revenue - a.revenue);
  const currentRevenue = clients.reduce((s, c) => s + c.revenue, 0);
  const divisionRevenue = monthRows[monthRows.length - 1]?.divisionRevenue ?? 0;

  const ltvs = clients.map((c) => c.ltv ?? 0).filter((v) => v > 0);
  const tenures = clients
    .map((c) => (c.startDate ? (now.getTime() - c.startDate.getTime()) / MS_PER_MONTH : null))
    .filter((v): v is number => v !== null);

  // Retention across the whole window, not an average of monthly rates — a
  // rate of rates weights a quiet month the same as a busy one.
  const carried = monthRows.reduce((s, m) => s + m.clientsAtStart, 0);
  const kept = monthRows.reduce((s, m) => s + m.clientsRetained, 0);

  return {
    label: view.label,
    baseLabel: divisionDisplayName(view.baseDivision),
    currentRevenue,
    currentClientCount: clients.length,
    divisionRevenue,
    sharePct: divisionRevenue > 0 ? Number(((currentRevenue / divisionRevenue) * 100).toFixed(1)) : 0,
    avgLtv: ltvs.length ? Math.round(ltvs.reduce((s, v) => s + v, 0) / ltvs.length) : 0,
    avgTenureMonths: tenures.length
      ? Number((tenures.reduce((s, v) => s + v, 0) / tenures.length).toFixed(1))
      : 0,
    retentionPct: carried > 0 ? Number(((kept / carried) * 100).toFixed(1)) : null,
    months: monthRows,
    clients,
  };
}
