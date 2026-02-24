import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, formatMonth } from "@/lib/utils";
import type { AgencyKPIs } from "./types";

export async function getAgencyKPIs(months = 6): Promise<AgencyKPIs> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [financials, timeEntries, teamMembers, activeClients, allClients, settings, clients] =
    await Promise.all([
      db.financialRecord.findMany({
        where: { month: { in: monthRange } },
      }),
      db.timeEntry.findMany({
        where: { date: { gte: startDate } },
        include: { teamMember: true },
      }),
      db.teamMember.findMany({ where: { active: true } }),
      db.client.count({ where: { status: "active", hubspotDealId: { not: null } } }),
      db.client.count({ where: { status: { not: "prospect" }, hubspotDealId: { not: null } } }),
      db.appSettings.findFirst(),
      db.client.findMany({ select: { id: true, name: true, industry: true } }),
    ]);

  const productiveHoursPerDay = settings?.productiveHours || 6.5;
  const workingDaysPerMonth = 22;
  const availableHoursPerMonth = productiveHoursPerDay * workingDaysPerMonth;
  const totalTeamMembers = teamMembers.length;

  // Total revenue and cost
  const totalRevenue = financials
    .filter((f) => f.type === "retainer" || f.type === "project")
    .reduce((sum, f) => sum + f.amount, 0);

  const totalCost = financials
    .filter((f) => f.type === "cost")
    .reduce((sum, f) => sum + f.amount, 0);

  const avgMargin =
    totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
  const revenuePerHead =
    totalTeamMembers > 0 ? totalRevenue / totalTeamMembers : 0;

  // Utilization
  const billableHours = timeEntries
    .filter((e) => !e.isOverhead)
    .reduce((sum, e) => sum + e.hours, 0);

  const totalAvailableHours =
    totalTeamMembers * availableHoursPerMonth * months;
  const avgUtilization =
    totalAvailableHours > 0 ? (billableHours / totalAvailableHours) * 100 : 0;

  // Client retention (active / total)
  const clientRetention =
    allClients > 0 ? (activeClients / allClients) * 100 : 0;

  // Hours by division
  const divisionMap = new Map<string, number>();
  for (const entry of timeEntries) {
    const div = entry.teamMember?.division || "Unassigned";
    divisionMap.set(div, (divisionMap.get(div) || 0) + entry.hours);
  }

  const hoursByDivision = Array.from(divisionMap.entries())
    .map(([division, hours]) => ({ division, hours }))
    .sort((a, b) => b.hours - a.hours);

  // Monthly trend
  const monthlyTrend = monthRange.map((month) => {
    const monthFinancials = financials.filter((f) => f.month === month);
    const rev = monthFinancials
      .filter((f) => f.type === "retainer" || f.type === "project")
      .reduce((s, f) => s + f.amount, 0);
    const cost = monthFinancials
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);

    const monthEntries = timeEntries.filter(
      (e) => toMonthKey(e.date) === month
    );
    const monthBillable = monthEntries
      .filter((e) => !e.isOverhead)
      .reduce((s, e) => s + e.hours, 0);

    const monthAvail = totalTeamMembers * availableHoursPerMonth;
    const util = monthAvail > 0 ? (monthBillable / monthAvail) * 100 : 0;
    const marginPct = rev > 0 ? ((rev - cost) / rev) * 100 : 0;

    return {
      month,
      utilization: util,
      margin: marginPct,
      revenue: rev,
    };
  });

  // Build client lookup
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  // Per-client division hour proportions (for allocating financials to divisions)
  const clientDivisionHours = new Map<string, Map<string, number>>();
  for (const entry of timeEntries) {
    if (!entry.clientId) continue;
    const div = entry.teamMember?.division || "Unassigned";
    if (!clientDivisionHours.has(entry.clientId)) {
      clientDivisionHours.set(entry.clientId, new Map());
    }
    const divMap = clientDivisionHours.get(entry.clientId)!;
    divMap.set(div, (divMap.get(div) || 0) + entry.hours);
  }

  // Margin by Division: allocate each client's revenue/cost to divisions proportionally
  const divRevenue = new Map<string, number>();
  const divCost = new Map<string, number>();

  for (const fin of financials) {
    const divHours = clientDivisionHours.get(fin.clientId);
    if (!divHours || divHours.size === 0) continue;
    const totalH = Array.from(divHours.values()).reduce((a, b) => a + b, 0);
    if (totalH === 0) continue;

    for (const [div, hours] of divHours) {
      const proportion = hours / totalH;
      if (fin.type === "retainer" || fin.type === "project") {
        divRevenue.set(div, (divRevenue.get(div) || 0) + fin.amount * proportion);
      } else if (fin.type === "cost") {
        divCost.set(div, (divCost.get(div) || 0) + fin.amount * proportion);
      }
    }
  }

  const allDivisions = new Set([...divRevenue.keys(), ...divCost.keys()]);
  const marginByDivision = Array.from(allDivisions)
    .map((division) => {
      const rev = divRevenue.get(division) || 0;
      const cost = divCost.get(division) || 0;
      const margin = rev - cost;
      return {
        division,
        revenue: Math.round(rev),
        cost: Math.round(cost),
        margin: Math.round(margin),
        marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Division Margin Over Time: same allocation per month
  const divisionNames = Array.from(allDivisions).sort();
  const divisionMarginTrend = monthRange.map((month) => {
    const monthFin = financials.filter((f) => f.month === month);
    // Per-client division hours for this month only
    const monthClientDivHours = new Map<string, Map<string, number>>();
    for (const entry of timeEntries) {
      if (!entry.clientId || toMonthKey(entry.date) !== month) continue;
      const div = entry.teamMember?.division || "Unassigned";
      if (!monthClientDivHours.has(entry.clientId)) {
        monthClientDivHours.set(entry.clientId, new Map());
      }
      const dm = monthClientDivHours.get(entry.clientId)!;
      dm.set(div, (dm.get(div) || 0) + entry.hours);
    }

    const mDivRev = new Map<string, number>();
    const mDivCost = new Map<string, number>();
    for (const fin of monthFin) {
      const dh = monthClientDivHours.get(fin.clientId);
      if (!dh || dh.size === 0) continue;
      const totalH = Array.from(dh.values()).reduce((a, b) => a + b, 0);
      if (totalH === 0) continue;
      for (const [div, hours] of dh) {
        const proportion = hours / totalH;
        if (fin.type === "retainer" || fin.type === "project") {
          mDivRev.set(div, (mDivRev.get(div) || 0) + fin.amount * proportion);
        } else if (fin.type === "cost") {
          mDivCost.set(div, (mDivCost.get(div) || 0) + fin.amount * proportion);
        }
      }
    }

    const row: Record<string, unknown> = { month: formatMonth(month) };
    for (const div of divisionNames) {
      const rev = mDivRev.get(div) || 0;
      const cost = mDivCost.get(div) || 0;
      row[div] = rev > 0 ? Number((((rev - cost) / rev) * 100).toFixed(1)) : 0;
    }
    return row;
  });

  // Client LTV by Industry
  const industryRevMap = new Map<string, number>();
  for (const fin of financials) {
    if (fin.type !== "retainer" && fin.type !== "project") continue;
    const client = clientMap.get(fin.clientId);
    const industry = client?.industry || "Unknown";
    industryRevMap.set(industry, (industryRevMap.get(industry) || 0) + fin.amount);
  }
  const clientLTVByIndustry = Array.from(industryRevMap.entries())
    .map(([industry, revenue]) => ({ industry, revenue: Math.round(revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // Client LTV by Division (reuse divRevenue from marginByDivision)
  const clientLTVByDivision = Array.from(divRevenue.entries())
    .map(([division, revenue]) => ({ division, revenue: Math.round(revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    avgUtilization,
    avgMargin,
    revenuePerHead,
    totalRevenue,
    totalTeamMembers,
    activeClients,
    clientRetention,
    hoursByDivision,
    monthlyTrend,
    marginByDivision,
    divisionMarginTrend,
    clientLTVByIndustry,
    clientLTVByDivision,
  };
}
