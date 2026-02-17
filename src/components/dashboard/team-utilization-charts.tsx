"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { formatMonth } from "@/lib/utils";
import type { TeamMemberUtilization } from "@/lib/analytics/types";

interface Props {
  data: TeamMemberUtilization;
}

export function TeamUtilizationCharts({ data }: Props) {
  const monthlyData = data.monthlyTrend.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  const allocationData = data.clientAllocation.map((c) => ({
    name: c.clientName,
    value: Number(c.hours.toFixed(1)),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <BarChartCard
        title="Monthly Hours"
        data={monthlyData}
        xKey="month"
        yKeys={["billableHours", "overheadHours"]}
        yLabels={["Billable", "Overhead"]}
        stacked
        formatY={(v) => `${v}h`}
      />
      {allocationData.length > 0 && (
        <PieChartCard
          title="Client Allocation"
          data={allocationData}
          formatValue={(v) => `${v}h`}
        />
      )}
    </div>
  );
}
