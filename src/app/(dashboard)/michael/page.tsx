import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { formatMonth } from "@/lib/utils";
import { MichaelCharts } from "@/components/dashboard/michael-charts";
import { MichaelGoals } from "@/components/dashboard/michael-goals";
import { MichaelTiles } from "@/components/dashboard/michael-tiles";
import { MichaelPipelineChart } from "@/components/dashboard/michael-pipeline-chart";

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

      <MichaelTiles
        currentMrr={data.currentMrr}
        currentMrrDeals={data.currentMrrDeals}
        lifetimeRevenue={data.lifetimeRevenue}
        lifetimeDeals={data.lifetimeDeals}
        activeDealCount={data.activeDealCount}
        activeDeals={data.activeDeals}
        dealsCreatedLast12mo={data.dealsCreatedLast12mo}
        dealsCreated12moDeals={data.dealsCreated12moDeals}
      />

      <MichaelPipelineChart data={data.pipeline} />

      <MichaelGoals goals={data.goals} progress={data.progress} />

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
