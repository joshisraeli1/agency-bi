"use client";

import Link from "next/link";
import { BarChartCard } from "@/components/charts/bar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth } from "@/lib/utils";
import type { CommunicationOverview } from "@/lib/analytics/types";

interface Props {
  data: CommunicationOverview;
}

export function CommunicationCharts({ data }: Props) {
  const trendData = data.monthlyTrend.map((m) => ({
    month: formatMonth(m.month),
    messages: m.count,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BarChartCard
        title="Message Volume Trend"
        data={trendData}
        xKey="month"
        yKeys={["messages"]}
        yLabels={["Messages"]}
      />
      {data.topClients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Clients by Messages</CardTitle>
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
                    {client.messageCount} messages
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
