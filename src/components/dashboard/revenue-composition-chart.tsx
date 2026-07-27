"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatMonth } from "@/lib/utils";
import type { RevenueCompositionRow } from "@/lib/analytics/active-revenue";

interface Props {
  rows: RevenueCompositionRow[];
  windowMonths: string[];
}

const EXISTING = "#cbd5e1"; // slate-300 — established base
const NEW = "#ea580c"; // brand orange — new business
const UPSELL = "#14b8a6"; // teal — expansion

export function RevenueCompositionChart({ rows, windowMonths }: Props) {
  const [selected, setSelected] = useState<RevenueCompositionRow | null>(null);

  const windowLabel =
    windowMonths.length > 0
      ? `${formatMonth(windowMonths[0])}–${formatMonth(windowMonths[windowMonths.length - 1])}`
      : "recent";

  const chartData = rows.map((r) => ({
    name: r.packageType.replace(" Management", "").replace(" Paid", ""),
    Existing: r.existing,
    [`New (${windowLabel})`]: r.newRevenue,
    Upsell: r.upsell,
  }));
  const newKey = `New (${windowLabel})`;

  const fmtAxis = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);
  const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue Composition — New vs Upsell vs Base</CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Each package type&apos;s closed-won revenue (ex-GST) split into established base, new deals won in {windowLabel}, and upsells. Excludes one-off / ad-hoc work.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtAxis} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            <Bar dataKey="Existing" stackId="a" fill={EXISTING} maxBarSize={90} />
            <Bar dataKey={newKey} stackId="a" fill={NEW} maxBarSize={90} />
            <Bar
              dataKey="Upsell"
              stackId="a"
              fill={UPSELL}
              maxBarSize={90}
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(_, index) => setSelected(rows[index] ?? null)}
            />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">Click a bar to see the new deals and upsells in that package type.</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {rows.map((r) => (
            <button
              key={r.packageType}
              onClick={() => setSelected((s) => (s?.packageType === r.packageType ? null : r))}
              className="text-left rounded-lg border p-3 hover:bg-muted/40 transition-colors"
            >
              <div className="text-sm font-medium">{r.packageType}</div>
              <div className="text-lg font-bold tabular-nums">{formatCurrency(r.total)}</div>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <div>Base: {formatCurrency(r.existing)} ({pct(r.existing, r.total)})</div>
                <div className="text-orange-600">New: {formatCurrency(r.newRevenue)} ({pct(r.newRevenue, r.total)})</div>
                <div className="text-teal-600">Upsell: {formatCurrency(r.upsell)} ({pct(r.upsell, r.total)})</div>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="mt-4 border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{selected.packageType} — new deals & upsells</span>
              <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:underline">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-orange-600 border-b pb-1 mb-1">New ({windowLabel}) · {formatCurrency(selected.newRevenue)}</div>
                {selected.newDeals.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : selected.newDeals.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="flex items-baseline justify-between text-xs py-0.5">
                    <span className="truncate mr-2">{d.name} <span className="text-muted-foreground">· {formatMonth(d.month)}</span></span>
                    <span className="tabular-nums">{formatCurrency(d.revenue)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs font-semibold text-teal-600 border-b pb-1 mb-1">Upsells · {formatCurrency(selected.upsell)}</div>
                {selected.upsellDeals.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : selected.upsellDeals.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="flex items-baseline justify-between text-xs py-0.5">
                    <span className="truncate mr-2">{d.name}</span>
                    <span className="tabular-nums">{formatCurrency(d.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
