"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
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
  // Client health matrix: x = monthly revenue, y = months retained
  const healthData = clientHealth.clients.map((c) => ({
    name: c.clientName,
    x: c.monthlyRevenue ?? Math.round(c.revenue / Math.max(1, c.monthsRetained)),
    y: c.monthsRetained,
    z: 10, // uniform bubble size
  }));

  // Client Revenue by Division (from contentPackageType — no double-up)
  const ltvDivisionData = kpiData.clientLTVByDivision.map((d) => ({
    name: d.division,
    value: d.revenue,
  }));

  // LTV by cohort
  const cohortData = ltv.byCohort.map((c) => ({
    name: c.cohort,
    avgLTV: c.avgLTV,
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

  // Churned client months
  const churnedMonths = newClientDealSize.churnedMonths.filter((m) => m.clientCount > 0);

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

  const fmtCurrency = (v: number) => formatCurrency(v);

  return (
    <div className="space-y-6">
      {/* 1. Client Health Matrix */}
      <div>
        <h2 className="text-xl font-semibold">Client Health Matrix</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Monthly revenue vs months retained — bubble size represents margin %
        </p>
      </div>

      {healthData.length > 0 && (
        <ScatterChartCard
          title="Client Health Matrix"
          data={healthData}
          xLabel="Monthly Revenue"
          yLabel="Months Retained"
          zLabel="Margin %"
          formatX={fmtCurrency}
          formatY={(v) => `${v}`}
        />
      )}

      {/* 2. Client Revenue by Division */}
      {ltvDivisionData.length > 0 && (
        <PieChartCard
          title="Client Revenue by Division"
          data={ltvDivisionData}
          donut
          formatValue={fmtCurrency}
        />
      )}

      {/* 3. Client Lifetime Value */}
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

      {/* 4. New Revenue Won */}
      {dealSizeMonths.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">New Revenue Won</h2>
            <p className="text-muted-foreground text-sm mt-1">
              New clients by start month with division and monthly retainer
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
                      <th className="text-left py-2 px-3 font-medium">Division</th>
                      <th className="text-right py-2 px-3 font-medium">Monthly Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealSizeMonths.map((m) => (
                      <>
                        {m.clients.map((client, i) => (
                          <tr
                            key={`new-${m.month}-${client.clientId}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-2 px-3 font-medium">
                              {i === 0 ? formatMonth(m.month) : ""}
                            </td>
                            <td className="py-2 px-3">{client.clientName}</td>
                            <td className="py-2 px-3 text-muted-foreground">{client.division}</td>
                            <td className="text-right py-2 px-3">
                              {client.dealSize > 0 ? formatCurrency(client.dealSize) : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr key={`new-total-${m.month}`} className="border-b bg-muted/50">
                          <td className="py-2 px-3 font-semibold">{formatMonth(m.month)} Total</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {m.clientCount} client{m.clientCount !== 1 ? "s" : ""}
                          </td>
                          <td />
                          <td className="text-right py-2 px-3 font-semibold">
                            {formatCurrency(m.totalDealSize)}
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* 5. Clients Churned */}
      {churnedMonths.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Clients Churned</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Churned clients by end month with division and lost monthly retainer
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Churned Clients by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Month</th>
                      <th className="text-left py-2 px-3 font-medium">Client</th>
                      <th className="text-left py-2 px-3 font-medium">Division</th>
                      <th className="text-right py-2 px-3 font-medium">Lost Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {churnedMonths.map((m) => (
                      <>
                        {m.clients.map((client, i) => (
                          <tr
                            key={`churn-${m.month}-${client.clientId}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-2 px-3 font-medium">
                              {i === 0 ? formatMonth(m.month) : ""}
                            </td>
                            <td className="py-2 px-3">{client.clientName}</td>
                            <td className="py-2 px-3 text-muted-foreground">{client.division}</td>
                            <td className="text-right py-2 px-3 text-red-600">
                              {client.dealSize > 0 ? formatCurrency(client.dealSize) : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr key={`churn-total-${m.month}`} className="border-b bg-muted/50">
                          <td className="py-2 px-3 font-semibold">{formatMonth(m.month)} Total</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {m.clientCount} client{m.clientCount !== 1 ? "s" : ""}
                          </td>
                          <td />
                          <td className="text-right py-2 px-3 font-semibold text-red-600">
                            {formatCurrency(m.totalDealSize)}
                          </td>
                        </tr>
                      </>
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

      {/* Revenue & Gross Profit */}
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

      {/* Team Utilisation */}
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
    </div>
  );
}
