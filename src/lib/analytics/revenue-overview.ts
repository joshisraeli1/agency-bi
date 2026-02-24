import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import type { RevenueOverview } from "./types";

export async function getRevenueOverview(
  months = 6
): Promise<RevenueOverview> {
  const monthRange = getMonthRange(months);

  const [excludedIds, financialsRaw, settings, teamMembers] = await Promise.all([
    getExcludedClientIds(),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
      include: { client: true },
    }),
    db.appSettings.findFirst(),
    db.teamMember.findMany({
      where: { active: true },
      select: { annualSalary: true, hourlyRate: true, weeklyHours: true, costType: true },
    }),
  ]);

  // GST divisor: revenue amounts are GST-inclusive, convert to ex-GST
  const gstRate = settings?.gstRate ?? 10;
  const gstDivisor = 1 + gstRate / 100;

  // Calculate monthly team salary cost as overhead
  let monthlyTeamCost = 0;
  for (const member of teamMembers) {
    if (member.annualSalary) {
      monthlyTeamCost += member.annualSalary / 12;
    } else if (member.hourlyRate) {
      const weeklyHrs = member.weeklyHours ?? 38;
      monthlyTeamCost += (member.hourlyRate * weeklyHrs * 52) / 12;
    }
  }

  // Filter out excluded clients (prospects + legacy)
  const financials = financialsRaw.filter((f) => !excludedIds.has(f.clientId));

  const marginWarning = settings?.marginWarning ?? 20;

  // Totals — revenue only from HubSpot (source of truth), converted to ex-GST
  const totalRevenue = financials
    .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot")
    .reduce((sum, f) => sum + f.amount / gstDivisor, 0);

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
      sourceMap.set(source, (sourceMap.get(source) || 0) + f.amount / gstDivisor);
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
      .reduce((s, f) => s + f.amount / gstDivisor, 0);
    // Xero revenue from ALL records (including synthetic P&L client, unfiltered)
    const xeroRevenue = financialsRaw
      .filter((f) => f.month === month && (f.type === "retainer" || f.type === "project") && f.source === "xero")
      .reduce((s, f) => s + f.amount / gstDivisor, 0);
    const rev = hubspotRevenue; // HubSpot is source of truth
    const monthExplicitCost = monthFinancials
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);
    const cost = monthExplicitCost + monthlyTeamCost;
    return { month, revenue: rev, cost, margin: rev - cost, hubspotRevenue, xeroRevenue };
  });

  // Quarterly trend: aggregate monthly into quarters
  const quarterMap = new Map<string, { hubspotRevenue: number; xeroRevenue: number; revenue: number; cost: number }>();
  for (const m of monthlyTrend) {
    const [y, mo] = m.month.split("-").map(Number);
    const q = Math.ceil(mo / 3);
    const qKey = `Q${q} ${y}`;
    const existing = quarterMap.get(qKey) || { hubspotRevenue: 0, xeroRevenue: 0, revenue: 0, cost: 0 };
    existing.hubspotRevenue += m.hubspotRevenue;
    existing.xeroRevenue += m.xeroRevenue;
    existing.revenue += m.revenue;
    existing.cost += m.cost;
    quarterMap.set(qKey, existing);
  }
  const quarterlyTrend = Array.from(quarterMap.entries())
    .map(([quarter, d]) => ({
      quarter,
      hubspotRevenue: Math.round(d.hubspotRevenue),
      xeroRevenue: Math.round(d.xeroRevenue),
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
      existing.revenue += f.amount / gstDivisor;
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
  };
}
