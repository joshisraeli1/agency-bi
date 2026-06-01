import { Suspense } from "react";
import { db } from "@/lib/db";
import { getAgencyKPIs } from "@/lib/analytics/agency-kpis";
import { getRevenueOverview } from "@/lib/analytics/revenue-overview";
import { getActiveRevenueSnapshot, getDivisionGoals } from "@/lib/analytics/active-revenue";
import { DivisionGoals } from "@/components/dashboard/division-goals";
import {
  getLTVData,
  getRevenueByServiceType,
  getClientHealthData,
  getSourceDiscrepancy,
  getIndustryBreakdown,
  getXeroMarginTrend,
  getNewClientDealSize,
} from "@/lib/analytics/advanced-analytics";
import {
  getMonthlyChurn,
} from "@/lib/analytics/margin-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { AdvancedCharts } from "@/components/dashboard/advanced-charts";
import { ProfitabilitySection } from "@/components/dashboard/profitability-section";
import { ChurnRateSection } from "@/components/dashboard/churn-rate-section";
import { DealSizeChart } from "@/components/dashboard/deal-size-chart";
import { DiscrepancyTable } from "@/components/dashboard/discrepancy-table";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { DollarSign, Building, UserCheck, Receipt } from "lucide-react";

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
    discrepancy,
    industryBreakdown,
    xeroMargin,
    newClientDealSize,
    monthlyChurn,
    avgDealSizeResult,
    appSettings,
    clientCount,
    activeSnapshot,
    divisionGoals,
  ] = await Promise.all([
    getRevenueOverview(months),
    getAgencyKPIs(months),
    getLTVData(),
    getRevenueByServiceType(months),
    getClientHealthData(),
    getSourceDiscrepancy(months),
    getIndustryBreakdown(),
    getXeroMarginTrend(months),
    getNewClientDealSize(months),
    getMonthlyChurn(12),
    db.client.aggregate({
      where: { status: "active", OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }], retainerValue: { gt: 0 } },
      _avg: { retainerValue: true },
    }),
    db.appSettings.findFirst(),
    db.client.count({ where: { status: "active", OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }] } }),
    getActiveRevenueSnapshot(),
    getDivisionGoals(),
  ]);

  const gstRate = appSettings?.gstRate ?? 10;
  const gstDivisor = 1 + gstRate / 100;
  // retainerValue is ex-GST (stored from HubSpot's amount__excl_gst_); display directly
  const avgDealSize = Math.round(avgDealSizeResult._avg.retainerValue ?? 0);

  // Current monthly revenue uses sum-of-active-retainers (matches HubSpot Revenue Summary).
  const monthlyRevenueExGst = activeSnapshot.monthlyRevenueExGst;
  const monthlyRevenueIncGst = Math.round(monthlyRevenueExGst * gstDivisor);

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

      {/* 1. Stat Cards — sourced from revenueOverview to match Overview page */}
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
          title="Avg Deal Size"
          value={formatCurrency(avgDealSize)}
          description="Active clients"
          icon={<Receipt className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Annualised Revenue"
          value={formatCurrency(revenueOverview.annualizedRevenue)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Clients"
          value={String(clientCount)}
          icon={<Building className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Client Retention"
          value={formatPercent(data.clientRetention)}
          description={`${data.totalTeamMembers} team members`}
          icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Revenue by Division vs Goal (editable monthly targets) */}
      <DivisionGoals byPackageType={activeSnapshot.byPackageType} goals={divisionGoals} />

      {/* 2. Profitability Section — HubSpot + Xero division tables & Xero margin trend */}
      <ProfitabilitySection
        hubspotProfitability={data.hubspotProfitability}
        xeroProfitability={data.xeroProfitability}
        xeroMargin={xeroMargin}
      />

      {/* 3. Monthly Churn Rate */}
      <ChurnRateSection data={monthlyChurn} />

      {/* Average Deal Size Over Time */}
      <DealSizeChart data={newClientDealSize} />

      {/* 7. Advanced Charts */}
      <AdvancedCharts
        ltv={ltv}
        revenueByType={revenueByType}
        clientHealth={clientHealth}
        industryBreakdown={industryBreakdown}
        kpiData={data}
      />

    </div>
  );
}
