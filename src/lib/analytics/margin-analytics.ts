import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, formatMonth, getEffectiveHourlyRate } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import type {
  TimesheetClientMarginData,
  HolisticClientMarginData,
  MonthlyChurnData,
  RevenuePerAssetData,
} from "./types";

// ---------------------------------------------------------------------------
// Timesheet Client Margin — HubSpot revenue vs time-tracked cost
// ---------------------------------------------------------------------------

export async function getTimesheetClientMargin(
  months = 6
): Promise<TimesheetClientMarginData> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [excludedIds, clients, financials, timeEntries, settings] =
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
      db.appSettings.findFirst(),
    ]);

  const activeClients = clients.filter((c) => !excludedIds.has(c.id));
  const clientIds = new Set(activeClients.map((c) => c.id));
  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

  // Revenue per client (ex-GST)
  const revenueMap = new Map<string, number>();
  for (const f of financials) {
    if (!clientIds.has(f.clientId)) continue;
    revenueMap.set(
      f.clientId,
      (revenueMap.get(f.clientId) || 0) + f.amount / gstDivisor
    );
  }

  // Time cost per client
  const timeCostMap = new Map<string, number>();
  const hoursMap = new Map<string, number>();
  for (const e of timeEntries) {
    if (!e.clientId || !clientIds.has(e.clientId)) continue;
    const rate = e.teamMember ? getEffectiveHourlyRate(e.teamMember) : null;
    if (rate) {
      timeCostMap.set(
        e.clientId,
        (timeCostMap.get(e.clientId) || 0) + e.hours * rate
      );
    }
    hoursMap.set(
      e.clientId,
      (hoursMap.get(e.clientId) || 0) + e.hours
    );
  }

  const rows = activeClients
    .map((c) => {
      const revenue = revenueMap.get(c.id) || 0;
      const timeCost = timeCostMap.get(c.id) || 0;
      const hours = hoursMap.get(c.id) || 0;
      const margin = revenue - timeCost;
      const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
      return {
        clientId: c.id,
        clientName: c.name,
        revenue: Math.round(revenue),
        timeCost: Math.round(timeCost),
        hours: Number(hours.toFixed(1)),
        margin: Math.round(margin),
        marginPercent: Number(marginPercent.toFixed(1)),
      };
    })
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
      .reduce((s, f) => s + f.amount / gstDivisor, 0);
    const monthTimeCost = timeEntries
      .filter((e) => e.clientId && clientIds.has(e.clientId) && toMonthKey(e.date) === month)
      .reduce((s, e) => {
        const rate = e.teamMember ? getEffectiveHourlyRate(e.teamMember) : null;
        return s + (rate ? e.hours * rate : 0);
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
// Holistic Client Margin — time + meetings + comms + creators
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
    meetingSums,
    commCounts,
    deliverableAssignments,
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
      select: { clientId: true, amount: true },
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
    db.meetingLog.groupBy({
      by: ["clientId"],
      where: { date: { gte: startDate }, clientId: { not: null } },
      _sum: { duration: true },
    }),
    db.communicationLog.groupBy({
      by: ["clientId"],
      where: { date: { gte: startDate } },
      _count: true,
    }),
    db.deliverableAssignment.findMany({
      where: {
        deliverable: {
          client: { status: "active", hubspotDealId: { not: null } },
        },
      },
      select: {
        teamMemberId: true,
        deliverable: { select: { clientId: true } },
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

  // Revenue per client (ex-GST)
  const revenueMap = new Map<string, number>();
  for (const f of financials) {
    if (!clientIds.has(f.clientId)) continue;
    revenueMap.set(
      f.clientId,
      (revenueMap.get(f.clientId) || 0) + f.amount / gstDivisor
    );
  }

  // Time cost per client
  const timeCostMap = new Map<string, number>();
  for (const e of timeEntries) {
    if (!e.clientId || !clientIds.has(e.clientId)) continue;
    const rate = e.teamMember ? getEffectiveHourlyRate(e.teamMember) : null;
    if (rate) {
      timeCostMap.set(
        e.clientId,
        (timeCostMap.get(e.clientId) || 0) + e.hours * rate
      );
    }
  }

  // Meeting cost per client (meeting hours × blended rate)
  const meetingCostMap = new Map<string, number>();
  for (const m of meetingSums) {
    if (!m.clientId || !clientIds.has(m.clientId)) continue;
    const hours = (m._sum.duration || 0) / 60;
    meetingCostMap.set(m.clientId, hours * blendedHourlyRate);
  }

  // Comms cost per client (count × blended rate × 0.05h per message)
  const commCostMap = new Map<string, number>();
  for (const c of commCounts) {
    if (!clientIds.has(c.clientId)) continue;
    commCostMap.set(c.clientId, c._count * blendedHourlyRate * 0.05);
  }

  // Creator count per client (distinct teamMemberIds)
  const creatorMap = new Map<string, Set<string>>();
  for (const a of deliverableAssignments) {
    const cId = a.deliverable.clientId;
    if (!cId || !clientIds.has(cId)) continue;
    if (!creatorMap.has(cId)) creatorMap.set(cId, new Set());
    if (a.teamMemberId) creatorMap.get(cId)!.add(a.teamMemberId);
  }

  const rows = activeClients
    .map((c) => {
      const revenue = revenueMap.get(c.id) || 0;
      const timeCost = timeCostMap.get(c.id) || 0;
      const meetingCost = meetingCostMap.get(c.id) || 0;
      const commCost = commCostMap.get(c.id) || 0;
      const creatorCount = creatorMap.get(c.id)?.size || 0;
      const totalCost = timeCost + meetingCost + commCost;
      const margin = revenue - totalCost;
      const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
      return {
        clientId: c.id,
        clientName: c.name,
        revenue: Math.round(revenue),
        timeCost: Math.round(timeCost),
        meetingCost: Math.round(meetingCost),
        commCost: Math.round(commCost),
        creatorCount,
        totalCost: Math.round(totalCost),
        margin: Math.round(margin),
        marginPercent: Number(marginPercent.toFixed(1)),
      };
    })
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

  const [excludedIds, allClients] = await Promise.all([
    getExcludedClientIds(),
    db.client.findMany({
      where: {
        status: { not: "prospect" },
        hubspotDealId: { not: null },
        startDate: { not: null },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        retainerValue: true,
      },
    }),
  ]);

  const clients = allClients.filter((c) => !excludedIds.has(c.id));

  const rows = monthRange.map((month) => {
    const monthStart = new Date(`${month}-01`);
    const monthEnd = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0
    );

    // Active at start of month: started before month start AND not ended before month start
    const activeAtStart = clients.filter((c) => {
      if (!c.startDate) return false;
      const start = new Date(c.startDate);
      if (start > monthStart) return false;
      if (c.endDate) {
        const end = new Date(c.endDate);
        return end >= monthStart;
      }
      return true;
    }).length;

    // Churned this month: endDate falls in this month
    const churnedClients = clients.filter((c) => {
      if (!c.endDate) return false;
      return toMonthKey(new Date(c.endDate)) === month;
    });

    const churned = churnedClients.length;
    const churnPercent =
      activeAtStart > 0 ? Number(((churned / activeAtStart) * 100).toFixed(1)) : 0;
    const churnedRevenue = churnedClients.reduce(
      (s, c) => s + (c.retainerValue || 0),
      0
    );

    return {
      month,
      activeAtStart,
      churned,
      churnPercent,
      churnedRevenue: Math.round(churnedRevenue),
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

// ---------------------------------------------------------------------------
// Revenue Per Asset (Deliverable) — all active clients
// ---------------------------------------------------------------------------

export async function getRevenuePerAsset(): Promise<RevenuePerAssetData> {
  const [excludedIds, clients, financials, deliverables] = await Promise.all([
    getExcludedClientIds(),
    db.client.findMany({
      where: { status: "active", hubspotDealId: { not: null } },
      select: { id: true, name: true },
    }),
    db.financialRecord.findMany({
      where: { type: { in: ["retainer", "project"] } },
      select: { clientId: true, amount: true },
    }),
    db.deliverable.findMany({
      select: { clientId: true },
    }),
  ]);

  const activeClients = clients.filter((c) => !excludedIds.has(c.id));
  const clientIds = new Set(activeClients.map((c) => c.id));

  // Revenue per client
  const revenueMap = new Map<string, number>();
  for (const f of financials) {
    if (!clientIds.has(f.clientId)) continue;
    revenueMap.set(
      f.clientId,
      (revenueMap.get(f.clientId) || 0) + f.amount
    );
  }

  // Deliverable count per client
  const deliverableCountMap = new Map<string, number>();
  for (const d of deliverables) {
    if (!d.clientId || !clientIds.has(d.clientId)) continue;
    deliverableCountMap.set(
      d.clientId,
      (deliverableCountMap.get(d.clientId) || 0) + 1
    );
  }

  const rows = activeClients
    .map((c) => {
      const revenue = revenueMap.get(c.id) || 0;
      const deliverableCount = deliverableCountMap.get(c.id) || 0;
      const revenuePerDeliverable =
        deliverableCount > 0 ? Math.round(revenue / deliverableCount) : 0;
      return {
        clientId: c.id,
        clientName: c.name,
        revenue: Math.round(revenue),
        deliverableCount,
        revenuePerDeliverable,
      };
    })
    .filter((r) => r.deliverableCount > 0)
    .sort((a, b) => b.revenuePerDeliverable - a.revenuePerDeliverable);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalDeliverables = rows.reduce((s, r) => s + r.deliverableCount, 0);
  const avgRevenuePerDeliverable =
    totalDeliverables > 0 ? Math.round(totalRevenue / totalDeliverables) : 0;

  return { clients: rows, totalRevenue, totalDeliverables, avgRevenuePerDeliverable };
}
