import { redirect } from "next/navigation";
import { getSession, isDivisionLead, hasRole } from "@/lib/auth";
import { getDivisionDashboard } from "@/lib/analytics/division-dashboard";
import { DivisionDashboardView } from "@/components/dashboard/division-dashboard-view";
import { computeGoalProgress, getDivisionBonusPlan } from "@/lib/analytics/division-goals";
import { isScopeKey, resolveScope, DIVISION_KEYS } from "@/lib/divisions";

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

  let scopeKey: string | null = null;

  if (isDivisionLead(session)) {
    scopeKey = isScopeKey(session.division) ? session.division! : null;
  } else if (hasRole(session, "viewer")) {
    const { d } = await searchParams;
    scopeKey = isScopeKey(d) ? d! : DIVISION_KEYS[0];
  }

  const scope = scopeKey ? resolveScope(scopeKey) : null;

  if (!scope) {
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
  // A view has no bonus plan of its own — the plan belongs to the division it
  // cuts, and paying a cut's lead against the whole division's tiers would be
  // wrong in both directions.
  const [data, plan] = await Promise.all([
    getDivisionDashboard(scope.division, 18, { clientManager: scope.clientManager }),
    scope.isView ? Promise.resolve(null) : getDivisionBonusPlan(scope.division),
  ]);

  const goals = plan ? computeGoalProgress(plan, data.months) : null;

  return <DivisionDashboardView data={data} displayName={scope.label} goals={goals} />;
}
