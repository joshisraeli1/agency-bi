"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PackageTypeRow } from "@/lib/analytics/active-revenue";

interface Props {
  data: PackageTypeRow[];
  totalDeals: number;
  totalRevenue: number;
}

const PRIMARY = "#6366f1";

// X-axis tick showing the package name plus its deal count (like HubSpot's
// "Revenue by Package Type"): name on top, "<n> deals" bold underneath.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PackageTick({ x, y, payload, counts }: any) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" dy={14} className="fill-muted-foreground" style={{ fontSize: 12 }}>
        {payload.value}
      </text>
      <text textAnchor="middle" dy={32} className="fill-foreground" style={{ fontSize: 13, fontWeight: 600 }}>
        {counts[payload.value] ?? 0} deals
      </text>
    </g>
  );
}

export function RevenueByPackageChart({ data, totalDeals, totalRevenue }: Props) {
  const [selected, setSelected] = useState<PackageTypeRow | null>(null);
  const chartData = data.map((d) => ({ name: d.packageType, revenue: d.revenue }));
  const counts = Object.fromEntries(data.map((d) => [d.packageType, d.count]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-base">Revenue by Package Type</CardTitle>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Active Monthly Revenue (ex-GST)
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalRevenue)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">· {totalDeals} deals</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 28, right: 20, bottom: 24, left: 10 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis
              dataKey="name"
              interval={0}
              height={44}
              tickLine={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tick={(props: any) => <PackageTick {...props} counts={counts} />}
            />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Bar
              dataKey="revenue"
              fill={PRIMARY}
              radius={[4, 4, 0, 0]}
              maxBarSize={96}
              cursor="pointer"
              onClick={(_, index) => setSelected(data[index] ?? null)}
            >
              <LabelList
                dataKey="revenue"
                position="top"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => formatCurrency(Number(v))}
                style={{ fontSize: 12, fontWeight: 600, fill: "#334155" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">Click a bar to see the deals in that package type.</p>

        {selected && (
          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">
                {selected.packageType} · {selected.count} deals · {formatCurrency(selected.revenue)}
              </span>
              <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:underline">
                Close
              </button>
            </div>
            <div className="space-y-1">
              {selected.deals.map((deal, i) => (
                <div key={`${deal.name}-${i}`} className="flex items-baseline justify-between text-sm border-b py-1 last:border-0">
                  <span className="truncate mr-2">{deal.name}</span>
                  <span className="tabular-nums">{formatCurrency(deal.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
