"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { RevenueVsChurnRow } from "@/lib/analytics/revenue-overview";

interface Props {
  data: RevenueVsChurnRow[];
}

export function RevenueVsChurnChart({ data }: Props) {
  const chartData = data.map((d) => ({
    month: formatMonth(d.month),
    "New Revenue": d.newRevenue,
    "Churned Revenue": -d.churnedRevenue, // negative for visual separation
    net: d.net,
    rawNew: d.newRevenue,
    rawChurn: d.churnedRevenue,
  }));

  const formatLabel = (value: unknown) => {
    const abs = Math.abs(Number(value));
    if (abs === 0) return "";
    if (abs >= 1000) return `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
    return `$${abs}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Revenue vs Churn</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => {
                const abs = Math.abs(v);
                if (abs >= 1000) return `$${(abs / 1000).toFixed(0)}K`;
                return `$${abs}`;
              }}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Math.abs(Number(value))), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            <Bar dataKey="New Revenue" fill="#22c55e" radius={[4, 4, 0, 0]}>
              <LabelList
                dataKey="New Revenue"
                position="top"
                formatter={formatLabel}
                style={{ fontSize: 11, fill: "#22c55e", fontWeight: 600 }}
              />
            </Bar>
            <Bar dataKey="Churned Revenue" fill="#ef4444" radius={[0, 0, 4, 4]}>
              <LabelList
                dataKey="Churned Revenue"
                position="bottom"
                formatter={formatLabel}
                style={{ fontSize: 11, fill: "#ef4444", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
