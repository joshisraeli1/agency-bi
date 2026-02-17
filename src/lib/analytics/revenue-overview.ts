import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";
import type { RevenueOverview } from "./types";

export async function getRevenueOverview(
  months = 6
): Promise<RevenueOverview> {
  const monthRange = getMonthRange(months);

  const [financials, clients, settings] = await Promise.all([
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
      include: { client: true },
    }),
    db.client.findMany({ where: { status: "active" } }),
    db.appSettings.findFirst(),
  ]);

  const marginWarning = settings?.marginWarning ?? 20;

  // Totals
  const totalRevenue = financials
    .filter((f) => f.type === "retainer" || f.type === "project")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalCost = financials
    .filter((f) => f.type === "cost")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalMargin = totalRevenue - totalCost;
  const avgMarginPercent =
    totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  // Monthly trend
  const monthlyTrend = monthRange.map((month) => {
    const monthFinancials = financials.filter((f) => f.month === month);
    const rev = monthFinancials
      .filter((f) => f.type === "retainer" || f.type === "project")
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
    if (f.type === "retainer" || f.type === "project") {
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
    monthlyTrend,
    byClient,
    atRiskClients,
  };
}
