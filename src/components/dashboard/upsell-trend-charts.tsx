"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpRight, Percent } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { UpsellMonth } from "@/lib/analytics/upsell-trend";

const UPSELL_COLOR = "#0d9488";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

export function UpsellTrendCharts({ data }: { data: UpsellMonth[] }) {
  if (data.length === 0) return null;

  const latest = data[data.length - 1];
  const step = data.length > 8 ? 2 : 1;
  const ticks = data.filter((_, i) => i % step === 0).map((m) => m.label);

  return (
    // Two charts rather than one with a second axis: dollars and percent are
    // different scales, and a dual-axis chart invites false correlations.
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpRight className="h-4 w-4" />
            Upsell Revenue by Month
          </CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly recurring revenue (ex-GST) from live upsell deals.
          </p>
          <p className="text-sm mt-2">
            <span className="text-2xl font-semibold tabular-nums">{formatCurrency(latest.upsellRevenue)}</span>
            <span className="text-muted-foreground ml-2">
              in {latest.label} · {latest.upsellCount} upsells live
            </span>
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                formatter={(value, _name, item) => [
                  `${formatCurrency(Number(value ?? 0))} · ${item?.payload?.upsellCount ?? 0} deals`,
                  "Upsell revenue",
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Bar dataKey="upsellRevenue" fill={UPSELL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" />
            Upsells as a Share of Revenue
          </CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Upsell revenue as a percentage of the whole recurring book that month.
          </p>
          <p className="text-sm mt-2">
            <span className="text-2xl font-semibold tabular-nums">{latest.upsellPercent}%</span>
            <span className="text-muted-foreground ml-2">
              in {latest.label} · {formatCurrency(latest.totalRevenue)} total book
            </span>
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
                width={44}
              />
              <Tooltip
                formatter={(value, _name, item) => [
                  `${Number(value ?? 0).toFixed(1)}% · ${formatCurrency(Number(item?.payload?.upsellRevenue ?? 0))} of ${formatCurrency(Number(item?.payload?.totalRevenue ?? 0))}`,
                  "Upsell share",
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Line
                type="monotone"
                dataKey="upsellPercent"
                stroke={UPSELL_COLOR}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
