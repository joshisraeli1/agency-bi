"use client";

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
import { formatCurrency } from "@/lib/utils";
import type { CumulativeDivisionMonth } from "@/lib/analytics/division-fy";

// From the dataviz skill (Step 1). Content Delivery anchored to brand orange;
// teal and indigo chosen and validated via scripts/validate_palette.js
// (all-pairs, light + dark) — see task-2-div-report.md for the full readout.
const DIVISION_COLORS: Record<string, string> = {
  "Content Delivery": "#ea580c",
  "Social Media Management": "#0d9488",
  "Ads Management": "#6366f1",
};
const DIVISION_ORDER = ["Content Delivery", "Social Media Management", "Ads Management"] as const;

const shortDollars = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`;

export function CumulativeDivisionRevenueChart({ data }: { data: CumulativeDivisionMonth[] }) {
  const fyLabel = data.length ? `FY${data[0].rawMonth.slice(2, 4)}/${String(Number(data[0].rawMonth.slice(0, 4)) + 1).slice(2)}` : "FY";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative Revenue by Division — {fyLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} barGap={0} barCategoryGap="20%" margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis tickFormatter={shortDollars} tick={{ fontSize: 12, fill: "#64748b" }} width={56} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              labelStyle={{ color: "#334155", fontWeight: 600 }}
            />
            <Legend />
            {DIVISION_ORDER.map((div) => (
              <Bar key={div} dataKey={div} fill={DIVISION_COLORS[div]} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
