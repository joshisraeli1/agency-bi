import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { formatCurrency, formatMonth } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { MichaelCharts } from "@/components/dashboard/michael-charts";
import { MichaelGoals } from "@/components/dashboard/michael-goals";
import { DollarSign, TrendingUp, FileCheck, FilePlus } from "lucide-react";

export default async function MichaelPage() {
  const data = await getMichaelSalesData();

  const revenueChartData = data.monthlyRevenue.map((m) => ({
    month: formatMonth(m.month),
    revenue: Math.round(m.value),
    deals: (data.mrrDealsByMonth[m.month] ?? []).map((d) => ({ name: d.name, amount: Math.round(d.amount) })),
  }));

  const newRevenueChartData = data.newRevenuePerMonth.map((m) => ({
    month: formatMonth(m.month),
    newRevenue: Math.round(m.value),
    deals: (data.newRevenueDealsByMonth[m.month] ?? []).map((d) => ({ name: d.name, amount: Math.round(d.amount) })),
  }));

  const dealsCreatedChartData = data.dealsCreatedPerMonth.map((m) => ({
    month: formatMonth(m.month),
    deals: m.value,
    dealList: (data.createdDealsByMonth[m.month] ?? []).map((d) => ({ name: d.name, amount: Math.round(d.amount) })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.ownerName}</h1>
        <p className="text-muted-foreground mt-1">Sales activity · last 24 months</p>
      </div>

      <MichaelGoals goals={data.goals} progress={data.progress} />

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

      <MichaelCharts
        revenueData={revenueChartData}
        newRevenueData={newRevenueChartData}
        dealsCreatedData={dealsCreatedChartData}
        mrrGoal={data.goals.recurringRevenue}
        dealsGoal={data.goals.dealsCreated.monthly}
        newRevGoal={data.goals.newRevenue.monthly}
      />
    </div>
  );
}
