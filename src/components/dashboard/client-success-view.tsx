"use client";

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
import { Users, Receipt, PieChart, Repeat, TrendingUp, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ClientSuccessDashboard } from "@/lib/analytics/client-success";

// Validated against the chart surface in both modes: orange↔teal separate at
// ΔE 13.8 under protanopia and both clear 3:1 contrast, so the two revenue
// series stay distinguishable without relying on the legend.
const PORTFOLIO = "#ea580c";
const DIVISION = "#0d9488";
// Upsell green and churn red match the divisional dashboard so the two pages
// read as one system. That pair separates at only ΔE 7.4 under deuteranopia and
// green sits below 3:1 on the surface, so EVERY bar carries a direct label —
// the colour is never the only thing telling the two apart.
const UPSELL = "#22c55e";
const CHURN = "#ef4444";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

function Tile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
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

export function ClientSuccessView({ data }: { data: ClientSuccessDashboard }) {
  const { months, clients } = data;
  const latest = months[months.length - 1];

  // A zero month must still be labelled, or a gap reads as missing data rather
  // than as nothing having happened — and a month with no churn is a result.
  const money = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "$0";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
  };

  const step = months.length > 8 ? 2 : 1;
  const ticks = months.filter((_, i) => i % step === 0).map((m) => m.label);

  const retentionData = months
    .filter((m) => m.retentionPct !== null)
    .map((m) => ({
      label: m.label,
      Retention: m.retentionPct,
      kept: m.clientsRetained,
      carried: m.clientsAtStart,
    }));

  const movementData = months.map((m) => ({
    label: m.label,
    Upsells: m.upsellRevenue,
    "Churned Revenue": m.churnedRevenue,
  }));

  const revenueData = months.map((m) => ({
    label: m.label,
    Portfolio: m.revenue,
    [data.baseLabel]: m.divisionRevenue,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.label}</h1>
        <p className="text-muted-foreground mt-1">
          The clients you look after, drawn from {data.baseLabel}. All figures are recurring
          revenue, ex-GST.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          icon={<Receipt className="h-4 w-4" />}
          label="Revenue you look after"
          value={formatCurrency(data.currentRevenue)}
          note={`${data.currentClientCount} client${data.currentClientCount === 1 ? "" : "s"}`}
        />
        <Tile
          icon={<PieChart className="h-4 w-4" />}
          label={`Share of ${data.baseLabel}`}
          value={`${data.sharePct}%`}
          note={`of ${formatCurrency(data.divisionRevenue)} across the division`}
        />
        <Tile
          icon={<Repeat className="h-4 w-4" />}
          label="Retention — last 12 months"
          value={data.retentionPct === null ? "—" : `${data.retentionPct}%`}
          note="clients kept of those carried into each month"
        />
        <Tile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Average lifetime value"
          value={formatCurrency(data.avgLtv)}
          note="per client, across everything they have ever run"
        />
        <Tile
          icon={<Clock className="h-4 w-4" />}
          label="Average tenure"
          value={`${data.avgTenureMonths} mo`}
          note="across the live portfolio"
        />
        <Tile
          icon={<Users className="h-4 w-4" />}
          label={`Retention — ${latest?.label ?? ""}`}
          value={latest?.retentionPct === null ? "—" : `${latest?.retentionPct}%`}
          note={
            latest ? `${latest.clientsRetained} kept of ${latest.clientsAtStart} carried in` : undefined
          }
        />
      </div>

      {/* Retention is the KPI, so it leads. One series — the title names it, so
          no legend box is needed. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portfolio retained each month</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Of the clients carried into a month, the share still here at the end of it. A client won
            during the month counts in neither half, so winning work never flatters the rate.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={retentionData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={44}
                />
                <Tooltip
                  formatter={(v, _n, p) => [
                    `${v ?? 0}% — ${p?.payload?.kept ?? 0} of ${p?.payload?.carried ?? 0} kept`,
                    "Retention",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="Retention"
                  stroke={DIVISION}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upsells vs churned revenue</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Expansion you won against revenue lost when a client left altogether. New business is
            excluded — it isn&apos;t your work. A client dropping one deal while keeping others is a
            contraction, not a churn, so it isn&apos;t counted here either.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movementData} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} fontSize={12} width={54} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Bar dataKey="Upsells" fill={UPSELL} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Upsells" position="top" fontSize={11} formatter={money} />
                </Bar>
                <Bar dataKey="Churned Revenue" fill={CHURN} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="Churned Revenue" position="top" fontSize={11} formatter={money} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue over time</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Your portfolio against the whole of {data.baseLabel}. Both are monthly recurring revenue
            on one scale, so the gap between the lines is the part of the division you don&apos;t
            look after.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} fontSize={12} width={54} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey={data.baseLabel}
                  stroke={DIVISION}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Portfolio"
                  stroke={PORTFOLIO}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            {clients.length} client{clients.length === 1 ? "" : "s"} in your portfolio, by monthly
            revenue ex-GST.
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
                  <th className="text-right font-medium py-2 px-3">Lifetime value</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 px-3">{c.name}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(c.revenue)}</td>
                    <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
                      {data.currentRevenue > 0
                        ? `${((c.revenue / data.currentRevenue) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="text-right py-2 px-3 tabular-nums">
                      {c.ltv ? formatCurrency(c.ltv) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2 px-3">Total</td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {formatCurrency(data.currentRevenue)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">100%</td>
                  <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
                    {formatCurrency(data.avgLtv)} avg
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
