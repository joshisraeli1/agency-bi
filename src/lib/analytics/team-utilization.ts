import { db } from "@/lib/db";
import { getMonthRange, getEffectiveHourlyRate, toMonthKey } from "@/lib/utils";
import type { TeamMemberUtilization } from "./types";

export async function getTeamMemberUtilization(
  memberId: string,
  months = 6
): Promise<TeamMemberUtilization> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [member, timeEntries, settings] = await Promise.all([
    db.teamMember.findUniqueOrThrow({ where: { id: memberId } }),
    db.timeEntry.findMany({
      where: { teamMemberId: memberId, date: { gte: startDate } },
      include: { client: true },
    }),
    db.appSettings.findFirst(),
  ]);

  const productiveHoursPerDay = settings?.productiveHours || 6.5;
  const workingDaysPerMonth = 22;
  const availableHoursPerMonth = productiveHoursPerDay * workingDaysPerMonth;

  let totalHours = 0;
  let billableHours = 0;
  let overheadHours = 0;

  const clientMap = new Map<
    string,
    { clientId: string; clientName: string; hours: number }
  >();

  const monthlyMap = new Map<
    string,
    { hours: number; billableHours: number; overheadHours: number }
  >();

  for (const entry of timeEntries) {
    totalHours += entry.hours;
    if (entry.isOverhead) {
      overheadHours += entry.hours;
    } else {
      billableHours += entry.hours;
    }

    // Client allocation
    if (entry.clientId && entry.client) {
      const existing = clientMap.get(entry.clientId) || {
        clientId: entry.clientId,
        clientName: entry.client.name,
        hours: 0,
      };
      existing.hours += entry.hours;
      clientMap.set(entry.clientId, existing);
    }

    // Monthly tracking
    const monthKey = toMonthKey(entry.date);
    const monthData = monthlyMap.get(monthKey) || {
      hours: 0,
      billableHours: 0,
      overheadHours: 0,
    };
    monthData.hours += entry.hours;
    if (entry.isOverhead) {
      monthData.overheadHours += entry.hours;
    } else {
      monthData.billableHours += entry.hours;
    }
    monthlyMap.set(monthKey, monthData);
  }

  const utilizationRate =
    months > 0
      ? (billableHours / (availableHoursPerMonth * months)) * 100
      : 0;

  const clientAllocation = Array.from(clientMap.values())
    .map((c) => ({
      ...c,
      percent: totalHours > 0 ? (c.hours / totalHours) * 100 : 0,
    }))
    .sort((a, b) => b.hours - a.hours);

  const monthlyTrend = monthRange.map((month) => {
    const data = monthlyMap.get(month) || {
      hours: 0,
      billableHours: 0,
      overheadHours: 0,
    };
    return { month, ...data };
  });

  return {
    memberId: member.id,
    memberName: member.name,
    role: member.role,
    division: member.division,
    employmentType: member.employmentType,
    effectiveRate: getEffectiveHourlyRate(member),
    totalHours,
    billableHours,
    overheadHours,
    utilizationRate,
    clientAllocation,
    monthlyTrend,
  };
}
