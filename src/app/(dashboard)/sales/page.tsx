import { redirect } from "next/navigation";
import { getSession, isDivisionLead, isSalesLead, hasRole } from "@/lib/auth";
import { SALESPEOPLE, salespersonByEmail } from "@/lib/analytics/salespeople";
import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { getCommissionSales } from "@/lib/analytics/commission-sales";
import { getSalesActivity } from "@/lib/analytics/sales-activity";
import { getMeetingsBooked } from "@/lib/analytics/meetings-booked";
import { SalesTeamView } from "@/components/dashboard/sales-team-view";
import { RANGES, type RangeKey } from "@/lib/sales-ranges";
import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The sales team side by side.
 *
 * Leadership only. A salesperson is sent to their own board instead — this page
 * shows everyone's numbers against each other, which is not theirs to see.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range: RangeKey = RANGES.some((r) => r.key === rangeParam) ? (rangeParam as RangeKey) : "30d";
  const rangeDays = RANGES.find((r) => r.key === range)!.days;
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (rangeDays - 1));

  const session = await getSession();
  if (!session) redirect("/login");
  if (isDivisionLead(session)) redirect("/division");
  if (isSalesLead(session)) {
    const own = salespersonByEmail(session.email);
    redirect(own ? `/sales/${own.slug}` : "/");
  }
  if (!hasRole(session, "manager")) redirect("/");

  // Each person is summarised on the measures they SHARE — revenue booked,
  // deals created, pipeline, activity. Their goal models differ, so the
  // comparison deliberately stops short of "progress to target", which would
  // mean comparing a revenue target against a signing count.
  const people = await Promise.all(
    SALESPEOPLE.map(async (p) => {
      const [sales, activity, meetings, windowActivity] = await Promise.all([
        getMichaelSalesData(p.ownerId, p.name),
        getSalesActivity(52, p.ownerId),
        getMeetingsBooked(30, p.ownerId),
        // Counted straight from the activity table so the window is exact to the
        // day — the weekly buckets would round 30 days to whole weeks.
        db.hubspotActivity.groupBy({
          by: ["type"],
          where: {
            ownerId: p.ownerId,
            timestamp: { gte: since },
            // Received email isn't outreach. Spelled as an OR because a bare NOT
            // also drops rows whose direction is null — most calls and meetings.
            OR: [{ direction: null }, { direction: { not: "INCOMING_EMAIL" } }],
          },
          _count: { _all: true },
        }),
      ]);
      const countOf = (type: string) => windowActivity.find((r) => r.type === type)?._count._all ?? 0;
      const byLabel = (byMonth: Record<string, { name: string; amount: number }[]>) =>
        Object.fromEntries(
          Object.entries(byMonth).map(([month, deals]) => [
            formatMonth(month),
            [...deals].sort((a, b) => b.amount - a.amount),
          ])
        );
      const commission = p.goalModel === "commission" ? await getCommissionSales(p) : null;
      const recentWeeks = activity.weeks.slice(-12);
      return {
        slug: p.slug,
        name: p.name,
        goalModel: p.goalModel,
        currentMrr: Math.round(sales.currentMrr),
        lifetimeRevenue: Math.round(sales.lifetimeRevenue),
        activeDealCount: sales.activeDealCount,
        pipelineValue: commission
          ? commission.pipelineValue
          : Math.round(sales.pipeline.reduce((s, x) => s + x.value, 0)),
        window: {
          dealsCreated: sales.createdDealDates.filter((d) => new Date(d) >= since).length,
          meetings: countOf("meeting"),
          calls: countOf("call"),
          emails: countOf("email"),
        },
        newRevenueDealsByLabel: byLabel(sales.newRevenueDealsByMonth),
        createdDealsByLabel: byLabel(sales.createdDealsByMonth),
        newRevenuePerMonth: sales.newRevenuePerMonth,
        dealsCreatedPerMonth: sales.dealsCreatedPerMonth,
        // Last 12 weeks only: outreach is compared week to week, and a year of
        // weekly bars for two people is unreadable.
        activityWeeks: recentWeeks.map((w) => ({
          label: w.label,
          calls: w.calls ?? 0,
          emails: w.emails ?? 0,
        })),
        signed: commission?.signed ?? null,
        signingTarget: commission?.target ?? null,
        meetingDays: meetings.days.map((d) => ({
          label: d.label,
          booked: d.booked,
          meetings: d.meetings.map((m) => ({ client: m.client, scheduledFor: m.scheduledFor })),
        })),
      };
    })
  );

  return <SalesTeamView people={people} range={range} />;
}
