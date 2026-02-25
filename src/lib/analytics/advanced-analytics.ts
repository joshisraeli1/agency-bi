import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, getEffectiveHourlyRate } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";

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
  const [allClients, financials, settings, excludedIds] = await Promise.all([
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
    db.financialRecord.findMany({
      where: { type: { in: ["retainer", "project"] }, source: "hubspot" },
      select: { clientId: true, amount: true },
    }),
    db.appSettings.findFirst(),
    getExcludedClientIds(),
  ]);

  const clients = allClients.filter((c) => !excludedIds.has(c.id));

  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

  // Sum revenue per client (ex-GST)
  const revenueMap = new Map<string, number>();
  for (const f of financials) {
    revenueMap.set(f.clientId, (revenueMap.get(f.clientId) || 0) + f.amount / gstDivisor);
  }

  const now = new Date();
  const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

  // Calculate actual tenure for churned clients to derive average churned tenure
  const churnedTenures: number[] = [];
  for (const c of clients) {
    if (c.status === "churned" && c.startDate && c.endDate) {
      const tenure = Math.max(1, Math.round(
        (new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / MS_PER_MONTH
      ));
      churnedTenures.push(tenure);
    }
  }
  const avgChurnedTenure = churnedTenures.length > 0
    ? churnedTenures.reduce((a, b) => a + b, 0) / churnedTenures.length
    : 12; // default fallback if no churned data

  const clientData = clients.map((c) => {
    const totalRevenue = revenueMap.get(c.id) || 0;
    const effectiveStart = c.startDate ? new Date(c.startDate) : c.createdAt;

    let monthsActive: number;
    if (c.status === "churned" && c.endDate) {
      // Churned: use actual tenure from startDate to endDate
      monthsActive = Math.max(1, Math.round(
        (new Date(c.endDate).getTime() - effectiveStart.getTime()) / MS_PER_MONTH
      ));
    } else {
      // Active: use avg churned tenure as projected lifetime, or current tenure if longer
      const currentTenure = Math.max(1, Math.round(
        (now.getTime() - effectiveStart.getTime()) / MS_PER_MONTH
      ));
      monthsActive = Math.max(currentTenure, Math.round(avgChurnedTenure));
    }

    return {
      clientId: c.id,
      clientName: c.name,
      status: c.status,
      industry: c.industry || "Unknown",
      totalRevenue,
      monthsActive,
      monthlyAvgRevenue: totalRevenue / monthsActive,
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

  const [excludedIds, financials, clients, teamMembers, settings] = await Promise.all([
    getExcludedClientIds(),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
    }),
    db.client.findMany({
      where: { hubspotDealId: { not: null } },
      select: {
        id: true,
        smRetainer: true,
        contentRetainer: true,
        growthRetainer: true,
        productionRetainer: true,
      },
    }),
    db.teamMember.findMany({
      where: { active: true },
      select: { annualSalary: true, hourlyRate: true, weeklyHours: true },
    }),
    db.appSettings.findFirst(),
  ]);

  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;
  const filtered = financials.filter((f) => !excludedIds.has(f.clientId));

  // Build client service allocation lookup
  const clientAlloc = new Map<string, { sm: number; growth: number; content: number; total: number }>();
  for (const c of clients) {
    const sm = c.smRetainer ?? 0;
    const growth = c.growthRetainer ?? 0;
    const content = (c.contentRetainer ?? 0) + (c.productionRetainer ?? 0);
    const total = sm + growth + content;
    clientAlloc.set(c.id, { sm, growth, content, total });
  }

  // Monthly team overhead
  let monthlyTeamCost = 0;
  for (const m of teamMembers) {
    if (m.annualSalary) {
      monthlyTeamCost += m.annualSalary / 12;
    } else if (m.hourlyRate) {
      monthlyTeamCost += (m.hourlyRate * (m.weeklyHours ?? 38) * 52) / 12;
    }
  }

  const monthlyBreakdown = monthRange.map((month) => {
    const mf = filtered.filter((f) => f.month === month);
    let socialMedia = 0;
    let adsManagement = 0;
    let contentDelivery = 0;

    // Revenue records from HubSpot, allocated proportionally by service type
    const revenueRecords = mf.filter(
      (f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot"
    );
    for (const r of revenueRecords) {
      const exGst = r.amount / gstDivisor;
      const alloc = clientAlloc.get(r.clientId);
      if (alloc && alloc.total > 0) {
        socialMedia += exGst * (alloc.sm / alloc.total);
        adsManagement += exGst * (alloc.growth / alloc.total);
        contentDelivery += exGst * (alloc.content / alloc.total);
      } else {
        // No allocation data — split equally across 3 buckets
        socialMedia += exGst / 3;
        adsManagement += exGst / 3;
        contentDelivery += exGst / 3;
      }
    }

    const explicitCost = mf
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);
    const total = socialMedia + adsManagement + contentDelivery;
    const cost = explicitCost + monthlyTeamCost;
    const marginPercent = total > 0 ? ((total - cost) / total) * 100 : 0;
    return {
      month,
      socialMedia: Math.round(socialMedia),
      adsManagement: Math.round(adsManagement),
      contentDelivery: Math.round(contentDelivery),
      total: Math.round(total),
      cost: Math.round(cost),
      marginPercent: Number(marginPercent.toFixed(1)),
    };
  });

  return { monthlyBreakdown };
}

export async function getClientHealthData(
  months = 6
): Promise<ClientHealthData> {
  const monthRange = getMonthRange(months);

  const [clients, financials, chSettings] = await Promise.all([
    db.client.findMany({
      where: { status: "active" },
      select: { id: true, name: true, startDate: true, createdAt: true },
    }),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
    }),
    db.appSettings.findFirst(),
  ]);

  const gstDivisor = 1 + (chSettings?.gstRate ?? 10) / 100;
  const now = new Date();
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  // Aggregate financials per client (revenue ex-GST)
  const clientFinancials = new Map<
    string,
    { revenue: number; cost: number }
  >();
  for (const f of financials) {
    if (!clientMap.has(f.clientId)) continue;
    const existing = clientFinancials.get(f.clientId) || {
      revenue: 0,
      cost: 0,
    };
    if (
      (f.type === "retainer" || f.type === "project") &&
      f.source === "hubspot"
    ) {
      existing.revenue += f.amount / gstDivisor;
    } else if (f.type === "cost") {
      existing.cost += f.amount;
    }
    clientFinancials.set(f.clientId, existing);
  }

  const result = clients
    .filter((c) => {
      const fin = clientFinancials.get(c.id);
      return fin && fin.revenue > 0;
    })
    .map((c) => {
      const fin = clientFinancials.get(c.id)!;
      const margin = fin.revenue - fin.cost;
      const marginPercent = (margin / fin.revenue) * 100;
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
        revenue: Math.round(fin.revenue),
        marginPercent: Number(marginPercent.toFixed(1)),
        monthsRetained,
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
    revenueMap.set(f.clientId, (revenueMap.get(f.clientId) || 0) + f.amount / gstDivisor);
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
      existing.hubspot += f.amount / gstDivisor;
    } else if (f.source === "xero") {
      existing.xero += f.amount / gstDivisor;
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
// Avg Deal Size by Division per Month
// ---------------------------------------------------------------------------

const EXCLUDED_DIVISIONS = ["Unassigned", "NA", "Sales"];
const EXCLUDED_ROLES = ["Director", "BDM"];

export interface AvgDealSizeByDivision {
  months: string[];
  divisions: string[];
  data: Record<string, Record<string, number>>; // month -> division -> avgDealSize
}

export async function getAvgDealSizeByDivision(
  months = 6
): Promise<AvgDealSizeByDivision> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [excludedIds, financials, timeEntries, settings] = await Promise.all([
    getExcludedClientIds(),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
    }),
    db.timeEntry.findMany({
      where: { date: { gte: startDate } },
      include: { teamMember: { select: { division: true, role: true } } },
    }),
    db.appSettings.findFirst(),
  ]);

  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;
  const filteredFinancials = financials.filter((f) => !excludedIds.has(f.clientId));

  // For each month, compute per-client division hours (excluding Directors/BDMs/etc.)
  const data: Record<string, Record<string, number>> = {};
  const allDivisions = new Set<string>();

  for (const month of monthRange) {
    const monthFin = filteredFinancials.filter((f) => f.month === month);

    // Build per-client division hours for this month
    const clientDivHours = new Map<string, Map<string, number>>();
    for (const entry of timeEntries) {
      if (!entry.clientId || toMonthKey(entry.date) !== month) continue;
      const div = entry.teamMember?.division || "Unassigned";
      const role = entry.teamMember?.role || "";
      if (EXCLUDED_DIVISIONS.includes(div) || EXCLUDED_ROLES.includes(role)) continue;
      if (!clientDivHours.has(entry.clientId)) {
        clientDivHours.set(entry.clientId, new Map());
      }
      const dm = clientDivHours.get(entry.clientId)!;
      dm.set(div, (dm.get(div) || 0) + entry.hours);
    }

    // Allocate revenue to divisions proportionally, track unique clients per division
    const divRevenue = new Map<string, number>();
    const divClients = new Map<string, Set<string>>();

    for (const fin of monthFin) {
      if (fin.type !== "retainer" && fin.type !== "project") continue;
      if (fin.source !== "hubspot") continue;
      const dh = clientDivHours.get(fin.clientId);
      if (!dh || dh.size === 0) continue;
      const totalH = Array.from(dh.values()).reduce((a, b) => a + b, 0);
      if (totalH === 0) continue;

      for (const [div, hours] of dh) {
        const proportion = hours / totalH;
        const revExGst = (fin.amount / gstDivisor) * proportion;
        divRevenue.set(div, (divRevenue.get(div) || 0) + revExGst);
        if (!divClients.has(div)) divClients.set(div, new Set());
        divClients.get(div)!.add(fin.clientId);
        allDivisions.add(div);
      }
    }

    // Compute avg deal size per division
    const monthData: Record<string, number> = {};
    for (const [div, rev] of divRevenue) {
      const clientCount = divClients.get(div)?.size || 1;
      monthData[div] = Math.round(rev / clientCount);
    }
    data[month] = monthData;
  }

  const divisions = Array.from(allDivisions)
    .filter((d) => !EXCLUDED_DIVISIONS.includes(d))
    .sort();

  return { months: monthRange, divisions, data };
}
