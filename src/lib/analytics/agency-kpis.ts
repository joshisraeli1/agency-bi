import { db } from "@/lib/db";
import { getMonthRange, toMonthKey } from "@/lib/utils";
import type { AgencyKPIs } from "./types";

export async function getAgencyKPIs(months = 6): Promise<AgencyKPIs> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [financials, timeEntries, teamMembers, activeClients, allClients, settings] =
    await Promise.all([
      db.financialRecord.findMany({
        where: { month: { in: monthRange } },
      }),
      db.timeEntry.findMany({
        where: { date: { gte: startDate } },
        include: { teamMember: true },
      }),
      db.teamMember.findMany({ where: { active: true } }),
      db.client.count({ where: { status: "active" } }),
      db.client.count(),
      db.appSettings.findFirst(),
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
  };
}
