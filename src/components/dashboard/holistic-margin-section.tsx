"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
import { StatCard } from "@/components/charts/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { HolisticClientMarginData } from "@/lib/analytics/types";
import { DollarSign, TrendingUp, Calculator } from "lucide-react";

interface Props {
  data: HolisticClientMarginData;
}

export function HolisticMarginSection({ data }: Props) {
  if (data.clients.length === 0) return null;

  const marginChartData = data.clients
    .slice(0, 20)
    .map((c) => ({
      name: c.clientName,
      marginPercent: c.marginPercent,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Holistic Client Margin</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Revenue vs comprehensive cost (time + meetings + communications)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Holistic Cost"
          value={formatCurrency(data.totalCost)}
          icon={<Calculator className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(data.avgMarginPercent)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Blended Hourly Rate"
          value={formatCurrency(data.blendedHourlyRate)}
          description="Avg team member rate"
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Holistic Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Client</th>
                  <th className="text-right py-2 px-3 font-medium">Revenue</th>
                  <th className="text-right py-2 px-3 font-medium">Time Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Meeting Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Comm Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Creators</th>
                  <th className="text-right py-2 px-3 font-medium">Total Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {data.clients.map((c) => (
                  <tr key={c.clientId} className="border-b last:border-0">
                    <td className="py-2 px-3">{c.clientName}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.revenue)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.timeCost)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.meetingCost)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.commCost)}</td>
                    <td className="text-right py-2 px-3">{c.creatorCount}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.totalCost)}</td>
                    <td
                      className={`text-right py-2 px-3 font-medium ${c.marginPercent < 0 ? "text-red-600" : ""}`}
                    >
                      {c.marginPercent}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/50">
                  <td className="py-2 px-3 font-semibold">Total</td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(data.totalRevenue)}
                  </td>
                  <td colSpan={4} />
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(data.totalCost)}
                  </td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {data.avgMarginPercent}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <BarChartCard
        title="Holistic Margin by Client"
        data={marginChartData}
        xKey="name"
        yKeys={["marginPercent"]}
        yLabels={["Margin %"]}
        horizontal
        formatY={(v) => `${v}%`}
      />
    </div>
  );
}
