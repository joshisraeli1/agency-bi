import { formatMonth } from "@/lib/utils";
import { MichaelCharts } from "@/components/dashboard/michael-charts";
import { MichaelGoals } from "@/components/dashboard/michael-goals";
import { MichaelTiles } from "@/components/dashboard/michael-tiles";
import { MichaelPipelineChart } from "@/components/dashboard/michael-pipeline-chart";
import { MichaelCommissionSection } from "@/components/dashboard/michael-commission";
import { SalesActivityCharts } from "@/components/dashboard/sales-activity-charts";
import { CallActivityChart } from "@/components/dashboard/call-activity-chart";
import { MeetingsBookedChart } from "@/components/dashboard/meetings-booked-chart";
import type { MichaelSalesData } from "@/lib/analytics/michael-sales";
import type { SalesActivity } from "@/lib/analytics/sales-activity";
import type { CallActivity } from "@/lib/analytics/call-activity";
import type { MeetingsBooked } from "@/lib/analytics/meetings-booked";

/**
 * A revenue-targeted salesperson's board.
 *
 * Lifted out of the old /michael page unchanged so it can serve any owner —
 * the data function takes the owner now, and this renders whatever it is given.
 */
export function SalesPersonBoard({
  data,
  activity,
  callActivity,
  meetings,
}: {
  data: MichaelSalesData;
  activity: SalesActivity;
  callActivity: CallActivity;
  meetings: MeetingsBooked;
}) {
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

      <MichaelGoals goals={data.goals} progress={data.progress} />

      <MichaelCharts
        revenueData={revenueChartData}
        newRevenueData={newRevenueChartData}
        dealsCreatedData={dealsCreatedChartData}
        mrrGoal={data.goals.recurringRevenue}
        dealsGoal={data.goals.dealsCreated.monthly}
        newRevGoal={data.goals.newRevenue.monthly}
        slotBeforeNewRevenue={<MichaelPipelineChart data={data.pipeline} />}
      />

      {/* Outreach activity — weekly emails sent and calls logged */}
      <SalesActivityCharts weeks={activity.weeks} />

      {/* Daily dialler output and call outcomes */}
      <CallActivityChart data={callActivity} />

      <MeetingsBookedChart data={meetings} />

      <MichaelCommissionSection data={data.commission} />
    </div>
  );
}
