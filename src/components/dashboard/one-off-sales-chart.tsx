"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { OneOffSales, OneOffMonth } from "@/lib/analytics/one-off-sales";

// Its own hue: one-off work is neither recurring revenue nor churn, and
// borrowing either of those colours would imply it belongs to that story.
const ONE_OFF = "#7c3aed";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

export function OneOffSalesChart({ data }: { data: OneOffSales }) {
  const [selected, setSelected] = useState<OneOffMonth | null>(null);
  const { months } = data;
  if (months.length === 0) return null;

  const latest = months[months.length - 1];
  const step = months.length > 8 ? 2 : 1;
  const ticks = months.filter((_, i) => i % step === 0).map((m) => m.label);

  // A zero month still gets a label — a gap reads as missing data rather than
  // as a month where no project work was sold.
  const money = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "$0";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4" />
          One-off Packages Sold
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Project work sold each month — shoots, statics, websites, campaign pieces. Excluded from
          recurring revenue everywhere else, because a one-off has no retainer and no term; this is
          where it is counted on its own terms. Click a bar for the packages behind it.
        </p>
        <p className="text-sm mt-2">
          <span className="text-2xl font-semibold tabular-nums">
            {formatCurrency(data.totalRevenue)}
          </span>
          <span className="text-muted-foreground ml-2">
            across {data.totalCount} package{data.totalCount === 1 ? "" : "s"} · averaging{" "}
            {formatCurrency(data.avgValue)} · {latest.count} sold in {latest.label}
          </span>
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={months} margin={{ top: 20, right: 12, bottom: 4, left: 4 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(value, _n, item) => [
                `${formatCurrency(Number(value ?? 0))} · ${item?.payload?.count ?? 0} package${
                  item?.payload?.count === 1 ? "" : "s"
                }`,
                "Sold",
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar
              dataKey="revenue"
              fill={ONE_OFF}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
              minPointSize={2}
              cursor="pointer"
              onClick={(bar) => {
                const key = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                const m = months.find((x) => x.month === key);
                if (m) setSelected(m);
              }}
            >
              {/* The count rides on the label rather than a second axis — a
                  dollar scale and a package count cannot share one. */}
              <LabelList dataKey="revenue" position="top" fontSize={10} formatter={money} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {selected && (
          <div className="rounded-lg border p-4 mt-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-sm">
                Sold in {selected.label}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {selected.count} package{selected.count === 1 ? "" : "s"} ·{" "}
                  {formatCurrency(selected.revenue)}
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
              {selected.deals.map((d) => (
                <li key={d.id} className="flex justify-between gap-4">
                  <span>
                    {d.name}
                    <span className="text-muted-foreground"> · {d.division}</span>
                  </span>
                  <span className="tabular-nums shrink-0">{formatCurrency(d.revenue)}</span>
                </li>
              ))}
              {selected.deals.length === 0 && (
                <li className="text-muted-foreground">No one-off work sold this month.</li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
