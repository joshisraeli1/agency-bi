import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";
import { clientDisplayName } from "./client-name";
import { foldUpsells, isOneOff, normalize, resolveDealDivisions } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";

export interface ClientBookRow {
  /** Live revenue split by the division each deal belongs to. A company can
   *  span divisions — Blue Light Card runs Content and Ads — so the single
   *  `division` label below is only its largest. */
  revenueByDivision: Record<string, number>;
  id: string;
  name: string;
  status: "active" | "churned";
  division: string;
  revenue: number; // ex-GST MRR of live deals, upsells folded
  percentOfRevenue: number;
  ltv: number | null;
  dealCount: number;
  startDate: Date | null;
  endDate: Date | null; // churn date, when every deal has churned
  industry: string | null;
  website: string | null;
  source: string;
  notes: string | null;
  aliasCount: number;
  /** True when the row has no HubSpot deals — a Monday/manual client whose
   *  figures come from its stored record rather than from deals. */
  unlinked: boolean;
}

export interface ClientBook {
  clients: ClientBookRow[];
  totalRevenue: number;
  divisionRevenue: Record<string, number>;
}

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

/** Clients with no HubSpot deal have no division to derive. */
export const UNASSIGNED_DIVISION = "Unassigned";

/**
 * The client list, derived from deals rather than from Client.status.
 *
 * Client.status and Client.retainerValue are written once and never revised, so
 * the stored view drifts badly: 14 companies sat marked "churned" while holding
 * live deals (Superpower, $34,600), and 19 records showed an "active" retainer
 * with no deals behind them at all (Smartpay, $14,500) — usually because a
 * duplicate record kept the stale value after its deals moved elsewhere.
 *
 * Deals are the source of truth: a company with at least one live closed-won
 * deal is active, one whose deals have all churned is churned, and a record with
 * no deals is not a client here at all. Companies are grouped by clientId where
 * there is one and by HubSpot company name otherwise, so duplicate Client rows
 * collapse into a single company.
 *
 * Monday/manual clients that were never in HubSpot are kept and flagged
 * `unlinked`, so nothing vanishes without explanation.
 */
export async function getClientBook(): Promise<ClientBook> {
  const [excludedIds, rawDeals, downsells, clientRecords] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { ...DOWNSELL_DEAL_SELECT, companyName: true },
    }),
    getDownsellResolution(),
    db.client.findMany({
      select: {
        id: true, name: true, status: true, industry: true, website: true, source: true,
        notes: true, startDate: true, endDate: true, retainerValue: true,
        _count: { select: { aliases: true, hubspotDeals: true } },
      },
    }),
  ]);

  const clientById = new Map(clientRecords.map((c) => [c.id, c]));

  const deals = rawDeals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (downsells.heldOutIds.has(d.id)) return false;
    return !isOneOff(d) && !/ad[\s-]?hoc/i.test(d.name);
  });
  const divisionByDeal = resolveDealDivisions(deals);

  // One group per company. clientId when present, else the HubSpot company
  // name — plenty of companies have no Client record (Ipanema is one).
  const groupKey = (d: (typeof deals)[number]) =>
    d.clientId ?? (d.companyName ? `name:${normalize(d.companyName)}` : `deal:${d.id}`);

  const groups = new Map<string, typeof deals>();
  for (const d of deals) {
    const k = groupKey(d);
    const arr = groups.get(k);
    if (arr) arr.push(d);
    else groups.set(k, [d]);
  }

  const now = Date.now();
  const nowDate = new Date();
  const currentMonth = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
  const rows: ClientBookRow[] = [];

  for (const [key, groupDeals] of groups) {
    // "Live this month", the same window the divisional dashboards use, so the
    // two tie. A deal that starts next month isn't current revenue yet.
    const live = groupDeals.filter((d) => {
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (d.stage !== "closed_won" || !startKey) return false;
      return currentMonth >= startKey && (!churnKey || currentMonth < churnKey);
    });

    const record = clientById.get(key) ?? null;
    const { deals: folded } = foldUpsells(live.length > 0 ? live : groupDeals);
    const revenue = live.length > 0 ? folded.reduce((s, d) => s + (d.amountExGst ?? 0), 0) : 0;

    // A company with only zero-value live deals isn't a paying client.
    if (live.length > 0 && revenue <= 0) continue;

    const starts = groupDeals.map((d) => d.startDate ?? d.closeDate).filter(Boolean) as Date[];
    const churns = groupDeals.map((d) => d.churnDate).filter(Boolean) as Date[];
    const startDate = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : record?.startDate ?? null;
    const endDate = live.length === 0 && churns.length
      ? new Date(Math.max(...churns.map((d) => d.getTime())))
      : null;

    // Lifetime value: each deal's monthly value across the months it ran.
    const ltv = groupDeals.reduce((sum, d) => {
      const monthly = d.amountExGst ?? 0;
      if (monthly <= 0) return sum;
      const from = (d.startDate ?? d.closeDate)?.getTime();
      if (!from) return sum;
      const to = d.churnDate?.getTime() ?? now;
      return sum + monthly * Math.max(1, Math.round((to - from) / MS_PER_MONTH));
    }, 0);

    // Split on the unfolded deals. foldUpsells merges an upsell onto its base,
    // and a cross-division upsell (Compare Club's SMM upsell on a Content base)
    // would otherwise carry its revenue into the base deal's division.
    const revenueByDivision: Record<string, number> = {};
    for (const d of live) {
      const div = divisionByDeal.get(d.id) ?? "Content Delivery";
      revenueByDivision[div] = (revenueByDivision[div] ?? 0) + Math.round(d.amountExGst ?? 0);
    }

    const primary = [...folded].sort((a, b) => (b.amountExGst ?? 0) - (a.amountExGst ?? 0))[0];
    const displayName = clientDisplayName(
      record?.name ?? primary?.companyName ?? primary?.name ?? "Unknown",
      groupDeals.map((d) => d.name)
    );

    rows.push({
      id: record?.id ?? key,
      name: displayName,
      status: live.length > 0 ? "active" : "churned",
      division: divisionByDeal.get(primary?.id ?? groupDeals[0].id) ?? "Content Delivery",
      revenueByDivision: live.length > 0 ? revenueByDivision : {},
      revenue: Math.round(revenue),
      percentOfRevenue: 0, // filled once the total is known
      ltv: ltv > 0 ? Math.round(ltv) : null,
      dealCount: folded.length,
      startDate,
      endDate,
      industry: record?.industry ?? null,
      website: record?.website ?? null,
      source: record?.source ?? "hubspot",
      notes: record?.notes ?? null,
      aliasCount: record?._count.aliases ?? 0,
      unlinked: false,
    });
  }

  // Monday/manual clients that never had a HubSpot deal would otherwise vanish.
  // The synthetic Xero P&L record is not a client and is always excluded.
  const seen = new Set(rows.map((r) => normalize(r.name)));
  for (const c of clientRecords) {
    if (c._count.hubspotDeals > 0) continue;
    // Only genuinely non-HubSpot clients qualify. A hubspot-sourced record with
    // no deals is a leftover shell keeping a stale retainer, not a real client.
    if (c.source === "hubspot" || c.source === "xero") continue;
    if (c.name.startsWith("Xero P&L")) continue;
    if (c.status === "churned" || c.status === "prospect") continue;
    if (excludedIds.has(c.id)) continue;
    if (seen.has(normalize(c.name))) continue;
    if ((c.retainerValue ?? 0) <= 0) continue;

    rows.push({
      id: c.id,
      name: c.name,
      status: "active",
      // No deal means no division to derive — guessing one inflates it.
      division: UNASSIGNED_DIVISION,
      revenue: Math.round(c.retainerValue ?? 0),
      revenueByDivision: {},
      percentOfRevenue: 0,
      ltv: null,
      dealCount: 0,
      startDate: c.startDate,
      endDate: null,
      industry: c.industry,
      website: c.website,
      source: c.source,
      notes: c.notes,
      aliasCount: c._count.aliases,
      unlinked: true,
    });
  }

  const active = rows.filter((r) => r.status === "active");
  const totalRevenue = active.reduce((s, r) => s + r.revenue, 0);

  const divisionRevenue: Record<string, number> = {
    "Content Delivery": 0,
    "Social Media Management": 0,
    "Ads Management": 0,
  };
  for (const r of active) {
    r.percentOfRevenue = totalRevenue > 0 ? Number(((r.revenue / totalRevenue) * 100).toFixed(1)) : 0;
    for (const [div, amount] of Object.entries(r.revenueByDivision)) {
      if (div in divisionRevenue) divisionRevenue[div] += amount;
    }
  }

  rows.sort((a, b) => b.revenue - a.revenue);

  return { clients: rows, totalRevenue, divisionRevenue };
}
