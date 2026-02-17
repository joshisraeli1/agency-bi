"use client";

import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { RevenueOverview } from "@/lib/analytics/types";

interface Props {
  data: RevenueOverview;
}

export function RevenueCharts({ data }: Props) {
  const trendData = data.monthlyTrend.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  const clientData = data.byClient.slice(0, 10).map((c) => ({
    name: c.clientName.length > 15 ? c.clientName.slice(0, 15) + "..." : c.clientName,
    revenue: Number(c.revenue.toFixed(0)),
    cost: Number(c.cost.toFixed(0)),
  }));

  const fmtCurrency = (v: number) => formatCurrency(v);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <LineChartCard
        title="Revenue Trend"
        data={trendData}
        xKey="month"
        yKeys={["revenue", "cost", "margin"]}
        yLabels={["Revenue", "Cost", "Margin"]}
        formatY={fmtCurrency}
      />
      <BarChartCard
        title="Revenue by Client"
        data={clientData}
        xKey="name"
        yKeys={["revenue", "cost"]}
        yLabels={["Revenue", "Cost"]}
        formatY={fmtCurrency}
      />
    </div>
  );
}
