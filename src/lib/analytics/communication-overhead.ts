import { db } from "@/lib/db";
import { getMonthRange, toMonthKey } from "@/lib/utils";
import type { CommunicationOverview } from "./types";

export async function getCommunicationOverview(
  months = 6
): Promise<CommunicationOverview> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [messages, unattributed] = await Promise.all([
    db.communicationLog.findMany({
      where: { date: { gte: startDate } },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { date: "desc" },
    }),
    db.communicationLog.count({
      where: { date: { gte: startDate }, clientId: "" },
    }),
  ]);

  const totalMessages = messages.length;

  // Group by client
  const clientMap = new Map<
    string,
    { clientName: string; count: number; latestDate: Date }
  >();
  for (const msg of messages) {
    if (!msg.clientId) continue;
    const existing = clientMap.get(msg.clientId);
    if (existing) {
      existing.count++;
      if (msg.date > existing.latestDate) existing.latestDate = msg.date;
    } else {
      clientMap.set(msg.clientId, {
        clientName: msg.client?.name || "Unknown",
        count: 1,
        latestDate: msg.date,
      });
    }
  }

  const totalClients = clientMap.size;
  const avgMessagesPerClient =
    totalClients > 0 ? totalMessages / totalClients : 0;

  const topClients = Array.from(clientMap.entries())
    .map(([clientId, data]) => ({
      clientId,
      clientName: data.clientName,
      messageCount: data.count,
      latestDate: data.latestDate,
    }))
    .sort((a, b) => b.messageCount - a.messageCount)
    .slice(0, 10);

  // Monthly trend
  const monthCounts = new Map<string, number>();
  for (const m of monthRange) {
    monthCounts.set(m, 0);
  }
  for (const msg of messages) {
    const key = toMonthKey(msg.date);
    if (monthCounts.has(key)) {
      monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
    }
  }

  const monthlyTrend = monthRange.map((month) => ({
    month,
    count: monthCounts.get(month) || 0,
  }));

  return {
    totalMessages,
    totalClients,
    avgMessagesPerClient,
    topClients,
    monthlyTrend,
    unattributedCount: unattributed,
  };
}
