import { db } from "@/lib/db";
import { getMonthRange, toMonthKey } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import { isOneOff } from "./upsells";
import type { XeroMarginTrend, NewClientDealSizeData } from "./types";

export interface LTVData {
  clients: {
    clientId: string;
    clientName: string;
    status: string;
    industry: string;
    totalRevenue: number;
    monthsActive: number;
    monthlyAvgRevenue: number;
    startDate: Date;
  }[];
  byCohort: {
    cohort: string;
    clients: number;
    totalRevenue: number;
    avgLTV: number;
  }[];
  byIndustry: {
    industry: string;
    clients: number;
    avgLTV: number;
    avgMonths: number;
  }[];
  tenureByCohort: {
    cohort: string;
    avgTenureMonths: number;
    clients: number;
  }[];
}

export interface RevenueByServiceType {
  monthlyBreakdown: {
    month: string;
    socialMedia: number;
    adsManagement: number;
    contentDelivery: number;
    total: number;
    cost: number;
    marginPercent: number;
  }[];
}

export interface ClientHealthData {
  clients: {
    clientId: string;
    clientName: string;
    revenue: number;
    marginPercent: number;
    monthsRetained: number;
    monthlyRevenue: number;
    division: string;
  }[];
}

export interface TeamUtilizationData {
  members: {
    memberId: string;
    memberName: string;
    division: string;
    billableHours: number;
    capacity: number;
    utilizationPercent: number;
  }[];
}

export async function getLTVData(): Promise<LTVData> {
  const [allClients, deals, , excludedIds] = await Promise.all([
    db.client.findMany({
      where: { status: { not: "prospect" }, hubspotDealId: { not: null } },
      select: {
        id: true,
        name: true,
        status: true,
        industry: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
    }),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }], clientId: { not: null } },
      select: { clientId: true, amount: true, amountExGst: true, name: true, packageDescription: true },
    }),
    db.appSettings.findFirst(),
    getExcludedClientIds(),
  ]);

  const clients = allClients.filter((c) => !excludedIds.has(c.id));

  // Per-client monthly MRR (ex-GST) from their closed-won/churned deals
  const clientMrr = new Map<string, number>();
  for (const d of deals) {
    if (!d.clientId || isOneOff(d)) continue; // one-offs are not recurring LTV
    clientMrr.set(d.clientId, (clientMrr.get(d.clientId) || 0) + (d.amountExGst ?? d.amount ?? 0));
  }

  const now = new Date();
  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

  const clientData = clients.map((c) => {
    const mrr = clientMrr.get(c.id) || 0;
    const effectiveStart = c.startDate ? new Date(c.startDate) : c.createdAt;

    // Months active = ACTUAL tenure (start → end for churned, start → now for
    // active). No projection — LTV is revenue earned to date, not forecast.
    const endMs = c.status === "churned" && c.endDate ? new Date(c.endDate).getTime() : now.getTime();
    const monthsActive = Math.max(1, Math.round((endMs - effectiveStart.getTime()) / MS_PER_MONTH));

    // Lifetime value = monthly MRR × actual months (deal-based).
    const totalRevenue = mrr * monthsActive;

    return {
      clientId: c.id,
      clientName: c.name,
      status: c.status,
      industry: c.industry || "Unknown",
      totalRevenue,
      monthsActive,
      monthlyAvgRevenue: mrr,
      startDate: effectiveStart,
    };
  });

  // Group by cohort (quarter of startDate)
  const cohortMap = new Map<
    string,
    { clients: number; totalRevenue: number }
  >();
  for (const c of clientData) {
    const q = Math.floor(c.startDate.getMonth() / 3) + 1;
    const cohort = `Q${q} ${c.startDate.getFullYear()}`;
    const existing = cohortMap.get(cohort) || { clients: 0, totalRevenue: 0 };
    existing.clients++;
    existing.totalRevenue += c.totalRevenue;
    cohortMap.set(cohort, existing);
  }

  const byCohort = Array.from(cohortMap.entries())
    .map(([cohort, data]) => ({
      cohort,
      clients: data.clients,
      totalRevenue: Math.round(data.totalRevenue),
      avgLTV: Math.round(data.totalRevenue / data.clients),
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));

  // Group by industry
  const industryMap = new Map<
    string,
    { clients: number; totalRevenue: number; totalMonths: number }
  >();
  for (const c of clientData) {
    const existing = industryMap.get(c.industry) || {
      clients: 0,
      totalRevenue: 0,
      totalMonths: 0,
    };
    existing.clients++;
    existing.totalRevenue += c.totalRevenue;
    existing.totalMonths += c.monthsActive;
    industryMap.set(c.industry, existing);
  }

  const byIndustry = Array.from(industryMap.entries())
    .map(([industry, data]) => ({
      industry,
      clients: data.clients,
      avgLTV: Math.round(data.totalRevenue / data.clients),
      avgMonths: Math.round(data.totalMonths / data.clients),
    }))
    .sort((a, b) => b.avgLTV - a.avgLTV);

  // Tenure by cohort: avg tenure months per start quarter
  const tenureCohortMap = new Map<string, { totalMonths: number; clients: number }>();
  for (const c of clientData) {
    const q = Math.floor(c.startDate.getMonth() / 3) + 1;
    const cohort = `Q${q} ${c.startDate.getFullYear()}`;
    const existing = tenureCohortMap.get(cohort) || { totalMonths: 0, clients: 0 };
    existing.totalMonths += c.monthsActive;
    existing.clients++;
    tenureCohortMap.set(cohort, existing);
  }

  const tenureByCohort = Array.from(tenureCohortMap.entries())
    .map(([cohort, data]) => ({
      cohort,
      avgTenureMonths: Math.round(data.totalMonths / data.clients),
      clients: data.clients,
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));

  return { clients: clientData, byCohort, byIndustry, tenureByCohort };
}

export async function getRevenueByServiceType(
  months = 6
): Promise<RevenueByServiceType> {
  const monthRange = getMonthRange(months);

  const [excludedIds, deals, cogsRecords] = await Promise.all([
    getExcludedClientIds(),
    // Closed-won + churned deals — revenue per service line from active windows
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { clientId: true, amount: true, amountExGst: true, startDate: true, closeDate: true, churnDate: true, contentPackageType: true },
    }),
    // Xero Cost of Sales (COGS) per month — for true gross profit/margin
    db.financialRecord.findMany({
      where: { source: "xero", type: "cost", description: "cogs", month: { in: monthRange } },
      select: { month: true, amount: true },
    }),
  ]);

  const monthKeyOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

  const cogsByMonth: Record<string, number> = {};
  for (const r of cogsRecords) cogsByMonth[r.month] = (cogsByMonth[r.month] || 0) + r.amount;

  const monthlyBreakdown = monthRange.map((month) => {
    let socialMedia = 0;
    let adsManagement = 0;
    let contentDelivery = 0;

    for (const d of deals) {
      if (d.clientId && excludedIds.has(d.clientId)) continue;
      const startKey = monthKeyOf(d.startDate ?? d.closeDate);
      if (!startKey) continue;
      const churnKey = monthKeyOf(d.churnDate);
      if (!(month >= startKey && (!churnKey || month < churnKey))) continue;
      const amt = d.amountExGst ?? 0;
      if (!amt) continue;
      const pkg = (d.contentPackageType || "").toLowerCase().trim();
      if (pkg === "social media" || pkg === "social media management") {
        socialMedia += amt;
      } else if (pkg === "social and ads management") {
        socialMedia += amt * 0.5;
        adsManagement += amt * 0.5;
      } else if (pkg === "meta ads" || pkg === "ads management") {
        adsManagement += amt;
      } else {
        contentDelivery += amt;
      }
    }

    const total = socialMedia + adsManagement + contentDelivery;
    const cost = Math.round(cogsByMonth[month] || 0); // Xero Cost of Sales (gross)
    const marginPercent = total > 0 ? ((total - cost) / total) * 100 : 0;
    return {
      month,
      socialMedia: Math.round(socialMedia),
      adsManagement: Math.round(adsManagement),
      contentDelivery: Math.round(contentDelivery),
      total: Math.round(total),
      cost,
      marginPercent: Number(marginPercent.toFixed(1)),
    };
  });

  return { monthlyBreakdown };
}

export async function getClientHealthData(): Promise<ClientHealthData> {
  const [excludedIds, clients, deals] = await Promise.all([
    getExcludedClientIds(),
    db.client.findMany({
      where: { status: "active", hubspotDealId: { not: null } },
      select: { id: true, name: true, startDate: true, createdAt: true, contentPackageType: true },
    }),
    db.hubspotDeal.findMany({
      where: { stage: "closed_won", clientId: { not: null } },
      select: { clientId: true, amount: true, amountExGst: true },
    }),
  ]);

  const now = new Date();
  const activeClients = clients.filter((c) => !excludedIds.has(c.id));
  const clientMap = new Map(activeClients.map((c) => [c.id, c]));

  // Per-client monthly MRR from closed-won deals (ex-GST)
  const clientMrr = new Map<string, number>();
  for (const d of deals) {
    if (!d.clientId || !clientMap.has(d.clientId)) continue;
    clientMrr.set(d.clientId, (clientMrr.get(d.clientId) || 0) + (d.amountExGst ?? d.amount ?? 0));
  }

  const result = activeClients
    .filter((c) => (clientMrr.get(c.id) || 0) > 0)
    .map((c) => {
      const monthlyRevenue = clientMrr.get(c.id)!;
      const effectiveStart = c.startDate ? new Date(c.startDate) : c.createdAt;
      const monthsRetained = Math.max(
        1,
        Math.round(
          (now.getTime() - effectiveStart.getTime()) /
            (1000 * 60 * 60 * 24 * 30.44)
        )
      );
      return {
        clientId: c.id,
        clientName: c.name,
        revenue: Math.round(monthlyRevenue),
        marginPercent: 0, // Cost data not available in this view
        monthsRetained,
        monthlyRevenue: Math.round(monthlyRevenue),
        division: getClientDivision(c.contentPackageType),
      };
    });

  return { clients: result };
}

export async function getTeamUtilizationData(
  months = 6
): Promise<TeamUtilizationData> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [teamMembers, timeEntries, settings] = await Promise.all([
    db.teamMember.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        division: true,
        weeklyHours: true,
      },
    }),
    db.timeEntry.findMany({
      where: { date: { gte: startDate } },
      select: { teamMemberId: true, hours: true, isOverhead: true },
    }),
    db.appSettings.findFirst(),
  ]);

  const productiveHoursPerDay = settings?.productiveHours || 6.5;
  const workingDaysPerMonth = 22;
  const capacityPerMonth = productiveHoursPerDay * workingDaysPerMonth;

  // Aggregate billable hours per team member
  const hoursMap = new Map<string, number>();
  for (const e of timeEntries) {
    if (!e.teamMemberId || e.isOverhead) continue;
    hoursMap.set(
      e.teamMemberId,
      (hoursMap.get(e.teamMemberId) || 0) + e.hours
    );
  }

  const members = teamMembers.map((m) => {
    const billableHours = hoursMap.get(m.id) || 0;
    const capacity = capacityPerMonth * months;
    const utilizationPercent =
      capacity > 0 ? (billableHours / capacity) * 100 : 0;
    return {
      memberId: m.id,
      memberName: m.name,
      division: m.division || "Unassigned",
      billableHours: Number(billableHours.toFixed(1)),
      capacity: Number(capacity.toFixed(0)),
      utilizationPercent: Number(utilizationPercent.toFixed(1)),
    };
  });

  members.sort((a, b) => b.utilizationPercent - a.utilizationPercent);

  return { members };
}

export interface SourceDiscrepancy {
  clientId: string;
  clientName: string;
  month: string;
  hubspotRevenue: number;
  xeroRevenue: number;
  difference: number;
  percentDiff: number;
}

export interface DiscrepancyReport {
  totalHubspot: number;
  totalXero: number;
  totalDifference: number;
  byClient: SourceDiscrepancy[];
  summary: {
    matched: number;
    hubspotOnly: number;
    xeroOnly: number;
    mismatched: number;
  };
}

export interface IndustryBreakdown {
  industries: {
    industry: string;
    activeClients: number;
    churnedClients: number;
    totalClients: number;
    totalRevenue: number;
  }[];
}

export async function getIndustryBreakdown(): Promise<IndustryBreakdown> {
  const [allClients, financials, settings, excludedIds] = await Promise.all([
    db.client.findMany({
      where: { status: { not: "prospect" }, hubspotDealId: { not: null } },
      select: { id: true, industry: true, status: true },
    }),
    db.financialRecord.findMany({
      where: { type: { in: ["retainer", "project"] }, source: "hubspot" },
      select: { clientId: true, amount: true },
    }),
    db.appSettings.findFirst(),
    getExcludedClientIds(),
  ]);

  const clients = allClients.filter((c) => !excludedIds.has(c.id));

  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

  // Revenue per client
  const revenueMap = new Map<string, number>();
  for (const f of financials) {
    revenueMap.set(f.clientId, (revenueMap.get(f.clientId) || 0) + f.amount);
  }

  // Group by industry
  const industryMap = new Map<string, { active: number; churned: number; revenue: number }>();
  for (const c of clients) {
    const industry = c.industry || "Unknown";
    const existing = industryMap.get(industry) || { active: 0, churned: 0, revenue: 0 };
    if (c.status === "active") existing.active++;
    else existing.churned++;
    existing.revenue += revenueMap.get(c.id) || 0;
    industryMap.set(industry, existing);
  }

  const industries = Array.from(industryMap.entries())
    .map(([industry, data]) => ({
      industry,
      activeClients: data.active,
      churnedClients: data.churned,
      totalClients: data.active + data.churned,
      totalRevenue: Math.round(data.revenue),
    }))
    .sort((a, b) => b.totalClients - a.totalClients);

  return { industries };
}

export async function getSourceDiscrepancy(
  months = 6
): Promise<DiscrepancyReport> {
  const monthRange = getMonthRange(months);

  const [allFinancials, settings, excludedIds] = await Promise.all([
    db.financialRecord.findMany({
      where: {
        month: { in: monthRange },
        type: { in: ["retainer", "project"] },
      },
      include: { client: { select: { name: true } } },
    }),
    db.appSettings.findFirst(),
    getExcludedClientIds(),
  ]);

  const financials = allFinancials.filter((f) => !excludedIds.has(f.clientId));

  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

  // Group by client+month, split by source
  const map = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      month: string;
      hubspot: number;
      xero: number;
    }
  >();

  for (const f of financials) {
    const key = `${f.clientId}:${f.month}`;
    const existing = map.get(key) || {
      clientId: f.clientId,
      clientName: f.client.name,
      month: f.month,
      hubspot: 0,
      xero: 0,
    };
    if (f.source === "hubspot") {
      existing.hubspot += f.amount;
    } else if (f.source === "xero") {
      existing.xero += f.amount;
    }
    map.set(key, existing);
  }

  let totalHubspot = 0;
  let totalXero = 0;
  let matched = 0;
  let hubspotOnly = 0;
  let xeroOnly = 0;
  let mismatched = 0;

  const byClient: SourceDiscrepancy[] = [];

  for (const entry of map.values()) {
    totalHubspot += entry.hubspot;
    totalXero += entry.xero;

    if (entry.hubspot > 0 && entry.xero > 0) {
      const diff = entry.hubspot - entry.xero;
      const percentDiff =
        entry.hubspot > 0 ? (diff / entry.hubspot) * 100 : 0;
      // Flag if >5% difference
      if (Math.abs(percentDiff) > 5) {
        mismatched++;
        byClient.push({
          clientId: entry.clientId,
          clientName: entry.clientName,
          month: entry.month,
          hubspotRevenue: Math.round(entry.hubspot),
          xeroRevenue: Math.round(entry.xero),
          difference: Math.round(diff),
          percentDiff: Number(percentDiff.toFixed(1)),
        });
      } else {
        matched++;
      }
    } else if (entry.hubspot > 0) {
      hubspotOnly++;
    } else if (entry.xero > 0) {
      xeroOnly++;
    }
  }

  byClient.sort(
    (a, b) => Math.abs(b.difference) - Math.abs(a.difference)
  );

  return {
    totalHubspot: Math.round(totalHubspot),
    totalXero: Math.round(totalXero),
    totalDifference: Math.round(totalHubspot - totalXero),
    byClient,
    summary: { matched, hubspotOnly, xeroOnly, mismatched },
  };
}

// ---------------------------------------------------------------------------
// Xero Margin Trend — monthly revenue vs cost from Xero source
// ---------------------------------------------------------------------------

export async function getXeroMarginTrend(months = 6): Promise<XeroMarginTrend> {
  const monthRange = getMonthRange(months);

  const financials = await db.financialRecord.findMany({
    where: { month: { in: monthRange }, source: "xero" },
  });

  let totalRevenue = 0;
  let totalCost = 0;

  const monthlyData = monthRange.map((month) => {
    const monthFin = financials.filter((f) => f.month === month);
    const revenue = monthFin
      .filter((f) => f.type === "retainer" || f.type === "project")
      .reduce((s, f) => s + f.amount, 0);
    const cost = monthFin
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);
    const margin = revenue - cost;
    const marginPercent = revenue > 0 ? Number(((margin / revenue) * 100).toFixed(1)) : 0;

    totalRevenue += revenue;
    totalCost += cost;

    return {
      month,
      revenue: Math.round(revenue),
      cost: Math.round(cost),
      margin: Math.round(margin),
      marginPercent,
    };
  });

  const totalMargin = totalRevenue - totalCost;
  const avgMarginPercent = totalRevenue > 0
    ? Number(((totalMargin / totalRevenue) * 100).toFixed(1))
    : 0;

  return {
    monthlyData,
    totalRevenue: Math.round(totalRevenue),
    totalCost: Math.round(totalCost),
    avgMarginPercent,
  };
}

// ---------------------------------------------------------------------------
// New Client Deal Size — clients by startDate per month
// ---------------------------------------------------------------------------

function getClientDivision(contentPackageType: string | null): string {
  const pkg = (contentPackageType || "").toLowerCase();
  if (pkg === "social media" || pkg === "social media management") return "Social Media Management";
  if (pkg === "social and ads management") return "Social Media Management / Ads Management";
  if (pkg === "meta ads" || pkg === "ads management") return "Ads Management";
  if (pkg) return "Content Delivery";
  return "Content Delivery";
}

export async function getNewClientDealSize(
  months = 6
): Promise<NewClientDealSizeData> {
  const monthRange = getMonthRange(months);

  // Deal-based movement (consistent with New Revenue vs Churn): a deal is "new"
  // in its start month and "churned" in its churn month. Keying off Client.endDate
  // missed churn the client record hadn't been updated for (e.g. June's mycar /
  // Stockspot / Chill Chair, which have a deal churnDate but no client endDate).
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: {
        id: true,
        clientId: true,
        name: true,
        amountExGst: true,
        amount: true,
        startDate: true,
        closeDate: true,
        churnDate: true,
        contentPackageType: true,
      },
    }),
  ]);

  // Exclude one-off (non-recurring) deals — these are revenue but not retainer,
  // so they don't belong in deal-size / new-retainer movement.
  const visible = deals.filter((d) => !(d.clientId && excludedIds.has(d.clientId)) && !isOneOff(d));
  const mk = (d: Date | null | undefined): string | null => (d ? toMonthKey(d) : null);
  const dealSizeOf = (d: { amountExGst: number | null; amount: number | null }) =>
    Math.round(d.amountExGst ?? (d.amount != null ? d.amount / 1.1 : 0));
  const toRow = (d: (typeof visible)[number]) => ({
    clientId: d.clientId ?? d.id,
    clientName: d.name,
    dealSize: dealSizeOf(d),
    division: getClientDivision(d.contentPackageType),
  });

  // New deals by start month (fallback closeDate)
  const newMonths = monthRange.map((month) => {
    const clientsWithDeal = visible
      .filter((d) => mk(d.startDate ?? d.closeDate) === month)
      .map(toRow);
    const totalDealSize = clientsWithDeal.reduce((s, c) => s + c.dealSize, 0);
    return {
      month,
      clients: clientsWithDeal,
      avgDealSize: clientsWithDeal.length > 0 ? Math.round(totalDealSize / clientsWithDeal.length) : 0,
      totalDealSize,
      clientCount: clientsWithDeal.length,
    };
  });

  // Churned deals by churn month
  const churnedMonths = monthRange.map((month) => {
    const clientsWithDeal = visible
      .filter((d) => mk(d.churnDate) === month)
      .map(toRow);
    const totalDealSize = clientsWithDeal.reduce((s, c) => s + c.dealSize, 0);
    return {
      month,
      clients: clientsWithDeal,
      totalDealSize,
      clientCount: clientsWithDeal.length,
    };
  });

  // By division summary (new clients only)
  const allNew = newMonths.flatMap((m) => m.clients);
  const divisionMap = new Map<string, { totalDealSize: number; count: number }>();
  for (const c of allNew) {
    if (c.dealSize <= 0) continue;
    const existing = divisionMap.get(c.division) || { totalDealSize: 0, count: 0 };
    existing.totalDealSize += c.dealSize;
    existing.count++;
    divisionMap.set(c.division, existing);
  }

  const byDivision = Array.from(divisionMap.entries())
    .map(([division, data]) => ({
      division,
      avgDealSize: Math.round(data.totalDealSize / data.count),
      clientCount: data.count,
    }))
    .sort((a, b) => b.avgDealSize - a.avgDealSize);

  return { months: newMonths, churnedMonths, byDivision };
}
