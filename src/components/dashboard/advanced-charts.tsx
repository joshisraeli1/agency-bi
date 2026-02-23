"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
import { ComboChartCard } from "@/components/charts/combo-chart";
import { ScatterChartCard } from "@/components/charts/scatter-chart";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type {
  LTVData,
  RevenueByServiceType,
  ClientHealthData,
  TeamUtilizationData,
} from "@/lib/analytics/advanced-analytics";

interface Props {
  ltv: LTVData;
  revenueByType: RevenueByServiceType;
  clientHealth: ClientHealthData;
  teamUtilization: TeamUtilizationData;
}

export function AdvancedCharts({
  ltv,
  revenueByType,
  clientHealth,
  teamUtilization,
}: Props) {
  // LTV by cohort
  const cohortData = ltv.byCohort.map((c) => ({
    name: c.cohort,
    avgLTV: c.avgLTV,
    clients: c.clients,
  }));

  // LTV by industry
  const industryData = ltv.byIndustry
    .filter((d) => d.avgLTV > 0)
    .slice(0, 12)
    .map((d) => ({
      name: d.industry,
      avgLTV: d.avgLTV,
      avgMonths: d.avgMonths,
    }));

  // Revenue by service type combo chart
  const revenueData = revenueByType.monthlyBreakdown.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  // Client health matrix scatter
  const healthData = clientHealth.clients.map((c) => ({
    name: c.clientName,
    x: c.revenue,
    y: c.marginPercent,
    z: c.monthsRetained,
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
        {industryData.length > 0 && (
          <BarChartCard
            title="Avg LTV by Industry"
            data={industryData}
            xKey="name"
            yKeys={["avgLTV"]}
            yLabels={["Avg LTV"]}
            horizontal
            formatY={fmtCurrency}
          />
        )}
      </div>

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
          barKeys={["retainer", "project"]}
          barLabels={["Retainer", "Project"]}
          lineKey="marginPercent"
          lineLabel="Margin %"
          stacked
          formatBar={fmtCurrency}
          formatLine={(v) => `${v}%`}
        />
      )}

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
