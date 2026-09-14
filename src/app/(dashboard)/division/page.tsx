import { redirect } from "next/navigation";
import { getSession, isDivisionLead, hasRole } from "@/lib/auth";
import { getDivisionDashboard } from "@/lib/analytics/division-dashboard";
import { DivisionDashboardView } from "@/components/dashboard/division-dashboard-view";
import { computeGoalProgress, getDivisionBonusPlan } from "@/lib/analytics/division-goals";
import { divisionDisplayName, isDivisionKey, DIVISION_KEYS } from "@/lib/divisions";

export const dynamic = "force-dynamic";

/**
 * A divisional leader's dashboard.
 *
 * The division is resolved from the SESSION, never from the URL — a lead who
 * edits ?d= still gets their own division. Admins may pass ?d= to preview any
 * division, which is what makes this page reviewable without a lead's login.
 *
 * Fails closed: a lead whose division is missing or unrecognised is shown an
 * explanatory message, never an unscoped view. Bouncing them to /login would be
 * equally safe but baffling — they are signed in; it is the mapping that is wrong.
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

  if (!division) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-bold">No division assigned</h1>
        <p className="text-muted-foreground">
          Your account is signed in as <span className="font-medium">{session.email}</span> but
          isn&apos;t linked to a division yet, so there&apos;s nothing to show. Ask Josh to check the
          access list — it&apos;s a one-line fix.
        </p>
      </div>
    );
  }

  // 18 months so the bonus period (12 from its start) is fully covered even
  // once the FY is well under way.
  const [data, plan] = await Promise.all([
    getDivisionDashboard(division, 18),
    getDivisionBonusPlan(division),
  ]);

  const goals = plan ? computeGoalProgress(plan, data.months) : null;

  return (
    <DivisionDashboardView
      data={data}
      displayName={divisionDisplayName(division)}
      goals={goals}
    />
  );
}
