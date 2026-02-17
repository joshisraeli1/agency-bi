"use client";

import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { formatMonth } from "@/lib/utils";
import type { AgencyKPIs } from "@/lib/analytics/types";

interface Props {
  data: AgencyKPIs;
}

export function KpiCharts({ data }: Props) {
  const trendData = data.monthlyTrend.map((m) => ({
    ...m,
    month: formatMonth(m.month),
    utilization: Number(m.utilization.toFixed(1)),
    margin: Number(m.margin.toFixed(1)),
  }));

  const divisionData = data.hoursByDivision.map((d) => ({
    name: d.division,
    hours: Number(d.hours.toFixed(1)),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <LineChartCard
        title="Utilization & Margin Trend"
        data={trendData}
        xKey="month"
        yKeys={["utilization", "margin"]}
        yLabels={["Utilization %", "Margin %"]}
        formatY={(v) => `${v}%`}
      />
      {divisionData.length > 0 && (
        <BarChartCard
          title="Hours by Division"
          data={divisionData}
          xKey="name"
          yKeys={["hours"]}
          yLabels={["Hours"]}
          horizontal
          formatY={(v) => `${v}h`}
        />
      )}
    </div>
  );
}
