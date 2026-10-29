import { redirect } from "next/navigation";
import { getSession, isDivisionLead, isSalesLead, hasRole } from "@/lib/auth";
import { SALESPEOPLE, salespersonByEmail } from "@/lib/analytics/salespeople";
import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { getCommissionSales } from "@/lib/analytics/commission-sales";
import { getSalesActivity } from "@/lib/analytics/sales-activity";
import { getMeetingsBooked } from "@/lib/analytics/meetings-booked";
import { SalesTeamView } from "@/components/dashboard/sales-team-view";

export const dynamic = "force-dynamic";

/**
 * The sales team side by side.
 *
 * Leadership only. A salesperson is sent to their own board instead — this page
 * shows everyone's numbers against each other, which is not theirs to see.
 */
export default async function SalesPage() {
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
      const [sales, activity, meetings] = await Promise.all([
        getMichaelSalesData(p.ownerId, p.name),
        getSalesActivity(52, p.ownerId),
        getMeetingsBooked(30, p.ownerId),
      ]);
      const commission = p.goalModel === "commission" ? await getCommissionSales(p) : null;
      const recentWeeks = activity.weeks.slice(-12);
      return {
        slug: p.slug,
        name: p.name,
        goalModel: p.goalModel,
        currentMrr: Math.round(sales.currentMrr),
        lifetimeRevenue: Math.round(sales.lifetimeRevenue),
        activeDealCount: sales.activeDealCount,
        dealsCreatedLast12mo: sales.dealsCreatedLast12mo,
        pipelineValue: commission
          ? commission.pipelineValue
          : Math.round(sales.pipeline.reduce((s, x) => s + x.value, 0)),
        calls: recentWeeks.reduce((s, w) => s + (w.calls ?? 0), 0),
        emails: recentWeeks.reduce((s, w) => s + (w.emails ?? 0), 0),
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
        meetingsBooked: meetings.total,
        meetingDays: meetings.days.map((d) => ({ label: d.label, booked: d.booked })),
      };
    })
  );

  return <SalesTeamView people={people} />;
}
