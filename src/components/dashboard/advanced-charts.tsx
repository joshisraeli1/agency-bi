"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChartCard } from "@/components/charts/bar-chart";
import { ComboChartCard } from "@/components/charts/combo-chart";
import { ScatterChartCard } from "@/components/charts/scatter-chart";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type {
  LTVData,
  RevenueByServiceType,
  ClientHealthData,
  IndustryBreakdown,
} from "@/lib/analytics/advanced-analytics";
import type { AgencyKPIs } from "@/lib/analytics/types";

interface Props {
  ltv: LTVData;
  revenueByType: RevenueByServiceType;
  clientHealth: ClientHealthData;
  industryBreakdown: IndustryBreakdown;
  kpiData: AgencyKPIs;
}

export function AdvancedCharts({
  ltv,
  revenueByType,
  clientHealth,
  industryBreakdown,
  kpiData,
}: Props) {
  // Client health matrix: x = monthly revenue, y = months retained
  const [healthDivision, setHealthDivision] = useState<string>("all");
  const allHealth = clientHealth.clients.map((c) => ({
    name: c.clientName,
    x: c.monthlyRevenue ?? Math.round(c.revenue / Math.max(1, c.monthsRetained)),
    y: c.monthsRetained,
    z: 10, // uniform bubble size
    division: c.division,
  }));
  const healthDivisions = Array.from(new Set(allHealth.map((d) => d.division))).sort();
  const healthData =
    healthDivision === "all" ? allHealth : allHealth.filter((d) => d.division === healthDivision);

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

  // Revenue by service type combo chart
  const revenueData = revenueByType.monthlyBreakdown.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  const fmtCurrency = (v: number) => formatCurrency(v);

  return (
    <div className="space-y-6">
      {/* 1. Client Health Matrix */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Client Health Matrix</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly revenue vs months retained, by division
          </p>
        </div>
        <Select value={healthDivision} onValueChange={setHealthDivision}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All divisions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All divisions</SelectItem>
            {healthDivisions.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      {/* 2. Client Lifetime Value */}
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

    </div>
  );
}
