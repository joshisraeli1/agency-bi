import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, formatMonth, getLoadedMonthlyCost } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import type { RevenueOverview } from "./types";

export async function getRevenueOverview(
  months = 6
): Promise<RevenueOverview> {
  const monthRange = getMonthRange(months);

  const EXCLUDED_DIVISIONS = ["Unassigned", "NA", "Sales", "Overhead"];
  const EXCLUDED_ROLES = ["Director", "BDM"];

  const [excludedIds, financialsRaw, settings, teamMembers] = await Promise.all([
    getExcludedClientIds(),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
      // Only the client fields actually used below — avoids hauling the full
      // client row (20+ columns) joined onto every record across the WAN.
      select: {
        clientId: true,
        month: true,
        type: true,
        source: true,
        amount: true,
        client: {
          select: { name: true, status: true, contentPackageType: true },
        },
      },
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
    monthlyTeamCost += getLoadedMonthlyCost(member);
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
    .sort((a, b) => {
      const [aQ, aY] = a.quarter.split(" ");
      const [bQ, bY] = b.quarter.split(" ");
      const yd = parseInt(aY, 10) - parseInt(bY, 10);
      if (yd !== 0) return yd;
      return parseInt(aQ.slice(1), 10) - parseInt(bQ.slice(1), 10);
    });

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


/**
 * New vs churned revenue per month, derived from HubSpot deal dates directly:
 *  - A deal counts as NEW revenue in the month of its startDate (fallback closeDate).
 *  - A deal counts as CHURNED revenue in the month of its churnDate.
 * Amount is the deal's ex-GST value.
 *
 * This replaces the previous approach of inferring churn from the presence of
 * monthly FinancialRecord rows, which produced phantom churn when the current
 * month was only partially synced and broke when category formats drifted
 * (deal:* vs hubspot:*). Reading deal dates is exact and immune to both.
 */
export async function getRevenueVsChurn(months = 12): Promise<RevenueVsChurnRow[]> {
  const monthRange = getMonthRange(months);

  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: {
        id: true,
        clientId: true,
        name: true,
        amount: true,
        amountExGst: true,
        startDate: true,
        closeDate: true,
        churnDate: true,
      },
    }),
  ]);

  const monthKeyOf = (d: Date | null | undefined): string | null => {
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return monthRange.map((month) => {
    let newRevenue = 0;
    let churnedRevenue = 0;
    const newClients: RevenueVsChurnClient[] = [];
    const churnedClients: RevenueVsChurnClient[] = [];

    for (const d of deals) {
      if (d.clientId && excludedIds.has(d.clientId)) continue;
      const amt = d.amountExGst ?? d.amount ?? 0;
      if (!amt) continue;

      if (monthKeyOf(d.startDate ?? d.closeDate) === month) {
        newRevenue += amt;
        newClients.push({ id: d.clientId ?? d.id, name: d.name, retainerValue: Math.round(amt) });
      }
      if (monthKeyOf(d.churnDate) === month) {
        churnedRevenue += amt;
        churnedClients.push({ id: d.clientId ?? d.id, name: d.name, retainerValue: Math.round(amt) });
      }
    }

    return {
      month,
      newRevenue: Math.round(newRevenue),
      churnedRevenue: Math.round(churnedRevenue),
      net: Math.round(newRevenue - churnedRevenue),
      newClients,
      churnedClients,
    };
  });
}
