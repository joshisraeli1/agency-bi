import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, PieChart } from "lucide-react";
import { getSession, isDivisionLead, hasRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDivisionDashboard } from "@/lib/analytics/division-dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { DIVISION_KEYS, divisionDisplayName } from "@/lib/divisions";

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
  const [dashboards, leads] = await Promise.all([
    Promise.all(DIVISION_KEYS.map((key) => getDivisionDashboard(key, 1))),
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
  })).sort((a, b) => b.revenue - a.revenue);

  const total = rows.reduce((s, r) => s + r.revenue, 0);

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
                  {total > 0 && ` · ${((r.revenue / total) * 100).toFixed(0)}% of the book`}
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

      <p className="text-muted-foreground text-xs">
        {formatCurrency(total)} across {rows.length} divisions. A division&apos;s lead only ever
        sees their own, whichever link is followed from here.
      </p>
    </div>
  );
}
