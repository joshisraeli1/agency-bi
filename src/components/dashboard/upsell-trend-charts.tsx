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
import { ArrowUpRight, Percent } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { UpsellMonth } from "@/lib/analytics/upsell-trend";

const UPSELL_COLOR = "#0d9488";
// The same green and red the New Revenue vs Churn chart uses, so won-and-lost
// reads the same way wherever it appears. That pair separates at only dE 7.4
// under deuteranopia and the green sits under 3:1 on the surface, so every bar
// carries a direct label and colour is never the only signal.
const WON_COLOR = "#22c55e";
const LOST_COLOR = "#ef4444";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

export function UpsellTrendCharts({ data }: { data: UpsellMonth[] }) {
  const [selected, setSelected] = useState<UpsellMonth | null>(null);
  const [movement, setMovement] = useState<{ month: UpsellMonth; kind: "won" | "lost" } | null>(null);
  if (data.length === 0) return null;

  const latest = data[data.length - 1];
  const money = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "$0";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
  };
  const movementData = data.map((m) => ({
    month: m.month,
    label: m.label,
    "Upsells won": m.newUpsellRevenue,
    "Upsells lost": m.churnedUpsellRevenue,
  }));
  const wonTotal = data.reduce((s2, m) => s2 + m.newUpsellRevenue, 0);
  const lostTotal = data.reduce((s2, m) => s2 + m.churnedUpsellRevenue, 0);
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
            Monthly recurring revenue (ex-GST) from live upsell deals. Click a bar to see which
            deals make it up.
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
              <Bar
                dataKey="upsellRevenue"
                fill={UPSELL_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={44}
                cursor="pointer"
                onClick={(bar) => {
                  const key = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                  const m = data.find((x) => x.month === key);
                  if (m) setSelected(m);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          {selected && (
            <div className="rounded-lg border p-4 mt-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-sm">
                  Upsells live in {selected.label}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {selected.upsells.length} deal{selected.upsells.length === 1 ? "" : "s"} ·{" "}
                    {formatCurrency(selected.upsellRevenue)}
                  </span>
                </p>
                <button
                  onClick={() => setSelected(null)}
                  className="text-sm text-muted-foreground hover:underline shrink-0"
                >
                  Close
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm max-h-64 overflow-y-auto">
                {selected.upsells.map((u) => (
                  <li key={u.id} className="flex justify-between gap-4">
                    <span>{u.name}</span>
                    <span className="tabular-nums">{formatCurrency(u.revenue)}</span>
                  </li>
                ))}
                {selected.upsells.length === 0 && (
                  <li className="text-muted-foreground">No upsells live this month.</li>
                )}
              </ul>
            </div>
          )}
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

      {/* Full width beneath the pair: this is the flow, and it is the chart
          most likely to be read month to month. */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpRight className="h-4 w-4" />
            Upsells Won vs Lost
          </CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Upsell revenue won in each month against upsell revenue that ended. The charts above
            are the running book; this is what actually moved. Click a bar for the deals behind it.
          </p>
          <p className="text-sm mt-2">
            <span className="text-2xl font-semibold tabular-nums">{formatCurrency(wonTotal)}</span>
            <span className="text-muted-foreground ml-2">
              won across the window · {formatCurrency(lostTotal)} lost · net{" "}
              {formatCurrency(wonTotal - lostTotal)}
            </span>
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={movementData} margin={{ top: 20, right: 12, bottom: 4, left: 4 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
              <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} />
              <Tooltip
                cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
                formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
              <Legend />
              <Bar
                dataKey="Upsells won"
                fill={WON_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={34}
                minPointSize={2}
                cursor="pointer"
                onClick={(bar) => {
                  const key = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                  const m = data.find((x) => x.month === key);
                  if (m) setMovement({ month: m, kind: "won" });
                }}
              >
                <LabelList dataKey="Upsells won" position="top" fontSize={10} formatter={money} />
              </Bar>
              <Bar
                dataKey="Upsells lost"
                fill={LOST_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={34}
                minPointSize={2}
                cursor="pointer"
                onClick={(bar) => {
                  const key = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                  const m = data.find((x) => x.month === key);
                  if (m) setMovement({ month: m, kind: "lost" });
                }}
              >
                <LabelList dataKey="Upsells lost" position="top" fontSize={10} formatter={money} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {movement && (
            <div className="rounded-lg border p-4 mt-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-sm">
                  Upsells {movement.kind} in {movement.month.label}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    ·{" "}
                    {formatCurrency(
                      movement.kind === "won"
                        ? movement.month.newUpsellRevenue
                        : movement.month.churnedUpsellRevenue
                    )}
                  </span>
                </p>
                <button
                  onClick={() => setMovement(null)}
                  className="text-sm text-muted-foreground hover:underline shrink-0"
                >
                  Close
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm max-h-64 overflow-y-auto">
                {(movement.kind === "won" ? movement.month.newUpsells : movement.month.churnedUpsells).map((u) => (
                  <li key={u.id} className="flex justify-between gap-4">
                    <span>{u.name}</span>
                    <span className="tabular-nums">{formatCurrency(u.revenue)}</span>
                  </li>
                ))}
                {(movement.kind === "won" ? movement.month.newUpsells : movement.month.churnedUpsells).length === 0 && (
                  <li className="text-muted-foreground">
                    {movement.kind === "won" ? "No upsells won this month." : "No upsells ended this month."}
                  </li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
