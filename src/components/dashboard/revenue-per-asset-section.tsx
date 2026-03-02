"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
import { StatCard } from "@/components/charts/stat-card";
import { formatCurrency } from "@/lib/utils";
import type { RevenuePerAssetData } from "@/lib/analytics/types";
import { DollarSign, Package } from "lucide-react";

interface Props {
  data: RevenuePerAssetData;
}

export function RevenuePerAssetSection({ data }: Props) {
  if (data.clients.length === 0) return null;

  // Top 20 by revenue per deliverable
  const chartData = data.clients.slice(0, 20).map((c) => ({
    name: c.clientName,
    revenuePerDeliverable: c.revenuePerDeliverable,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Revenue Per Deliverable</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Revenue per deliverable by client — agency-wide benchmark
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Avg Revenue / Deliverable"
          value={formatCurrency(data.avgRevenuePerDeliverable)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Deliverables"
          value={String(data.totalDeliverables)}
          icon={<Package className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <BarChartCard
        title="Revenue Per Deliverable by Client (Top 20)"
        data={chartData}
        xKey="name"
        yKeys={["revenuePerDeliverable"]}
        yLabels={["Revenue / Deliverable"]}
        horizontal
        formatY={(v) => formatCurrency(v)}
      />
    </div>
  );
}
