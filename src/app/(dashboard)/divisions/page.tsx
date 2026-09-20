import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PieChart, Users } from "lucide-react";
import { getSession, isDivisionLead, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDivisionDashboard } from "@/lib/analytics/division-dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { DIVISION_KEYS, DIVISION_VIEWS, divisionDisplayName } from "@/lib/divisions";

export const dynamic = "force-dynamic";

/**
 * An index of every division, for looking at what a lead sees without hunting
 * for the URL.
 *
 * Leadership-only. A cross-division revenue index is exactly the view each
 * lead is scoped out of, so this fails closed: a division_lead who types the
 * URL is sent to their own dashboard rather than shown this page. Hiding the
 * nav entry (see layout.tsx) is presentation; this check is the boundary.
 */
export default async function DivisionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isDivisionLead(session)) redirect("/division");
  if (!hasRole(session, "manager")) redirect("/");

  // Each card is built from the SAME function the lead's own dashboard calls,
  // so the figures here are theirs rather than a second opinion on them. The
  // client book groups by company where this groups by clientId-or-deal, which
  // differs for companies holding several deals and no Client record — taking
  // the cheaper single pass would have shown counts the linked page contradicts.
  const [dashboards, viewDashboards, leads] = await Promise.all([
    Promise.all(DIVISION_KEYS.map((key) => getDivisionDashboard(key, 1))),
    Promise.all(
      DIVISION_VIEWS.map((v) =>
        getDivisionDashboard(v.baseDivision, 1, { clientManager: v.clientManager })
      )
    ),
    db.user.findMany({
      where: { role: "division_lead" },
      select: { name: true, division: true },
    }),
  ]);

  const leadByDivision = new Map(leads.map((l) => [l.division ?? "", l.name]));

  const rows = DIVISION_KEYS.map((key, i) => ({
    key,
    label: divisionDisplayName(key),
    lead: leadByDivision.get(key) ?? null,
    revenue: dashboards[i].currentRevenue,
    clients: dashboards[i].currentClientCount,
    cutOf: null as string | null,
  })).sort((a, b) => b.revenue - a.revenue);

  // The total covers the divisions only. A view's revenue is already inside its
  // base division, so adding it here would overstate the book by exactly that cut.
  const total = rows.reduce((s, r) => s + r.revenue, 0);

  const viewRows = DIVISION_VIEWS.map((v, i) => ({
    key: v.key,
    label: v.label,
    lead: leadByDivision.get(v.key) ?? null,
    revenue: viewDashboards[i].currentRevenue,
    clients: viewDashboards[i].currentClientCount,
    cutOf: divisionDisplayName(v.baseDivision) as string | null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Divisions</h1>
        <p className="text-muted-foreground mt-1">
          Each division&apos;s dashboard exactly as its lead sees it. All figures are recurring
          revenue, ex-GST.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <Link key={r.key} href={`/division?d=${encodeURIComponent(r.key)}`} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/25">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2 text-muted-foreground text-sm">
                  <span className="inline-flex items-center gap-2">
                    <PieChart className="h-4 w-4" />
                    {r.label}
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="text-2xl font-semibold tabular-nums mt-2">
                  {formatCurrency(r.revenue)}
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {r.clients} client{r.clients === 1 ? "" : "s"}
                  {r.cutOf
                    ? ` · counted within ${r.cutOf}`
                    : total > 0 && ` · ${((r.revenue / total) * 100).toFixed(0)}% of the book`}
                </p>
                <p className="text-xs mt-3">
                  {r.lead ? (
                    <span className="text-muted-foreground">
                      Led by <span className="text-foreground font-medium">{r.lead}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No lead assigned</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {viewRows.length > 0 && (
        <div className="space-y-3 pt-2">
          <div>
            <h2 className="text-lg font-semibold">Cuts</h2>
            <p className="text-muted-foreground text-sm">
              A slice of one division, scoped to the clients one manager owns. Already counted
              inside its division, so these are not added to the total below.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {viewRows.map((r) => (
              <Link key={r.key} href={`/division?d=${encodeURIComponent(r.key)}`} className="group">
                <Card className="h-full border-dashed transition-colors group-hover:border-foreground/25">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between gap-2 text-muted-foreground text-sm">
                      <span className="inline-flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {r.label}
                      </span>
                      <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="text-2xl font-semibold tabular-nums mt-2">
                      {formatCurrency(r.revenue)}
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      {r.clients} client{r.clients === 1 ? "" : "s"} · counted within {r.cutOf}
                    </p>
                    <p className="text-xs mt-3">
                      {r.lead ? (
                        <span className="text-muted-foreground">
                          Led by <span className="text-foreground font-medium">{r.lead}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">No lead assigned</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        {formatCurrency(total)} across {rows.length} divisions. A division&apos;s lead only ever
        sees their own, whichever link is followed from here.
      </p>
    </div>
  );
}
