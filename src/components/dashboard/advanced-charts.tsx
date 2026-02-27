"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
import { LineChartCard } from "@/components/charts/line-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { ComboChartCard } from "@/components/charts/combo-chart";
import { ScatterChartCard } from "@/components/charts/scatter-chart";
import { formatMonth, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  LTVData,
  RevenueByServiceType,
  ClientHealthData,
  TeamUtilizationData,
  IndustryBreakdown,
} from "@/lib/analytics/advanced-analytics";
import type { AgencyKPIs, NewClientDealSizeData } from "@/lib/analytics/types";

const EXCLUDED_DIVISIONS = ["Unassigned", "NA", "Sales"];

interface Props {
  ltv: LTVData;
  revenueByType: RevenueByServiceType;
  clientHealth: ClientHealthData;
  teamUtilization: TeamUtilizationData;
  industryBreakdown: IndustryBreakdown;
  kpiData: AgencyKPIs;
  newClientDealSize: NewClientDealSizeData;
}

export function AdvancedCharts({
  ltv,
  revenueByType,
  clientHealth,
  teamUtilization,
  industryBreakdown,
  kpiData,
  newClientDealSize,
}: Props) {
  // Client health matrix scatter
  const healthData = clientHealth.clients.map((c) => ({
    name: c.clientName,
    x: c.revenue,
    y: c.marginPercent,
    z: c.monthsRetained,
  }));

  // Client Revenue by Industry (moved from KpiCharts)
  const industryRevenueData = kpiData.clientLTVByIndustry.map((d) => ({
    name: d.industry,
    revenue: d.revenue,
  }));

  // Client Revenue by Division (moved from KpiCharts)
  const ltvDivisionData = kpiData.clientLTVByDivision
    .filter((d) => !EXCLUDED_DIVISIONS.includes(d.division))
    .map((d) => ({
      name: d.division,
      value: d.revenue,
    }));

  // LTV by cohort
  const cohortData = ltv.byCohort.map((c) => ({
    name: c.cohort,
    avgLTV: c.avgLTV,
    clients: c.clients,
  }));

  // Tenure by cohort
  const tenureCohortData = ltv.tenureByCohort.map((c) => ({
    name: c.cohort,
    avgTenure: c.avgTenureMonths,
    clients: c.clients,
  }));

  // LTV by industry
  const industryLtvData = ltv.byIndustry
    .filter((d) => d.avgLTV > 0)
    .slice(0, 12)
    .map((d) => ({
      name: d.industry,
      avgLTV: d.avgLTV,
      avgMonths: d.avgMonths,
    }));

  // Industry breakdown (active vs churned)
  const industryBreakdownData = industryBreakdown.industries
    .filter((d) => d.totalClients > 0)
    .map((d) => ({
      name: d.industry,
      activeClients: d.activeClients,
      churnedClients: d.churnedClients,
    }));

  // New client deal size — months with new clients
  const dealSizeMonths = newClientDealSize.months.filter((m) => m.clientCount > 0);

  // Revenue by service type combo chart
  const revenueData = revenueByType.monthlyBreakdown.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  // Team utilization horizontal bar
  const utilizationData = teamUtilization.members.map((m) => ({
    name: m.memberName,
    billable: m.billableHours,
    remaining: Math.max(0, m.capacity - m.billableHours),
    utilization: m.utilizationPercent,
  }));

  // Margin by Division (moved from KpiCharts)
  const marginByDivisionData = kpiData.marginByDivision.filter(
    (d) => !EXCLUDED_DIVISIONS.includes(d.division)
  );

  // Division Margin Over Time (moved from KpiCharts)
  const divisionMarginKeys =
    kpiData.divisionMarginTrend.length > 0
      ? Object.keys(kpiData.divisionMarginTrend[0]).filter(
          (k) => k !== "month" && !EXCLUDED_DIVISIONS.includes(k)
        )
      : [];

  const fmtCurrency = (v: number) => formatCurrency(v);

  return (
    <div className="space-y-6">
      {/* 1. Client Health Matrix */}
      <div>
        <h2 className="text-xl font-semibold">Client Health Matrix</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Revenue vs margin — bubble size represents months retained
        </p>
      </div>

      {healthData.length > 0 && (
        <ScatterChartCard
          title="Client Health Matrix"
          data={healthData}
          xLabel="Revenue"
          yLabel="Margin %"
          zLabel="Months Retained"
          formatX={fmtCurrency}
          formatY={(v) => `${v}%`}
          referenceY={20}
        />
      )}

      {/* 2. Client Revenue by Industry (moved from KpiCharts) */}
      {industryRevenueData.length > 0 && (
        <BarChartCard
          title="Client Revenue by Industry"
          data={industryRevenueData}
          xKey="name"
          yKeys={["revenue"]}
          yLabels={["Revenue"]}
          horizontal
          formatY={fmtCurrency}
        />
      )}

      {/* 3. Client Revenue by Division (moved from KpiCharts) */}
      {ltvDivisionData.length > 0 && (
        <PieChartCard
          title="Client Revenue by Division"
          data={ltvDivisionData}
          donut
          formatValue={fmtCurrency}
        />
      )}

      {/* 4. Client Lifetime Value */}
      <div>
        <h2 className="text-xl font-semibold">Client Lifetime Value</h2>
        <p className="text-muted-foreground text-sm mt-1">
          LTV analysis by acquisition cohort and industry
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cohortData.length > 0 && (
          <BarChartCard
            title="Avg LTV by Acquisition Cohort"
            data={cohortData}
            xKey="name"
            yKeys={["avgLTV"]}
            yLabels={["Avg LTV"]}
            formatY={fmtCurrency}
          />
        )}
        {industryLtvData.length > 0 && (
          <BarChartCard
            title="Avg LTV by Industry"
            data={industryLtvData}
            xKey="name"
            yKeys={["avgLTV"]}
            yLabels={["Avg LTV"]}
            horizontal
            formatY={fmtCurrency}
          />
        )}
      </div>

      {/* 5. Tenure by Cohort */}
      {tenureCohortData.length > 0 && (
        <BarChartCard
          title="Avg Client Tenure by Start Quarter"
          data={tenureCohortData}
          xKey="name"
          yKeys={["avgTenure"]}
          yLabels={["Avg Tenure"]}
          formatY={(v) => `${v}mo`}
        />
      )}

      {/* 6. New Client Deal Size (FIXED — by startDate, not rolling average) */}
      {dealSizeMonths.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">New Client Deal Size</h2>
            <p className="text-muted-foreground text-sm mt-1">
              New clients by start month with their initial deal size
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Clients by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Month</th>
                      <th className="text-left py-2 px-3 font-medium">Client</th>
                      <th className="text-right py-2 px-3 font-medium">Deal Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealSizeMonths.map((m) =>
                      m.clients.map((client, i) => (
                        <tr
                          key={`${m.month}-${client.clientId}`}
                          className="border-b last:border-0"
                        >
                          <td className="py-2 px-3 font-medium">
                            {i === 0 ? formatMonth(m.month) : ""}
                          </td>
                          <td className="py-2 px-3">{client.clientName}</td>
                          <td className="text-right py-2 px-3">
                            {client.dealSize > 0 ? formatCurrency(client.dealSize) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                    {/* Summary row per month */}
                    {dealSizeMonths.map((m) => (
                      <tr key={`avg-${m.month}`} className="border-t bg-muted/50">
                        <td className="py-2 px-3 font-semibold">
                          {formatMonth(m.month)} avg
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {m.clientCount} client{m.clientCount !== 1 ? "s" : ""}
                        </td>
                        <td className="text-right py-2 px-3 font-semibold">
                          {m.avgDealSize > 0 ? formatCurrency(m.avgDealSize) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Clients by Industry Type */}
      <div>
        <h2 className="text-xl font-semibold">Clients by Industry Type</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Active and churned client distribution by HubSpot industry type
        </p>
      </div>

      {industryBreakdownData.length > 0 && (
        <BarChartCard
          title="Clients by Industry"
          data={industryBreakdownData}
          xKey="name"
          yKeys={["activeClients", "churnedClients"]}
          yLabels={["Active", "Churned"]}
          horizontal
          stacked
          height={Math.max(300, industryBreakdownData.length * 35)}
        />
      )}

      {/* 7. Revenue & Gross Profit */}
      <div>
        <h2 className="text-xl font-semibold">Revenue & Gross Profit</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Monthly revenue by service type with gross margin overlay
        </p>
      </div>

      {revenueData.length > 0 && (
        <ComboChartCard
          title="Revenue & Gross Profit Over Time"
          data={revenueData}
          xKey="month"
          barKeys={["socialMedia", "adsManagement", "contentDelivery"]}
          barLabels={["Social Media Management", "Ads Management", "Content Delivery"]}
          lineKey="marginPercent"
          lineLabel="Margin %"
          stacked
          formatBar={fmtCurrency}
          formatLine={(v) => `${v}%`}
        />
      )}

      {/* 8. Team Utilisation */}
      <div>
        <h2 className="text-xl font-semibold">Team Utilisation</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Billable hours vs capacity by team member
        </p>
      </div>

      {utilizationData.length > 0 && (
        <BarChartCard
          title="Utilisation Rate by Team Member"
          data={utilizationData}
          xKey="name"
          yKeys={["billable", "remaining"]}
          yLabels={["Billable Hours", "Remaining Capacity"]}
          horizontal
          stacked
          height={Math.max(300, utilizationData.length * 30)}
          formatY={(v) => `${v}h`}
        />
      )}

      {/* 9. Margin by Division + Division Margin Over Time (moved from KpiCharts) */}
      {(marginByDivisionData.length > 0 || divisionMarginKeys.length > 0) && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Division Margins</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Revenue vs cost by division and margin trends over time
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {marginByDivisionData.length > 0 && (
              <BarChartCard
                title="Margin by Division"
                data={marginByDivisionData}
                xKey="division"
                yKeys={["revenue", "cost"]}
                yLabels={["Revenue", "Cost"]}
                formatY={fmtCurrency}
              />
            )}
            {divisionMarginKeys.length > 0 && (
              <LineChartCard
                title="Division Margin Over Time"
                data={kpiData.divisionMarginTrend}
                xKey="month"
                yKeys={divisionMarginKeys}
                yLabels={divisionMarginKeys}
                formatY={(v) => `${v}%`}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
