import { redirect, notFound } from "next/navigation";
import { getSession, isDivisionLead, isSalesLead, hasRole } from "@/lib/auth";
import { salespersonBySlug, salespersonByEmail } from "@/lib/analytics/salespeople";
import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { getSalesActivity } from "@/lib/analytics/sales-activity";
import { getCallActivity } from "@/lib/analytics/call-activity";
import { getCommissionSales } from "@/lib/analytics/commission-sales";
import { CommissionSalesView } from "@/components/dashboard/commission-sales-view";
import { SalesPersonBoard } from "@/components/dashboard/sales-person-board";

export const dynamic = "force-dynamic";

/**
 * One salesperson's board.
 *
 * A sales_lead only ever sees their OWN, whatever slug they type — the same
 * fail-closed rule the divisional dashboards use. Leadership may open anyone's.
 */
export default async function SalesPersonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isDivisionLead(session)) redirect("/division");

  const { slug } = await params;
  const requested = salespersonBySlug(slug);
  if (!requested) notFound();

  const own = salespersonByEmail(session.email);
  if (isSalesLead(session)) {
    if (!own) redirect("/");
    if (own.slug !== requested.slug) redirect(`/sales/${own.slug}`);
  } else if (!hasRole(session, "viewer")) {
    redirect("/");
  }

  const person = requested;

  if (person.goalModel === "commission") {
    const [commission, activity, calls] = await Promise.all([
      getCommissionSales(person),
      getSalesActivity(52, person.ownerId),
      getCallActivity(90, person.ownerId),
    ]);
    return (
      <CommissionSalesView data={commission} activity={activity} callActivity={calls} />
    );
  }

  const [data, activity, callActivity] = await Promise.all([
    getMichaelSalesData(person.ownerId, person.name),
    getSalesActivity(52, person.ownerId),
    getCallActivity(90, person.ownerId),
  ]);
  return <SalesPersonBoard data={data} activity={activity} callActivity={callActivity} />;
}
