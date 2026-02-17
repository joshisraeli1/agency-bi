import { db } from "@/lib/db";
import { getMonthRange, getEffectiveHourlyRate } from "@/lib/utils";
import type { ClientProfitability } from "./types";

export async function getClientProfitability(
  clientId: string,
  months = 6
): Promise<ClientProfitability> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [client, financials, timeEntries, deliverables] = await Promise.all([
    db.client.findUniqueOrThrow({
      where: { id: clientId },
    }),
    db.financialRecord.findMany({
      where: { clientId, month: { in: monthRange } },
    }),
    db.timeEntry.findMany({
      where: {
        clientId,
        date: { gte: startDate },
      },
      include: {
        teamMember: true,
      },
    }),
    db.deliverable.findMany({
      where: { clientId },
    }),
  ]);

  const totalRevenue = financials
    .filter((f) => f.type === "retainer" || f.type === "project")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalCost = financials
    .filter((f) => f.type === "cost")
    .reduce((sum, f) => sum + f.amount, 0);

  // Calculate labor cost from time entries
  const teamMap = new Map<
    string,
    { memberId: string; memberName: string; hours: number; cost: number }
  >();

  let totalHours = 0;
  for (const entry of timeEntries) {
    totalHours += entry.hours;
    const memberId = entry.teamMemberId || "unassigned";
    const memberName = entry.teamMember?.name || "Unassigned";
    const existing = teamMap.get(memberId) || {
      memberId,
      memberName,
      hours: 0,
      cost: 0,
    };
    existing.hours += entry.hours;

    if (entry.teamMember) {
      const rate = getEffectiveHourlyRate(entry.teamMember);
      if (rate) existing.cost += entry.hours * rate;
    }

    teamMap.set(memberId, existing);
  }

  const laborCost = Array.from(teamMap.values()).reduce(
    (sum, t) => sum + t.cost,
    0
  );
  const effectiveTotalCost = totalCost > 0 ? totalCost : laborCost;
  const margin = totalRevenue - effectiveTotalCost;
  const marginPercent = totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0;

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

  // Deliverable stats
  const byStatus: Record<string, number> = {};
  for (const d of deliverables) {
    const status = d.status || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return {
    clientId: client.id,
    clientName: client.name,
    status: client.status,
    retainerValue: client.retainerValue || 0,
    totalRevenue,
    totalCost: effectiveTotalCost,
    margin,
    marginPercent,
    totalHours,
    effectiveRate: totalHours > 0 ? totalRevenue / totalHours : 0,
    teamBreakdown: Array.from(teamMap.values()),
    monthlyTrend,
    deliverableStats: { total: deliverables.length, byStatus },
  };
}
