import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, formatMonth, getEffectiveHourlyRate } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import type {
  TimesheetClientMarginData,
  HolisticClientMarginData,
  MonthlyChurnData,
} from "./types";

// ---------------------------------------------------------------------------
// Timesheet Client Margin — HubSpot revenue vs time-tracked cost
// ---------------------------------------------------------------------------

export async function getTimesheetClientMargin(
  months = 6
): Promise<TimesheetClientMarginData> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [excludedIds, clients, financials, timeEntries, teamMembers, settings] =
    await Promise.all([
      getExcludedClientIds(),
      db.client.findMany({
        where: {
          status: "active",
          hubspotDealId: { not: null },
        },
        select: { id: true, name: true },
      }),
      db.financialRecord.findMany({
        where: {
          month: { in: monthRange },
          type: { in: ["retainer", "project"] },
          source: "hubspot",
        },
        select: { clientId: true, amount: true, month: true },
      }),
      db.timeEntry.findMany({
        where: {
          date: { gte: startDate },
          isOverhead: false,
          clientId: { not: null },
        },
        select: {
          clientId: true,
          hours: true,
          date: true,
          teamMember: {
            select: {
              costType: true,
              hourlyRate: true,
              annualSalary: true,
              weeklyHours: true,
            },
          },
        },
      }),
      db.teamMember.findMany({
        where: { active: true },
        select: {
          costType: true,
          hourlyRate: true,
          annualSalary: true,
          weeklyHours: true,
        },
      }),
      db.appSettings.findFirst(),
    ]);

  const activeClients = clients.filter((c) => !excludedIds.has(c.id));
  const clientIds = new Set(activeClients.map((c) => c.id));
  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

  // Blended hourly rate as fallback for time entries without a team member
  let totalRate = 0;
  let rateCount = 0;
  for (const m of teamMembers) {
    const rate = getEffectiveHourlyRate(m);
    if (rate) { totalRate += rate; rateCount++; }
  }
  const blendedHourlyRate = rateCount > 0 ? totalRate / rateCount : 50;

  // Revenue per client per month (ex-GST)
  const revenueByClientMonth = new Map<string, number>();
  for (const f of financials) {
    if (!clientIds.has(f.clientId)) continue;
    const key = `${f.clientId}|${f.month}`;
    revenueByClientMonth.set(key, (revenueByClientMonth.get(key) || 0) + f.amount);
  }

  // Time cost per client per month
  const timeCostByClientMonth = new Map<string, number>();
  const hoursByClientMonth = new Map<string, number>();
  for (const e of timeEntries) {
    if (!e.clientId || !clientIds.has(e.clientId)) continue;
    const month = toMonthKey(e.date);
    const key = `${e.clientId}|${month}`;
    const rate = e.teamMember ? (getEffectiveHourlyRate(e.teamMember) ?? blendedHourlyRate) : blendedHourlyRate;
    timeCostByClientMonth.set(key, (timeCostByClientMonth.get(key) || 0) + e.hours * rate);
    hoursByClientMonth.set(key, (hoursByClientMonth.get(key) || 0) + e.hours);
  }

  // Build per-month rows for each client
  const rows = activeClients
    .flatMap((c) =>
      monthRange.map((month) => {
        const key = `${c.id}|${month}`;
        const revenue = revenueByClientMonth.get(key) || 0;
        const timeCost = timeCostByClientMonth.get(key) || 0;
        const hours = hoursByClientMonth.get(key) || 0;
        const margin = revenue - timeCost;
        const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
        return {
          clientId: c.id,
          clientName: c.name,
          month,
          revenue: Math.round(revenue),
          timeCost: Math.round(timeCost),
          hours: Number(hours.toFixed(1)),
          margin: Math.round(margin),
          marginPercent: Number(marginPercent.toFixed(1)),
        };
      })
    )
    .filter((r) => r.revenue > 0 || r.timeCost > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalTimeCost = rows.reduce((s, r) => s + r.timeCost, 0);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  const totalMargin = totalRevenue - totalTimeCost;
  const avgMarginPercent =
    totalRevenue > 0
      ? Number(((totalMargin / totalRevenue) * 100).toFixed(1))
      : 0;

  // Monthly trend: revenue and time cost per month
  const monthlyTrend = monthRange.map((month) => {
    const monthRev = financials
      .filter((f) => f.month === month && clientIds.has(f.clientId))
      .reduce((s, f) => s + f.amount, 0);
    const monthTimeCost = timeEntries
      .filter((e) => e.clientId && clientIds.has(e.clientId) && toMonthKey(e.date) === month)
      .reduce((s, e) => {
        const rate = e.teamMember ? (getEffectiveHourlyRate(e.teamMember) ?? blendedHourlyRate) : blendedHourlyRate;
        return s + e.hours * rate;
      }, 0);
    const margin = monthRev - monthTimeCost;
    const marginPercent = monthRev > 0 ? Number(((margin / monthRev) * 100).toFixed(1)) : 0;
    return {
      month: formatMonth(month),
      revenue: Math.round(monthRev),
      timeCost: Math.round(monthTimeCost),
      marginPercent,
    };
  });

  return { clients: rows, totalRevenue, totalTimeCost, totalHours, avgMarginPercent, monthlyTrend };
}

// ---------------------------------------------------------------------------
// Holistic Client Margin — time-based cost only (simplified)
// ---------------------------------------------------------------------------

export async function getHolisticClientMargin(
  months = 6
): Promise<HolisticClientMarginData> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [
    excludedIds,
    clients,
    financials,
    timeEntries,
    teamMembers,
    settings,
  ] = await Promise.all([
    getExcludedClientIds(),
    db.client.findMany({
      where: { status: "active", hubspotDealId: { not: null } },
      select: { id: true, name: true },
    }),
    db.financialRecord.findMany({
      where: {
        month: { in: monthRange },
        type: { in: ["retainer", "project"] },
        source: "hubspot",
      },
      select: { clientId: true, amount: true, month: true },
    }),
    db.timeEntry.findMany({
      where: {
        date: { gte: startDate },
        isOverhead: false,
        clientId: { not: null },
      },
      select: {
        clientId: true,
        hours: true,
        date: true,
        teamMember: {
          select: {
            costType: true,
            hourlyRate: true,
            annualSalary: true,
            weeklyHours: true,
          },
        },
      },
    }),
    db.teamMember.findMany({
      where: { active: true },
      select: {
        costType: true,
        hourlyRate: true,
        annualSalary: true,
        weeklyHours: true,
      },
    }),
    db.appSettings.findFirst(),
  ]);

  const activeClients = clients.filter((c) => !excludedIds.has(c.id));
  const clientIds = new Set(activeClients.map((c) => c.id));
  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

  // Blended hourly rate across all active team members
  let totalRate = 0;
  let rateCount = 0;
  for (const m of teamMembers) {
    const rate = getEffectiveHourlyRate(m);
    if (rate) {
      totalRate += rate;
      rateCount++;
    }
  }
  const blendedHourlyRate = rateCount > 0 ? totalRate / rateCount : 50;

  // Revenue per client per month (ex-GST)
  const revenueByClientMonth = new Map<string, number>();
  for (const f of financials) {
    if (!clientIds.has(f.clientId)) continue;
    const key = `${f.clientId}|${f.month}`;
    revenueByClientMonth.set(key, (revenueByClientMonth.get(key) || 0) + f.amount);
  }

  // Time cost per client per month (use blended rate as fallback)
  const timeCostByClientMonth = new Map<string, number>();
  for (const e of timeEntries) {
    if (!e.clientId || !clientIds.has(e.clientId)) continue;
    const month = toMonthKey(e.date);
    const key = `${e.clientId}|${month}`;
    const rate = e.teamMember ? (getEffectiveHourlyRate(e.teamMember) ?? blendedHourlyRate) : blendedHourlyRate;
    timeCostByClientMonth.set(key, (timeCostByClientMonth.get(key) || 0) + e.hours * rate);
  }

  // Build per-month rows for each client
  const rows = activeClients
    .flatMap((c) =>
      monthRange.map((month) => {
        const key = `${c.id}|${month}`;
        const revenue = revenueByClientMonth.get(key) || 0;
        const timeCost = timeCostByClientMonth.get(key) || 0;
        const totalCost = timeCost;
        const margin = revenue - totalCost;
        const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
        return {
          clientId: c.id,
          clientName: c.name,
          month,
          revenue: Math.round(revenue),
          timeCost: Math.round(timeCost),
          totalCost: Math.round(totalCost),
          margin: Math.round(margin),
          marginPercent: Number(marginPercent.toFixed(1)),
        };
      })
    )
    .filter((r) => r.revenue > 0 || r.totalCost > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalMargin = totalRevenue - totalCost;
  const avgMarginPercent =
    totalRevenue > 0
      ? Number(((totalMargin / totalRevenue) * 100).toFixed(1))
      : 0;

  return {
    clients: rows,
    totalRevenue,
    totalCost,
    avgMarginPercent,
    blendedHourlyRate: Number(blendedHourlyRate.toFixed(0)),
  };
}

// ---------------------------------------------------------------------------
// Monthly Churn Rate
// ---------------------------------------------------------------------------

export async function getMonthlyChurn(
  months = 12
): Promise<MonthlyChurnData> {
  const monthRange = getMonthRange(months);

  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    // Deal-based churn: a deal churns in its churnDate month. Keying off
    // Client.endDate missed churn the client record wasn't updated for (e.g.
    // June's Chill Chair / mycar / Stockspot, which have a deal churnDate but
    // no client endDate).
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { clientId: true, name: true, amount: true, amountExGst: true, startDate: true, closeDate: true, churnDate: true },
    }),
  ]);

  const visible = deals.filter((d) => !(d.clientId && excludedIds.has(d.clientId)));
  const ex = (d: { amountExGst: number | null; amount: number | null }) => Math.round(d.amountExGst ?? d.amount ?? 0);
  const mk = (d: Date | null | undefined): string | null => (d ? toMonthKey(new Date(d)) : null);

  const rows = monthRange.map((month) => {
    // Active at start of month: a deal that started by this month and hasn't
    // churned before it.
    const activeAtStart = visible.filter((d) => {
      const sk = mk(d.startDate ?? d.closeDate);
      if (!sk || sk > month) return false;
      const ck = mk(d.churnDate);
      return !ck || ck >= month;
    }).length;

    // Churned this month: a deal whose churnDate falls in this month.
    const churnedDeals = visible.filter((d) => mk(d.churnDate) === month);
    const churned = churnedDeals.length;
    const churnPercent =
      activeAtStart > 0 ? Number(((churned / activeAtStart) * 100).toFixed(1)) : 0;
    const churnedClientList = churnedDeals
      .map((d) => ({ name: d.name, revenue: ex(d) }))
      .sort((a, b) => b.revenue - a.revenue);
    const churnedRevenue = churnedClientList.reduce((s, c) => s + c.revenue, 0);

    return {
      month,
      activeAtStart,
      churned,
      churnPercent,
      churnedRevenue,
      churnedClientList,
    };
  });

  const monthsWithActivity = rows.filter((r) => r.activeAtStart > 0);
  const avgChurnPercent =
    monthsWithActivity.length > 0
      ? Number(
          (
            monthsWithActivity.reduce((s, r) => s + r.churnPercent, 0) /
            monthsWithActivity.length
          ).toFixed(1)
        )
      : 0;
  const totalChurned = rows.reduce((s, r) => s + r.churned, 0);

  return { months: rows, avgChurnPercent, totalChurned };
}
