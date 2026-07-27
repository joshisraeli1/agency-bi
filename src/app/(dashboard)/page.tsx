import { Suspense } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { getRevenueOverview, getRevenueVsChurn, getYtdXeroRevenue } from "@/lib/analytics/revenue-overview";
import { getActiveRevenueSnapshot, getPackageRevenueByMonth } from "@/lib/analytics/active-revenue";
import { getPipelineStageSnapshot } from "@/lib/analytics/pipeline-stages";
import { getBudgetVsActual } from "@/lib/analytics/revenue-budget";
import { getRevenueForecast } from "@/lib/analytics/forecast";
import { getThreeMonthForecast } from "@/lib/analytics/forecast-3month";
import { formatCurrency, formatPercent, resolveMonthsParam, formatMonth } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/charts/stat-card";
import { MarginBadge } from "@/components/charts/margin-badge";
import { RevenueCharts } from "@/components/dashboard/revenue-charts";
import { RevenueVsChurnChart } from "@/components/dashboard/revenue-vs-churn-chart";
import { RevenueByPackageChart } from "@/components/dashboard/revenue-by-package-chart";
import { BudgetVsActualChart } from "@/components/dashboard/budget-vs-actual-chart";
import { RevenueForecastSection } from "@/components/dashboard/revenue-forecast-section";
import { ThreeMonthForecast } from "@/components/dashboard/three-month-forecast";
import { PipelineStageTool } from "@/components/dashboard/pipeline-stage-tool";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { RefreshDataButton } from "@/components/dashboard/refresh-data-button";
import { Users, TrendingUp, AlertTriangle, Calendar, Receipt } from "lucide-react";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function OverviewPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  // Default is year-to-date (January → current month), matching the picker's
  // default; "3"/"6"/"12" give a rolling window instead.
  const months = resolveMonthsParam(monthsParam);

  // Same month one year ago — powers the "compare to last year" toggle on the
  // Revenue by Package Type chart.
  const nowDate = new Date();
  const curMonthKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;
  const lastYearMonthKey = `${nowDate.getFullYear() - 1}-${String(nowDate.getMonth() + 1).padStart(2, "0")}`;

  const [clientCount, recentImports, revenue, revenueVsChurn, activeSnapshot, forecast, budgetVsActual, ytdXero, lastYearPackages, pipelineStages, threeMonthForecast] = await Promise.all([
    db.client.count({ where: { status: "active", OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }] } }),
    db.dataImport.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    getRevenueOverview(months),
    getRevenueVsChurn(12),
    getActiveRevenueSnapshot(),
    getRevenueForecast(6),
    getBudgetVsActual(),
    getYtdXeroRevenue(),
    getPackageRevenueByMonth(lastYearMonthKey),
    getPipelineStageSnapshot(),
    getThreeMonthForecast(),
  ]);

  // Current monthly revenue from closed-won HubSpot deals — both figures come straight from the
  // deal-level amounts (inc-GST = Amount property, ex-GST = ex-GST property) so they match
  // HubSpot exactly, rather than applying a flat GST multiplier to a single figure.
  const monthlyRevenueExGst = activeSnapshot.monthlyRevenueExGst;
  const monthlyRevenueIncGst = activeSnapshot.monthlyRevenueIncGst;
  // Annualized = current monthly recurring revenue × 12 (ex-GST, to match the
  // card label), rather than the old FinancialRecord-derived figure.
  const annualizedRevenueExGst = monthlyRevenueExGst * 12;

  // Monthly growth = month-over-month change in HubSpot MRR (deal-based)
  const trend = revenue.monthlyTrend;
  const curMrr = trend.length ? trend[trend.length - 1].hubspotRevenue : 0;
  const prevMrr = trend.length > 1 ? trend[trend.length - 2].hubspotRevenue : 0;
  const monthlyGrowth = Math.round(curMrr - prevMrr);
  const monthlyGrowthPct = prevMrr > 0 ? (monthlyGrowth / prevMrr) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Overview</h1>
        <div className="flex items-center gap-2">
          <RefreshDataButton />
          <Suspense>
            <DateRangePicker />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Monthly Revenue (inc GST)"
          value={formatCurrency(monthlyRevenueIncGst)}
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Monthly Revenue (ex GST)"
          value={formatCurrency(monthlyRevenueExGst)}
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Annualized Rev ex GST"
          value={formatCurrency(annualizedRevenueExGst)}
          icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Revenue YTD (Xero)"
          value={formatCurrency(ytdXero.exGst)}
          description="Xero P&L, year to date (ex-GST)"
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
        <Link href="/clients" className="h-full">
          <StatCard
            title="Clients"
            value={String(clientCount)}
            description="Active clients"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
        </Link>
        <StatCard
          title="Monthly Growth"
          value={`${monthlyGrowth >= 0 ? "+" : "-"}${formatCurrency(Math.abs(monthlyGrowth))}`}
          trend={monthlyGrowthPct}
          description="MRR vs last month"
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <RevenueCharts data={revenue} />

      <BudgetVsActualChart data={budgetVsActual} />

      <RevenueVsChurnChart data={revenueVsChurn} />

      <RevenueForecastSection data={forecast} />

      <RevenueByPackageChart
        data={activeSnapshot.byPackageType}
        totalDeals={activeSnapshot.dealCount}
        totalRevenue={activeSnapshot.monthlyRevenueExGst}
        lastYear={lastYearPackages}
        currentLabel={formatMonth(curMonthKey)}
        lastYearLabel={formatMonth(lastYearMonthKey)}
      />

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
                    <Link href={`/clients/${client.clientId}`} className="font-medium hover:underline">
                      {client.clientName}
                    </Link>
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
      </div>

      <PipelineStageTool stages={pipelineStages} />

      <ThreeMonthForecast data={threeMonthForecast} />

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
  );
}
