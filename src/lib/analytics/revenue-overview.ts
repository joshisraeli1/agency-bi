import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import type { RevenueOverview } from "./types";

export async function getRevenueOverview(
  months = 6
): Promise<RevenueOverview> {
  const monthRange = getMonthRange(months);

  const EXCLUDED_DIVISIONS = ["Unassigned", "NA", "Sales"];
  const EXCLUDED_ROLES = ["Director", "BDM"];

  const [excludedIds, financialsRaw, settings, teamMembers] = await Promise.all([
    getExcludedClientIds(),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
      include: { client: true },
    }),
    db.appSettings.findFirst(),
    db.teamMember.findMany({
      where: { active: true },
      select: { annualSalary: true, hourlyRate: true, weeklyHours: true, costType: true, division: true, role: true },
    }),
  ]);

  // GST divisor: revenue amounts are GST-inclusive, convert to ex-GST
  const gstRate = settings?.gstRate ?? 10;
  const gstDivisor = 1 + gstRate / 100;

  // Calculate monthly team salary cost as overhead (billable members only)
  const billableMembers = teamMembers.filter((m) => {
    const div = m.division || "Unassigned";
    const role = m.role || "";
    return !EXCLUDED_DIVISIONS.includes(div) && !EXCLUDED_ROLES.includes(role);
  });

  let monthlyTeamCost = 0;
  for (const member of billableMembers) {
    if (member.annualSalary) {
      monthlyTeamCost += member.annualSalary / 12;
    } else if (member.hourlyRate) {
      const weeklyHrs = member.weeklyHours ?? 38;
      monthlyTeamCost += (member.hourlyRate * weeklyHrs * 52) / 12;
    }
  }

  // Filter out excluded clients (prospects + legacy)
  const financials = financialsRaw.filter((f) => !excludedIds.has(f.clientId));

  // Active client IDs — used for monthly revenue stat cards
  const activeClientIds = new Set(
    financialsRaw
      .filter((f) => f.client.status === "active")
      .map((f) => f.clientId)
  );

  const marginWarning = settings?.marginWarning ?? 20;

  // Totals — revenue from all HubSpot clients (source of truth), ex-GST
  const totalRevenue = financials
    .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot")
    .reduce((sum, f) => sum + f.amount, 0);

  const explicitCost = financials
    .filter((f) => f.type === "cost")
    .reduce((sum, f) => sum + f.amount, 0);

  // Total cost = explicit costs from FinancialRecords + team salary overhead for the period
  const totalTeamCostForPeriod = monthlyTeamCost * monthRange.length;
  const totalCost = explicitCost + totalTeamCostForPeriod;

  const totalMargin = totalRevenue - totalCost;
  const avgMarginPercent =
    totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  // Annualized metrics: extrapolate from monthly average
  const monthsWithRevenue = monthRange.filter((month) => {
    return financials.some(
      (f) => f.month === month && (f.type === "retainer" || f.type === "project") && f.source === "hubspot" && f.amount > 0
    );
  }).length;

  const avgMonthlyRevenue = monthsWithRevenue > 0 ? totalRevenue / monthsWithRevenue : 0;
  const avgMonthlyExplicitCost = monthsWithRevenue > 0 ? explicitCost / monthsWithRevenue : 0;
  const avgMonthlyCost = avgMonthlyExplicitCost + monthlyTeamCost;
  const annualizedRevenue = avgMonthlyRevenue * 12;
  const annualizedProfit = (avgMonthlyRevenue - avgMonthlyCost) * 12;

  // Revenue by source (ex-GST)
  const sourceMap = new Map<string, number>();
  for (const f of financials) {
    if (f.type === "retainer" || f.type === "project") {
      const source = f.source || "unknown";
      sourceMap.set(source, (sourceMap.get(source) || 0) + f.amount);
    }
  }
  const revenueBySource = Array.from(sourceMap.entries())
    .map(([source, revenue]) => ({ source, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // Monthly trend (includes team salary overhead per month, revenue ex-GST)
  const monthlyTrend = monthRange.map((month) => {
    const monthFinancials = financials.filter((f) => f.month === month);
    const hubspotRevenue = monthFinancials
      .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot")
      .reduce((s, f) => s + f.amount, 0);
    // Closed Won only — for monthly revenue stat cards
    const activeRevenue = monthFinancials
      .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot" && activeClientIds.has(f.clientId))
      .reduce((s, f) => s + f.amount, 0);
    // Xero revenue from ALL records (including synthetic P&L client, unfiltered)
    const xeroRevenue = financialsRaw
      .filter((f) => f.month === month && (f.type === "retainer" || f.type === "project") && f.source === "xero")
      .reduce((s, f) => s + f.amount, 0);
    const rev = hubspotRevenue; // HubSpot is source of truth
    const monthExplicitCost = monthFinancials
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);
    const cost = monthExplicitCost + monthlyTeamCost;
    // Inc-GST amounts (financial records are ex-GST, multiply back)
    const hubspotRevenueIncGst = hubspotRevenue * gstDivisor;
    const xeroRevenueIncGst = xeroRevenue * gstDivisor;
    const activeRevenueIncGst = activeRevenue * gstDivisor;
    return { month, revenue: rev, cost, margin: rev - cost, hubspotRevenue, xeroRevenue, hubspotRevenueIncGst, xeroRevenueIncGst, activeRevenue, activeRevenueIncGst };
  });

  // Quarterly trend: aggregate monthly into quarters
  const quarterMap = new Map<string, { hubspotRevenue: number; xeroRevenue: number; hubspotRevenueIncGst: number; xeroRevenueIncGst: number; revenue: number; cost: number }>();
  for (const m of monthlyTrend) {
    const [y, mo] = m.month.split("-").map(Number);
    const q = Math.ceil(mo / 3);
    const qKey = `Q${q} ${y}`;
    const existing = quarterMap.get(qKey) || { hubspotRevenue: 0, xeroRevenue: 0, hubspotRevenueIncGst: 0, xeroRevenueIncGst: 0, revenue: 0, cost: 0 };
    existing.hubspotRevenue += m.hubspotRevenue;
    existing.xeroRevenue += m.xeroRevenue;
    existing.hubspotRevenueIncGst += m.hubspotRevenueIncGst;
    existing.xeroRevenueIncGst += m.xeroRevenueIncGst;
    existing.revenue += m.revenue;
    existing.cost += m.cost;
    quarterMap.set(qKey, existing);
  }
  const quarterlyTrend = Array.from(quarterMap.entries())
    .map(([quarter, d]) => ({
      quarter,
      hubspotRevenue: Math.round(d.hubspotRevenue),
      xeroRevenue: Math.round(d.xeroRevenue),
      hubspotRevenueIncGst: Math.round(d.hubspotRevenueIncGst),
      xeroRevenueIncGst: Math.round(d.xeroRevenueIncGst),
      revenue: Math.round(d.revenue),
      cost: Math.round(d.cost),
      margin: Math.round(d.revenue - d.cost),
    }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  // By client (revenue ex-GST)
  const clientRevMap = new Map<
    string,
    { clientId: string; clientName: string; revenue: number; cost: number }
  >();

  for (const f of financials) {
    const existing = clientRevMap.get(f.clientId) || {
      clientId: f.clientId,
      clientName: f.client.name,
      revenue: 0,
      cost: 0,
    };
    if ((f.type === "retainer" || f.type === "project") && f.source === "hubspot") {
      existing.revenue += f.amount;
    } else if (f.type === "cost") {
      existing.cost += f.amount;
    }
    clientRevMap.set(f.clientId, existing);
  }

  const byClient = Array.from(clientRevMap.values())
    .filter((c) => c.revenue > 0) // exclude clients with no HubSpot revenue (e.g. synthetic Xero P&L client)
    .map((c) => ({
      ...c,
      margin: c.revenue - c.cost,
      marginPercent: c.revenue > 0 ? ((c.revenue - c.cost) / c.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Division revenue trend — map each client's revenue to its service line based on contentPackageType
  const divisionRevenueTrend = monthRange.map((month) => {
    const monthFinancials = financials.filter((f) => f.month === month);
    const divRev: Record<string, number> = {
      "Content Delivery": 0,
      "Social Media Management": 0,
      "Ads Management": 0,
    };
    for (const f of monthFinancials) {
      if (!((f.type === "retainer" || f.type === "project") && f.source === "hubspot")) continue;
      const pkg = (f.client.contentPackageType || "").toLowerCase();
      if (pkg === "social media" || pkg === "social media management") {
        divRev["Social Media Management"] += f.amount;
      } else if (pkg === "social and ads management") {
        divRev["Social Media Management"] += f.amount * 0.5;
        divRev["Ads Management"] += f.amount * 0.5;
      } else if (pkg === "meta ads" || pkg === "ads management") {
        divRev["Ads Management"] += f.amount;
      } else {
        divRev["Content Delivery"] += f.amount;
      }
    }
    return {
      month: formatMonth(month),
      "Content Delivery": Math.round(divRev["Content Delivery"]),
      "Social Media Management": Math.round(divRev["Social Media Management"]),
      "Ads Management": Math.round(divRev["Ads Management"]),
    };
  });

  // At-risk clients
  const atRiskClients = byClient
    .filter((c) => c.marginPercent < marginWarning && c.revenue > 0)
    .map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      marginPercent: c.marginPercent,
      reason:
        c.marginPercent < 0
          ? "Negative margin"
          : `Margin below ${marginWarning}%`,
    }));

  return {
    totalRevenue,
    totalCost,
    totalMargin,
    avgMarginPercent,
    annualizedRevenue,
    annualizedProfit,
    revenueBySource,
    monthlyTrend,
    quarterlyTrend,
    byClient,
    atRiskClients,
    divisionRevenueTrend,
  };
}

// ---------------------------------------------------------------------------
// New Revenue vs Churn by Month
// ---------------------------------------------------------------------------

export interface RevenueVsChurnClient {
  id: string;
  name: string;
  retainerValue: number;
}

export interface RevenueVsChurnRow {
  month: string;
  newRevenue: number;
  churnedRevenue: number;
  net: number;
  newClients: RevenueVsChurnClient[];
  churnedClients: RevenueVsChurnClient[];
}

export async function getRevenueVsChurn(months = 12): Promise<RevenueVsChurnRow[]> {
  const monthRange = getMonthRange(months);

  const [excludedIds, clients] = await Promise.all([
    getExcludedClientIds(),
    db.client.findMany({
      where: {
        hubspotDealId: { not: null },
        status: { not: "prospect" },
      },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        retainerValue: true,
      },
    }),
  ]);

  const filtered = clients.filter((c) => !excludedIds.has(c.id));

  return monthRange.map((month) => {
    // New revenue: clients whose startDate falls in this month
    const newClients = filtered.filter((c) => {
      if (!c.startDate) return false;
      return toMonthKey(c.startDate) === month;
    });
    // retainerValue is already ex-GST (populated from amount__excl_gst_)
    const newRevenue = newClients.reduce((s, c) => s + (c.retainerValue || 0), 0);

    // Churned revenue: clients whose endDate falls in this month
    const churnedClients = filtered.filter((c) => {
      if (!c.endDate) return false;
      return toMonthKey(c.endDate) === month;
    });
    const churnedRevenue = churnedClients.reduce((s, c) => s + (c.retainerValue || 0), 0);

    return {
      month,
      newRevenue: Math.round(newRevenue),
      churnedRevenue: Math.round(churnedRevenue),
      net: Math.round(newRevenue - churnedRevenue),
      newClients: newClients.map((c) => ({
        id: c.id,
        name: c.name,
        retainerValue: Math.round(c.retainerValue || 0),
      })),
      churnedClients: churnedClients.map((c) => ({
        id: c.id,
        name: c.name,
        retainerValue: Math.round(c.retainerValue || 0),
      })),
    };
  });
}
