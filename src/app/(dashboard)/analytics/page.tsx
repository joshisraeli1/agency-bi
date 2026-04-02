import { Suspense } from "react";
import { db } from "@/lib/db";
import { getAgencyKPIs } from "@/lib/analytics/agency-kpis";
import { getRevenueOverview } from "@/lib/analytics/revenue-overview";
import {
  getLTVData,
  getRevenueByServiceType,
  getClientHealthData,
  getTeamUtilizationData,
  getSourceDiscrepancy,
  getIndustryBreakdown,
  getXeroMarginTrend,
  getNewClientDealSize,
} from "@/lib/analytics/advanced-analytics";
import {
  getTimesheetClientMargin,
  getMonthlyChurn,
} from "@/lib/analytics/margin-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { KpiCharts } from "@/components/dashboard/kpi-charts";
import { AdvancedCharts } from "@/components/dashboard/advanced-charts";
import { ProfitabilitySection } from "@/components/dashboard/profitability-section";
import { TimesheetMarginSection } from "@/components/dashboard/timesheet-margin-section";
import { ChurnRateSection } from "@/components/dashboard/churn-rate-section";
import { DiscrepancyTable } from "@/components/dashboard/discrepancy-table";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { TrendingUp, DollarSign, Building, UserCheck, Receipt } from "lucide-react";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);
  const [
    revenueOverview,
    data,
    ltv,
    revenueByType,
    clientHealth,
    teamUtilization,
    discrepancy,
    industryBreakdown,
    xeroMargin,
    newClientDealSize,
    timesheetMargin,
    monthlyChurn,
    avgDealSizeResult,
    appSettings,
  ] = await Promise.all([
    getRevenueOverview(months),
    getAgencyKPIs(months),
    getLTVData(),
    getRevenueByServiceType(months),
    getClientHealthData(months),
    getTeamUtilizationData(months),
    getSourceDiscrepancy(months),
    getIndustryBreakdown(),
    getXeroMarginTrend(months),
    getNewClientDealSize(months),
    getTimesheetClientMargin(months),
    getMonthlyChurn(12),
    db.client.aggregate({
      where: { status: "active", hubspotDealId: { not: null }, retainerValue: { gt: 0 } },
      _avg: { retainerValue: true },
    }),
    db.appSettings.findFirst(),
  ]);

  const gstDivisor = 1 + (appSettings?.gstRate ?? 10) / 100;
  // retainerValue is GST-inclusive; convert to ex-GST for avg deal size
  const avgDealSize = Math.round((avgDealSizeResult._avg.retainerValue ?? 0) / gstDivisor);

  const currentMonth = revenueOverview.monthlyTrend[revenueOverview.monthlyTrend.length - 1];
  const monthlyRevenueExGst = currentMonth?.activeRevenue ?? 0;
  const monthlyRevenueIncGst = currentMonth?.activeRevenueIncGst ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Agency-wide KPIs and performance metrics</p>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      {/* 1. Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
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
          title="Avg Deal Size"
          value={formatCurrency(avgDealSize)}
          description="Active clients"
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(data.avgMargin)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Revenue / Head"
          value={formatCurrency(data.revenuePerHead)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Annualised Revenue"
          value={formatCurrency(data.activeClients > 0 ? avgDealSize * data.activeClients * 12 : 0)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Clients"
          value={String(data.activeClients)}
          icon={<Building className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Client Retention"
          value={formatPercent(data.clientRetention)}
          description={`${data.totalTeamMembers} team members`}
          icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* 2. Profitability Section — HubSpot + Xero division tables & Xero margin trend */}
      <ProfitabilitySection
        hubspotProfitability={data.hubspotProfitability}
        xeroProfitability={data.xeroProfitability}
        xeroMargin={xeroMargin}
      />

      {/* 3. Client Margin Breakdown */}
      <TimesheetMarginSection data={timesheetMargin} />

      {/* 4. Monthly Churn Rate */}
      <ChurnRateSection data={monthlyChurn} />

      {/* 6. KPI Charts (Utilization & Margin Trend, Hours by Division) */}
      <KpiCharts data={data} />

      {/* 7. Advanced Charts */}
      <AdvancedCharts
        ltv={ltv}
        revenueByType={revenueByType}
        clientHealth={clientHealth}
        teamUtilization={teamUtilization}
        industryBreakdown={industryBreakdown}
        kpiData={data}
        newClientDealSize={newClientDealSize}
      />

    </div>
  );
}
