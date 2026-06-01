"use client";

import { useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/charts/stat-card";
import { formatMonth, formatCurrency, formatPercent } from "@/lib/utils";
import type { MonthlyChurnData } from "@/lib/analytics/types";
import { TrendingDown, Users } from "lucide-react";

interface Props {
  data: MonthlyChurnData;
}

const BAR = "#ea580c";
const LINE = "#1e293b";

export function ChurnRateSection({ data }: Props) {
  const [selected, setSelected] = useState<{ month: string; clients: { name: string; revenue: number }[] } | null>(null);

  if (data.months.length === 0) return null;

  const chartData = data.months.map((m) => ({
    month: formatMonth(m.month),
    churnedRevenue: m.churnedRevenue,
    churnPercent: m.churnPercent,
    clients: m.churnedClientList,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Monthly Churn Rate</h2>
        <p className="text-muted-foreground text-sm mt-1">Client churn rate and lost revenue over time</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard title="Avg Monthly Churn" value={formatPercent(data.avgChurnPercent)} icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />} />
        <StatCard title="Total Churned Clients" value={String(data.totalChurned)} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Churn Rate &amp; Lost Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} width={48} />
              <Tooltip formatter={(value, name) => (name === "Churn %" ? `${Number(value)}%` : formatCurrency(Number(value)))} />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="churnedRevenue"
                name="Churned Revenue"
                fill={BAR}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(_, index) => {
                  const m = chartData[index];
                  if (m) setSelected({ month: m.month, clients: m.clients ?? [] });
                }}
              />
              <Line yAxisId="right" dataKey="churnPercent" name="Churn %" stroke={LINE} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Click a bar to see which clients churned that month.</p>

          {selected && (
            <div className="mt-4 border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">
                  Churned in {selected.month} · {selected.clients.length} clients
                </span>
                <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:underline">
                  Close
                </button>
              </div>
              {selected.clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">No clients churned this month.</p>
              ) : (
                <div className="space-y-1">
                  {selected.clients.map((c, i) => (
                    <div key={`${c.name}-${i}`} className="flex items-baseline justify-between text-sm border-b py-1 last:border-0">
                      <span className="truncate mr-2">{c.name}</span>
                      <span className="tabular-nums">{formatCurrency(c.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
