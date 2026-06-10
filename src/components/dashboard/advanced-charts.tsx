"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChartCard } from "@/components/charts/bar-chart";
import { ScatterChartCard } from "@/components/charts/scatter-chart";
import { formatCurrency } from "@/lib/utils";
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

function DrillPanel({ title, items, onClose }: { title: string; items: { name: string; amount: number }[]; onClose: () => void }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">{title} — {items.length} client{items.length !== 1 ? "s" : ""}</h4>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients.</p>
      ) : (
        <div className="space-y-1">
          {items.map((d, i) => (
            <div key={`${d.name}-${i}`} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
              <span className="truncate mr-2">{d.name}</span>
              <span className="tabular-nums text-muted-foreground">{formatCurrency(d.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdvancedCharts({
  ltv,
  clientHealth,
  industryBreakdown,
}: Props) {
  // Client health matrix: x = monthly revenue, y = months retained, z = LTV
  // (bubble size), so the biggest bubbles are the highest-LTV clients.
  const [healthDivision, setHealthDivision] = useState<string>("all");
  const ltvByClient = new Map(ltv.clients.map((c) => [c.clientId, c.totalRevenue]));
  const allHealth = clientHealth.clients.map((c) => ({
    name: c.clientName,
    id: c.clientId,
    // X = months retained, Y = monthly revenue (revenue up the side reads better).
    x: c.monthsRetained,
    y: c.monthlyRevenue ?? Math.round(c.revenue / Math.max(1, c.monthsRetained)),
    z: ltvByClient.get(c.clientId) ?? Math.round((c.monthlyRevenue ?? 0) * c.monthsRetained),
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

  const fmtCurrency = (v: number) => formatCurrency(v);

  // Drill-downs for the cohort + industry bar charts, derived from ltv.clients.
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const cohortClients = new Map<string, { name: string; amount: number }[]>();
  const industryClients = new Map<string, { name: string; amount: number }[]>();
  for (const c of ltv.clients) {
    const sd = new Date(c.startDate);
    const cohort = `Q${Math.floor(sd.getMonth() / 3) + 1} ${sd.getFullYear()}`;
    (cohortClients.get(cohort) ?? cohortClients.set(cohort, []).get(cohort)!).push({ name: c.clientName, amount: Math.round(c.totalRevenue) });
    const ind = c.industry || "Unknown";
    (industryClients.get(ind) ?? industryClients.set(ind, []).get(ind)!).push({ name: c.clientName, amount: Math.round(c.totalRevenue) });
  }
  for (const map of [cohortClients, industryClients]) for (const arr of map.values()) arr.sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      {/* 1. Client Health Matrix */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Client Health Matrix</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Months retained vs monthly revenue, by division
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
          xLabel="Months Retained"
          yLabel="Monthly Revenue"
          zLabel="LTV"
          formatX={(v) => `${v}`}
          formatY={fmtCurrency}
          formatZ={fmtCurrency}
          clickHrefBase="/clients"
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
            onBarClick={(c) => setSelectedCohort((p) => (p === c ? null : c))}
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
            onBarClick={(i) => setSelectedIndustry((p) => (p === i ? null : i))}
          />
        )}
      </div>
      {selectedCohort && (
        <DrillPanel title={`Cohort ${selectedCohort}`} items={cohortClients.get(selectedCohort) ?? []} onClose={() => setSelectedCohort(null)} />
      )}
      {selectedIndustry && (
        <DrillPanel title={selectedIndustry} items={industryClients.get(selectedIndustry) ?? []} onClose={() => setSelectedIndustry(null)} />
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
          onBarClick={(i) => setSelectedIndustry((p) => (p === i ? null : i))}
          height={Math.max(300, industryBreakdownData.length * 35)}
        />
      )}

    </div>
  );
}
