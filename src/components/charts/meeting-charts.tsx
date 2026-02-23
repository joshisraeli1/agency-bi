"use client";

import Link from "next/link";
import { BarChartCard } from "@/components/charts/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth } from "@/lib/utils";
import type { MeetingOverview } from "@/lib/analytics/types";

interface Props {
  data: MeetingOverview;
}

export function MeetingCharts({ data }: Props) {
  const trendData = data.monthlyTrend.map((m) => ({
    month: formatMonth(m.month),
    meetings: m.count,
    hours: m.hours,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BarChartCard
        title="Meeting Volume Trend"
        data={trendData}
        xKey="month"
        yKeys={["meetings", "hours"]}
        yLabels={["Meetings", "Hours"]}
      />
      {data.topClients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Clients by Meeting Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.topClients.map((client) => (
                <div
                  key={client.clientId}
                  className="flex items-center justify-between text-sm"
                >
                  <Link
                    href={`/clients/${client.clientId}`}
                    className="font-medium hover:underline"
                  >
                    {client.clientName}
                  </Link>
                  <span className="text-muted-foreground">
                    {client.meetingCount} meetings &middot; {client.totalHours}h
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
