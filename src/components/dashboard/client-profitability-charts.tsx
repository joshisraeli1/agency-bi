"use client";

import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { ClientProfitability } from "@/lib/analytics/types";

interface Props {
  data: ClientProfitability;
}

export function ClientProfitabilityCharts({ data }: Props) {
  const trendData = data.monthlyTrend.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  const teamData = data.teamBreakdown.map((t) => ({
    name: t.memberName,
    hours: Number(t.hours.toFixed(1)),
    cost: Number(t.cost.toFixed(0)),
  }));

  const statusData = Object.entries(data.deliverableStats.byStatus).map(
    ([name, value]) => ({ name, value })
  );

  const fmtCurrency = (v: number) => formatCurrency(v);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <LineChartCard
        title="Revenue vs Cost Trend"
        data={trendData}
        xKey="month"
        yKeys={["revenue", "cost", "margin"]}
        yLabels={["Revenue", "Cost", "Margin"]}
        formatY={fmtCurrency}
      />
      <BarChartCard
        title="Hours by Team Member"
        data={teamData}
        xKey="name"
        yKeys={["hours"]}
        yLabels={["Hours"]}
        horizontal
        formatY={(v) => `${v}h`}
      />
      {statusData.length > 0 && (
        <PieChartCard
          title="Deliverables by Status"
          data={statusData}
        />
      )}
    </div>
  );
}
