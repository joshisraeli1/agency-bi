"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LabelList,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Receipt, ArrowLeftRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { DivisionDashboard, DivisionMonth } from "@/lib/analytics/division-dashboard";

// Reuses the set already validated for this dashboard: contrast >= 3:1 and
// CVD-separable against the chart surface in both light and dark mode.
const REVENUE_COLOR = "#ea580c";
// Matches the overview's New Revenue vs Churn chart, so the two read as one
// system rather than two takes on the same measure.
const NEW_COLOR = "#22c55e";
const CHURN_COLOR = "#ef4444";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

function Tile({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold tabular-nums mt-2">{value}</p>
        {note && <p className="text-muted-foreground text-xs mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}

export function DivisionDashboardView({
  data,
  displayName,
}: {
  data: DivisionDashboard;
  displayName: string;
}) {
  const [selected, setSelected] = useState<{ month: DivisionMonth; kind: "new" | "churn" } | null>(null);

  const { months, clients } = data;
  const latest = months[months.length - 1];
  const prev = months[months.length - 2];
  const change = prev && prev.revenue > 0 ? ((latest.revenue - prev.revenue) / prev.revenue) * 100 : null;

  const step = months.length > 8 ? 2 : 1;
  const ticks = months.filter((_, i) => i % step === 0).map((m) => m.label);

  // Both series positive and drawn side by side, as on the overview. Churn as a
  // negative made the axis run below zero and the bars read as a diverging
  // measure, which is harder to compare at a glance than two bars of equal footing.
  const movementData = months.map((m) => ({
    label: m.label,
    "New Revenue": m.newRevenue,
    "Churned Revenue": m.churnedRevenue,
    month: m.month,
  }));

  const formatLabel = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${v}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{displayName}</h1>
        <p className="text-muted-foreground mt-1">
          Your division&apos;s recurring revenue. All figures exclude GST.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<Receipt className="h-4 w-4" />}
          label="Revenue this month"
          value={formatCurrency(data.currentRevenue)}
          note={change === null ? undefined : `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs ${prev.label}`}
        />
        <Tile icon={<Users className="h-4 w-4" />} label="Clients" value={String(data.currentClientCount)} />
        <Tile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Average deal size"
          value={formatCurrency(data.avgDealSize)}
        />
        <Tile
          icon={<ArrowLeftRight className="h-4 w-4" />}
          label={`Net movement — ${latest.label}`}
          value={formatCurrency(latest.newRevenue - latest.churnedRevenue)}
          note={`+${formatCurrency(latest.newRevenue)} new · −${formatCurrency(latest.churnedRevenue)} churned`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue Over Time</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly recurring revenue for {displayName}, ex-GST.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={months} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={52} />
              <Tooltip
                formatter={(value, _n, item) => [
                  `${formatCurrency(Number(value ?? 0))} · ${item?.payload?.clientCount ?? 0} clients`,
                  "Revenue",
                ]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Line type="monotone" dataKey="revenue" stroke={REVENUE_COLOR} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New vs Churned Revenue</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Revenue won and lost each month. Click a bar to see which clients.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={movementData} margin={{ top: 20, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={52} />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Legend />
              <Bar
                dataKey="New Revenue"
                fill={NEW_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={34}
                cursor="pointer"
                onClick={(bar) => {
                  const month = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                  const m = months.find((x) => x.month === month);
                  if (m) setSelected({ month: m, kind: "new" });
                }}
              >
                <LabelList
                  dataKey="New Revenue"
                  position="top"
                  formatter={formatLabel}
                  style={{ fontSize: 10, fill: NEW_COLOR, fontWeight: 600 }}
                />
              </Bar>
              <Bar
                dataKey="Churned Revenue"
                fill={CHURN_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={34}
                cursor="pointer"
                onClick={(bar) => {
                  const month = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                  const m = months.find((x) => x.month === month);
                  if (m) setSelected({ month: m, kind: "churn" });
                }}
              >
                <LabelList
                  dataKey="Churned Revenue"
                  position="top"
                  formatter={formatLabel}
                  style={{ fontSize: 10, fill: CHURN_COLOR, fontWeight: 600 }}
                />
              </Bar>
          </BarChart>
          </ResponsiveContainer>

          {selected && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">
                  {selected.kind === "new" ? "New" : "Churned"} — {selected.month.label}
                </p>
                <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:underline">
                  Close
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {(selected.kind === "new" ? selected.month.newClients : selected.month.churnedClients).map((c, i) => (
                  <li key={`${c.id}-${i}`} className="flex justify-between">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{formatCurrency(c.revenue)}</span>
                  </li>
                ))}
                {(selected.kind === "new" ? selected.month.newClients : selected.month.churnedClients).length === 0 && (
                  <li className="text-muted-foreground">Nothing this month.</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            {clients.length} live client{clients.length === 1 ? "" : "s"} in {displayName}, by monthly revenue ex-GST.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-2 px-3">Client</th>
                  <th className="text-right font-medium py-2 px-3">Revenue (MRR)</th>
                  <th className="text-right font-medium py-2 px-3">Share</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 px-3 font-medium">{c.name}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(c.revenue)}</td>
                    <td className="text-right py-2 px-3 tabular-nums">
                      {data.currentRevenue > 0 ? ((c.revenue / data.currentRevenue) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 px-3">Total</td>
                  <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(data.currentRevenue)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
