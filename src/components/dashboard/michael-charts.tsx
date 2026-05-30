"use client";

import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { formatCurrency } from "@/lib/utils";

interface Props {
  revenueData: { month: string; revenue: number }[];
  newRevenueData: { month: string; newRevenue: number }[];
  dealsCreatedData: { month: string; deals: number }[];
}

export function MichaelCharts({
  revenueData,
  newRevenueData,
  dealsCreatedData,
}: Props) {
  return (
    <>
      <LineChartCard
        title="Monthly Recurring Revenue — line"
        data={revenueData}
        xKey="month"
        yKeys={["revenue"]}
        yLabels={["MRR"]}
        formatY={(v) => formatCurrency(v)}
        height={320}
      />

      <BarChartCard
        title="Monthly Recurring Revenue — bar"
        data={revenueData}
        xKey="month"
        yKeys={["revenue"]}
        yLabels={["MRR"]}
        formatY={(v) => formatCurrency(v)}
        height={320}
      />

      <BarChartCard
        title="New Revenue Won per Month"
        data={newRevenueData}
        xKey="month"
        yKeys={["newRevenue"]}
        yLabels={["New Revenue"]}
        formatY={(v) => formatCurrency(v)}
        height={320}
      />

      <BarChartCard
        title="New Deals Created per Month"
        data={dealsCreatedData}
        xKey="month"
        yKeys={["deals"]}
        yLabels={["Deals Created"]}
        height={320}
      />
    </>
  );
}
