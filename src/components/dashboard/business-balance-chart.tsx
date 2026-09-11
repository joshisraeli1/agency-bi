"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { BusinessBalancePeriod } from "@/lib/analytics/business-balance";

// Validated as a four-colour set against the chart surface in light and dark
// mode: contrast >= 3:1, CVD-separable, normal-vision separation well clear.
const SEGMENTS = [
  { key: "Cost of Sales", color: "#7c3aed" },
  { key: "Direct Labour", color: "#ea580c" },
  { key: "Overheads", color: "#dc2626" },
  { key: "Operating Profit", color: "#0d9488" },
] as const;

export function BusinessBalanceChart({ data }: { data: BusinessBalancePeriod[] }) {
  if (data.length === 0) return null;

  const chartData = data.map((y) => {
    const row: Record<string, string | number> = { label: y.label, income: y.income };
    for (const s of y.segments) {
      row[s.label] = s.percent;
      row[`${s.label}__amount`] = s.amount;
    }
    return row;
  });

  const hasLoss = data.some((y) => y.segments.some((seg) => seg.key === "profit" && seg.percent < 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4" />
          Business Balance: How Revenue Splits Across Costs and Profit
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Every revenue dollar by financial-year quarter, from the Xero P&amp;L. Direct labour is
          the wage and superannuation cost inside cost of sales; overhead salaries sit in
          Overheads. Complete quarters only — the current one has costs still to be booked.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            data={chartData}
            margin={{ top: 12, right: 16, bottom: 4, left: 4 }}
            barCategoryGap="18%"
            // Without this a negative segment stacks on TOP of the positives, so a
            // loss renders as a band above 100% instead of below the zero line.
            stackOffset="sign"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(value, name, item) => {
                const amount = item?.payload?.[`${String(name)}__amount`];
                return [
                  `${Number(value ?? 0).toFixed(1)}%${typeof amount === "number" ? ` · ${formatCurrency(amount)}` : ""}`,
                  String(name),
                ];
              }}
              labelFormatter={(label, items) => {
                const income = items?.[0]?.payload?.income;
                return `${label}${typeof income === "number" ? ` — ${formatCurrency(income)} revenue` : ""}`;
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            {/* A loss year puts the profit segment below the baseline, so the zero
                line has to be visible for the bar to be readable. */}
            <ReferenceLine y={0} className="stroke-muted-foreground" strokeWidth={1} />
            {SEGMENTS.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="a"
                fill={s.color}
                maxBarSize={72}
                radius={i === SEGMENTS.length - 1 ? [4, 4, 0, 0] : undefined}
              >
                <LabelList
                  dataKey={s.key}
                  position="center"
                  className="fill-white"
                  fontSize={11}
                  formatter={(v: unknown) => (Math.abs(Number(v)) >= 6 ? `${Number(v).toFixed(0)}%` : "")}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        {hasLoss && (
          <p className="text-xs text-muted-foreground">
            A negative Operating Profit segment sits below the zero line — the cost segments
            then exceed 100% of revenue, which is what a loss-making quarter looks like.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
