import { Suspense } from "react";
import { getAgencyKPIs } from "@/lib/analytics/agency-kpis";
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
  getHolisticClientMargin,
  getMonthlyChurn,
} from "@/lib/analytics/margin-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { KpiCharts } from "@/components/dashboard/kpi-charts";
import { AdvancedCharts } from "@/components/dashboard/advanced-charts";
import { ProfitabilitySection } from "@/components/dashboard/profitability-section";
import { TimesheetMarginSection } from "@/components/dashboard/timesheet-margin-section";
import { HolisticMarginSection } from "@/components/dashboard/holistic-margin-section";
import { ChurnRateSection } from "@/components/dashboard/churn-rate-section";
import { DiscrepancyTable } from "@/components/dashboard/discrepancy-table";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Target, TrendingUp, DollarSign, Building, UserCheck } from "lucide-react";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);
  const [
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
    holisticMargin,
    monthlyChurn,
  ] = await Promise.all([
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
    getHolisticClientMargin(months),
    getMonthlyChurn(12),
  ]);

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Avg Utilization"
          value={formatPercent(data.avgUtilization)}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
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
          title="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
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

      {/* 3. Timesheet-Based Client Margin */}
      <TimesheetMarginSection data={timesheetMargin} />

      {/* 4. Holistic Client Margin */}
      <HolisticMarginSection data={holisticMargin} />

      {/* 5. Monthly Churn Rate */}
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

      {/* 8. HubSpot vs Xero Reconciliation */}
      {(discrepancy.totalHubspot > 0 || discrepancy.totalXero > 0) && (
        <>
          <div>
            <h2 className="text-xl font-semibold">HubSpot vs Xero Reconciliation</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Revenue comparison between sources (ex GST)
            </p>
          </div>
          <DiscrepancyTable data={discrepancy} />
        </>
      )}
    </div>
  );
}
