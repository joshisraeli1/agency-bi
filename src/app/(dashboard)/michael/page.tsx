import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { formatCurrency, formatMonth } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { DollarSign, TrendingUp, FileCheck, FilePlus } from "lucide-react";

export default async function MichaelPage() {
  const data = await getMichaelSalesData();

  const revenueChartData = data.monthlyRevenue.map((m) => ({
    month: formatMonth(m.month),
    revenue: Math.round(m.value),
  }));

  const newRevenueChartData = data.newRevenuePerMonth.map((m) => ({
    month: formatMonth(m.month),
    newRevenue: Math.round(m.value),
  }));

  const dealsCreatedChartData = data.dealsCreatedPerMonth.map((m) => ({
    month: formatMonth(m.month),
    deals: m.value,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.ownerName}</h1>
        <p className="text-muted-foreground mt-1">Sales activity · last 24 months</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Current MRR"
          value={formatCurrency(data.currentMrr)}
          description="Recurring revenue this month"
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Lifetime Revenue"
          value={formatCurrency(data.lifetimeRevenue)}
          description="All-time recurring revenue owned"
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Deals"
          value={String(data.activeDealCount)}
          description="Closed-won, not churned"
          icon={<FileCheck className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Deals Created (12mo)"
          value={String(data.dealsCreatedLast12mo)}
          description="Added to pipeline"
          icon={<FilePlus className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <LineChartCard
        title="Monthly Recurring Revenue — line"
        data={revenueChartData}
        xKey="month"
        yKeys={["revenue"]}
        yLabels={["MRR"]}
        formatY={(v) => formatCurrency(v)}
        height={320}
      />

      <BarChartCard
        title="Monthly Recurring Revenue — bar"
        data={revenueChartData}
        xKey="month"
        yKeys={["revenue"]}
        yLabels={["MRR"]}
        formatY={(v) => formatCurrency(v)}
        height={320}
      />

      <BarChartCard
        title="New Revenue Won per Month"
        data={newRevenueChartData}
        xKey="month"
        yKeys={["newRevenue"]}
        yLabels={["New Revenue"]}
        formatY={(v) => formatCurrency(v)}
        height={320}
      />

      <BarChartCard
        title="New Deals Created per Month"
        data={dealsCreatedChartData}
        xKey="month"
        yKeys={["deals"]}
        yLabels={["Deals Created"]}
        height={320}
      />
    </div>
  );
}
