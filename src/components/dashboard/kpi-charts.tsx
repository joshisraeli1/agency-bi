"use client";

import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { AgencyKPIs } from "@/lib/analytics/types";

interface Props {
  data: AgencyKPIs;
}

const EXCLUDED_DIVISIONS = ["Unassigned", "NA", "Sales"];

export function KpiCharts({ data }: Props) {
  const trendData = data.monthlyTrend.map((m) => ({
    ...m,
    month: formatMonth(m.month),
    utilization: Number(m.utilization.toFixed(1)),
    margin: Number(m.margin.toFixed(1)),
  }));

  const divisionData = data.hoursByDivision
    .filter((d) => !EXCLUDED_DIVISIONS.includes(d.division))
    .map((d) => ({
      name: d.division,
      hours: Number(d.hours.toFixed(1)),
    }));

  const divisionMarginKeys = data.divisionMarginTrend.length > 0
    ? Object.keys(data.divisionMarginTrend[0]).filter(
        (k) => k !== "month" && !EXCLUDED_DIVISIONS.includes(k)
      )
    : [];

  const industryData = data.clientLTVByIndustry.map((d) => ({
    name: d.industry,
    revenue: d.revenue,
  }));

  const ltvDivisionData = data.clientLTVByDivision
    .filter((d) => !EXCLUDED_DIVISIONS.includes(d.division))
    .map((d) => ({
      name: d.division,
      value: d.revenue,
    }));

  return (
    <div className="space-y-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.marginByDivision.length > 0 && (
          <BarChartCard
            title="Margin by Division"
            data={data.marginByDivision.filter((d) => !EXCLUDED_DIVISIONS.includes(d.division))}
            xKey="division"
            yKeys={["revenue", "cost"]}
            yLabels={["Revenue", "Cost"]}
            formatY={(v) => formatCurrency(v)}
          />
        )}
        {divisionMarginKeys.length > 0 && (
          <LineChartCard
            title="Division Margin Over Time"
            data={data.divisionMarginTrend}
            xKey="month"
            yKeys={divisionMarginKeys}
            yLabels={divisionMarginKeys}
            formatY={(v) => `${v}%`}
          />
        )}
        {industryData.length > 0 && (
          <BarChartCard
            title="Client Revenue by Industry"
            data={industryData}
            xKey="name"
            yKeys={["revenue"]}
            yLabels={["Revenue"]}
            horizontal
            formatY={(v) => formatCurrency(v)}
          />
        )}
        {ltvDivisionData.length > 0 && (
          <PieChartCard
            title="Client Revenue by Division"
            data={ltvDivisionData}
            donut
            formatValue={(v) => formatCurrency(v)}
          />
        )}
      </div>
    </div>
  );
}
