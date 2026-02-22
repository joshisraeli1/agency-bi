import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";
import type { RevenueOverview } from "./types";

export async function getRevenueOverview(
  months = 6
): Promise<RevenueOverview> {
  const monthRange = getMonthRange(months);

  // Get prospect client IDs so we can exclude them from financials
  const [prospectClients, financialsRaw, settings] = await Promise.all([
    db.client.findMany({
      where: { status: "prospect" },
      select: { id: true },
    }),
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
      include: { client: true },
    }),
    db.appSettings.findFirst(),
  ]);

  const prospectIds = new Set(prospectClients.map((c) => c.id));

  // Filter out financial records belonging to prospect clients
  const financials = financialsRaw.filter((f) => !prospectIds.has(f.clientId));

  const marginWarning = settings?.marginWarning ?? 20;

  // Totals — revenue only from HubSpot (source of truth for revenue)
  const totalRevenue = financials
    .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalCost = financials
    .filter((f) => f.type === "cost")
    .reduce((sum, f) => sum + f.amount, 0);

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
  const avgMonthlyCost = monthsWithRevenue > 0 ? totalCost / monthsWithRevenue : 0;
  const annualizedRevenue = avgMonthlyRevenue * 12;
  const annualizedProfit = (avgMonthlyRevenue - avgMonthlyCost) * 12;

  // Revenue by source
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

  // Monthly trend
  const monthlyTrend = monthRange.map((month) => {
    const monthFinancials = financials.filter((f) => f.month === month);
    const rev = monthFinancials
      .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot")
      .reduce((s, f) => s + f.amount, 0);
    const cost = monthFinancials
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);
    return { month, revenue: rev, cost, margin: rev - cost };
  });

  // By client
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
    byClient,
    atRiskClients,
  };
}
