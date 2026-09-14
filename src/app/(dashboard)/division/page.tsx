import { redirect } from "next/navigation";
import { getSession, isDivisionLead, hasRole } from "@/lib/auth";
import { getDivisionDashboard } from "@/lib/analytics/division-dashboard";
import { DivisionDashboardView } from "@/components/dashboard/division-dashboard-view";
import { divisionDisplayName, isDivisionKey, DIVISION_KEYS } from "@/lib/divisions";

export const dynamic = "force-dynamic";

/**
 * A divisional leader's dashboard.
 *
 * The division is resolved from the SESSION, never from the URL — a lead who
 * edits ?d= still gets their own division. Admins may pass ?d= to preview any
 * division, which is what makes this page reviewable without a lead's login.
 *
 * Fails closed: a lead with no division assigned is sent to /login rather than
 * shown an unscoped view.
 */
export default async function DivisionPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  let division: string | null = null;

  if (isDivisionLead(session)) {
    division = isDivisionKey(session.division) ? session.division : null;
  } else if (hasRole(session, "viewer")) {
    const { d } = await searchParams;
    division = isDivisionKey(d) ? d : DIVISION_KEYS[0];
  }

  if (!division) redirect("/login");

  const data = await getDivisionDashboard(division, 12);

  return <DivisionDashboardView data={data} displayName={divisionDisplayName(division)} />;
}
