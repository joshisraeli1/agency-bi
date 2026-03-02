"use client";

import { ComboChartCard } from "@/components/charts/combo-chart";
import { StatCard } from "@/components/charts/stat-card";
import { formatMonth, formatCurrency, formatPercent } from "@/lib/utils";
import type { MonthlyChurnData } from "@/lib/analytics/types";
import { TrendingDown, Users } from "lucide-react";

interface Props {
  data: MonthlyChurnData;
}

export function ChurnRateSection({ data }: Props) {
  if (data.months.length === 0) return null;

  const chartData = data.months.map((m) => ({
    month: formatMonth(m.month),
    churnedRevenue: m.churnedRevenue,
    churnPercent: m.churnPercent,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Monthly Churn Rate</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Client churn rate and lost revenue over time
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Avg Monthly Churn"
          value={formatPercent(data.avgChurnPercent)}
          icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Churned Clients"
          value={String(data.totalChurned)}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <ComboChartCard
        title="Churn Rate & Lost Revenue"
        data={chartData}
        xKey="month"
        barKeys={["churnedRevenue"]}
        barLabels={["Churned Revenue"]}
        lineKey="churnPercent"
        lineLabel="Churn %"
        stacked={false}
        formatBar={(v) => formatCurrency(v)}
        formatLine={(v) => `${v}%`}
      />
    </div>
  );
}
