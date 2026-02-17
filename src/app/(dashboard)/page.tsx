import { Suspense } from "react";
import { db } from "@/lib/db";
import { getRevenueOverview } from "@/lib/analytics/revenue-overview";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/charts/stat-card";
import { MarginBadge } from "@/components/charts/margin-badge";
import { RevenueCharts } from "@/components/dashboard/revenue-charts";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Users, UserCog, DollarSign, TrendingUp, AlertTriangle } from "lucide-react";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);

  const [clientCount, teamCount, recentImports, revenue] = await Promise.all([
    db.client.count(),
    db.teamMember.count(),
    db.dataImport.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    getRevenueOverview(months),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Overview</h1>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(revenue.totalRevenue)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(revenue.avgMarginPercent)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Clients"
          value={String(clientCount)}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Team Members"
          value={String(teamCount)}
          icon={<UserCog className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <RevenueCharts data={revenue} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {revenue.atRiskClients.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                At-Risk Clients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {revenue.atRiskClients.map((client) => (
                  <div
                    key={client.clientId}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-medium">{client.clientName}</span>
                    <div className="flex items-center gap-2">
                      <MarginBadge marginPercent={client.marginPercent} />
                      <span className="text-xs text-muted-foreground">
                        {client.reason}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {recentImports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Imports</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentImports.map((imp) => (
                  <div
                    key={imp.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-medium capitalize">{imp.provider}</span>
                    <span className="text-muted-foreground">
                      {imp.recordsSynced} records &middot;{" "}
                      <span
                        className={
                          imp.status === "completed"
                            ? "text-green-600"
                            : imp.status === "failed"
                            ? "text-red-600"
                            : "text-yellow-600"
                        }
                      >
                        {imp.status}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
