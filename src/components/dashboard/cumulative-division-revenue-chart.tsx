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
// Type-only import: division-fy.ts reaches @/lib/db (Prisma/native modules) via a
// lazy import, so importing any RUNTIME value from it into this client component
// drags server-only code into the browser bundle and breaks `next build`. Keep
// the division list local here.
import type { CumulativeDivisionMonth, Division } from "@/lib/analytics/division-fy";

const DIVISION_ORDER: Division[] = ["Content Delivery", "Social Media Management", "Ads Management"];

// From the dataviz skill (Step 1). Content Delivery anchored to brand orange;
// teal and indigo chosen and validated via scripts/validate_palette.js
// (all-pairs, light + dark) — see task-2-div-report.md for the full readout.
const DIVISION_COLORS: Record<Division, string> = {
  "Content Delivery": "#ea580c",
  "Social Media Management": "#0d9488",
  "Ads Management": "#6366f1",
};

const shortDollars = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function CumulativeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
  return (
    <div className="rounded-md border bg-background p-2 text-xs shadow-sm">
      <div className="mb-1 font-semibold text-[#334155]">{label}</div>
      {payload.map((p: any) => (
        <div key={String(p.name)} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />
            {String(p.name)}
          </span>
          <span className="tabular-nums">{formatCurrency(Number(p.value))}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between gap-4 border-t pt-1 font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
            <Tooltip content={<CumulativeTooltip />} cursor={{ fill: "rgba(100,116,139,0.08)" }} />
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
