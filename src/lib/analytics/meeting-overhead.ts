import { db } from "@/lib/db";
import { getMonthRange, toMonthKey } from "@/lib/utils";
import type { MeetingOverview } from "./types";

export async function getMeetingOverview(
  months = 6
): Promise<MeetingOverview> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [meetings, unattributed] = await Promise.all([
    db.meetingLog.findMany({
      where: { date: { gte: startDate } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    }),
    db.meetingLog.count({
      where: { date: { gte: startDate }, clientId: null },
    }),
  ]);

  const totalMeetings = meetings.length;
  const totalMinutes = meetings.reduce((sum, m) => sum + (m.duration || 0), 0);
  const totalHours = totalMinutes / 60;
  const avgDuration = totalMeetings > 0 ? totalMinutes / totalMeetings : 0;

  // Group by client
  const clientMap = new Map<
    string,
    { clientName: string; count: number; minutes: number }
  >();
  for (const mtg of meetings) {
    if (!mtg.clientId) continue;
    const existing = clientMap.get(mtg.clientId);
    if (existing) {
      existing.count++;
      existing.minutes += mtg.duration || 0;
    } else {
      clientMap.set(mtg.clientId, {
        clientName: mtg.client?.name || "Unknown",
        count: 1,
        minutes: mtg.duration || 0,
      });
    }
  }

  const totalClients = clientMap.size;
  const avgMeetingsPerClient =
    totalClients > 0 ? totalMeetings / totalClients : 0;

  const topClients = Array.from(clientMap.entries())
    .map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      meetingCount: data.count,
      totalHours: Number((data.minutes / 60).toFixed(1)),
    }))
    .sort((a, b) => b.totalHours - a.totalHours)
    .slice(0, 10);

  // Monthly trend
  const monthData = new Map<string, { count: number; minutes: number }>();
  for (const m of monthRange) {
    monthData.set(m, { count: 0, minutes: 0 });
  }
  for (const mtg of meetings) {
    const key = toMonthKey(mtg.date);
    const existing = monthData.get(key);
    if (existing) {
      existing.count++;
      existing.minutes += mtg.duration || 0;
    }
  }

  const monthlyTrend = monthRange.map((month) => {
    const data = monthData.get(month) || { count: 0, minutes: 0 };
    return {
      month,
      count: data.count,
      hours: Number((data.minutes / 60).toFixed(1)),
    };
  });

  return {
    totalMeetings,
    totalHours: Number(totalHours.toFixed(1)),
    totalClients,
    avgMeetingsPerClient,
    avgDuration: Number(avgDuration.toFixed(0)),
    topClients,
    monthlyTrend,
    unattributedCount: unattributed,
  };
}
