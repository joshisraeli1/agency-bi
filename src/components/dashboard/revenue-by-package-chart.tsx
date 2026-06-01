"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

export function RevenueByPackageChart({ data, totalDeals, totalRevenue }: Props) {
  const [selected, setSelected] = useState<PackageTypeRow | null>(null);
  const chartData = data.map((d) => ({ name: d.packageType, revenue: d.revenue }));

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
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar
              dataKey="revenue"
              fill={PRIMARY}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(_, index) => setSelected(data[index] ?? null)}
            />
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
