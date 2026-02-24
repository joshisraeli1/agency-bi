"use client";

import { useState } from "react";
import { BarChartCard } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { RevenueOverview } from "@/lib/analytics/types";

interface Props {
  data: RevenueOverview;
}

type SourceFilter = "both" | "hubspot" | "xero";

export function RevenueCharts({ data }: Props) {
  const [source, setSource] = useState<SourceFilter>("both");

  const fmtCurrency = (v: number) => formatCurrency(v);

  // Monthly bar chart data
  const monthlyData = data.monthlyTrend.map((m) => {
    const row: Record<string, unknown> = { month: formatMonth(m.month) };
    if (source === "both" || source === "hubspot") {
      row.hubspot = Math.round(m.hubspotRevenue);
    }
    if (source === "both" || source === "xero") {
      row.xero = Math.round(m.xeroRevenue);
    }
    return row;
  });

  const monthlyKeys = source === "both" ? ["hubspot", "xero"] : source === "hubspot" ? ["hubspot"] : ["xero"];
  const monthlyLabels = source === "both" ? ["HubSpot", "Xero"] : source === "hubspot" ? ["HubSpot"] : ["Xero"];

  // Quarterly bar chart data
  const quarterlyData = data.quarterlyTrend.map((q) => {
    const row: Record<string, unknown> = { quarter: q.quarter };
    if (source === "both" || source === "hubspot") {
      row.hubspot = q.hubspotRevenue;
    }
    if (source === "both" || source === "xero") {
      row.xero = q.xeroRevenue;
    }
    return row;
  });

  // Client data (always shown)
  const clientData = data.byClient.slice(0, 10).map((c) => ({
    name: c.clientName.length > 15 ? c.clientName.slice(0, 15) + "..." : c.clientName,
    revenue: Number(c.revenue.toFixed(0)),
    cost: Number(c.cost.toFixed(0)),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Source:</span>
        <div className="flex gap-1">
          {(["both", "hubspot", "xero"] as const).map((s) => (
            <Button
              key={s}
              variant={source === s ? "default" : "outline"}
              size="sm"
              onClick={() => setSource(s)}
            >
              {s === "both" ? "Both" : s === "hubspot" ? "HubSpot" : "Xero"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChartCard
          title="Monthly Revenue"
          data={monthlyData}
          xKey="month"
          yKeys={monthlyKeys}
          yLabels={monthlyLabels}
          formatY={fmtCurrency}
        />
        <BarChartCard
          title="Quarterly Revenue"
          data={quarterlyData}
          xKey="quarter"
          yKeys={monthlyKeys}
          yLabels={monthlyLabels}
          formatY={fmtCurrency}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarChartCard
          title="Revenue by Client"
          data={clientData}
          xKey="name"
          yKeys={["revenue", "cost"]}
          yLabels={["Revenue", "Cost"]}
          formatY={fmtCurrency}
        />
      </div>
    </div>
  );
}
