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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { AvgDealSizeComparison } from "@/lib/analytics/avg-deal-size-comparison";

const PREV_COLOR = "#94a3b8"; // slate — prior year
const CURR_COLOR = "#ea580c"; // orange — current year

const monthsBack = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const labelOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleString("en-AU", { month: "short", year: "numeric" });
};

export function AvgDealSizeComparisonCard({ data }: { data: AvgDealSizeComparison }) {
  const { selectableMonths, byMonth } = data;
  // Default to the newest month the picker offers, so the card follows the data
  // rather than staying pinned to the month it was first built against.
  const [curr, setCurr] = useState(
    selectableMonths.length > 0 ? selectableMonths[selectableMonths.length - 1].month : data.currMonth
  );
  const prev = monthsBack(curr, 12);
  const prevLabel = labelOf(prev);
  const currLabel = labelOf(curr);

  // Recompute the rows for the chosen month from the shipped per-month stats.
  const rows = data.rows.map((r) => {
    const p = byMonth[prev]?.[r.division] ?? { avg: 0, count: 0 };
    const c = byMonth[curr]?.[r.division] ?? { avg: 0, count: 0 };
    return {
      division: r.division,
      prevAvg: p.avg,
      currAvg: c.avg,
      prevCount: p.count,
      currCount: c.count,
      growthPct: p.avg > 0 ? ((c.avg - p.avg) / p.avg) * 100 : null,
    };
  });

  const fmtAxis = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);
  const fmtPct = (p: number | null) =>
    p === null ? "—" : `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;

  // Shorten the long bucket label for the x-axis.
  const shortDiv = (d: string) => d.replace(" Management", "").replace(" Paid", "");
  const chartData = rows.map((r) => ({
    division: shortDiv(r.division),
    [prevLabel]: r.prevAvg,
    [currLabel]: r.currAvg,
    growthPct: r.growthPct,
  }));

  return (
    <Card>
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Avg. Deal Size Improvements
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Average deal size per package type (ex-GST) — {prevLabel} vs {currLabel}.
        </p>
        {selectableMonths.length > 1 && (
          <div className="absolute right-6 top-6 flex items-center gap-2">
            <label htmlFor="adsc-month" className="text-xs text-muted-foreground">
              Compare
            </label>
            <select
              id="adsc-month"
              value={curr}
              onChange={(e) => setCurr(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {selectableMonths.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.label} vs {labelOf(monthsBack(m.month, 12))}
                </option>
              ))}
            </select>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 24, right: 20, bottom: 5, left: 20 }} barGap={4} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="division" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtAxis} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            <Bar dataKey={prevLabel} fill={PREV_COLOR} radius={[4, 4, 0, 0]} maxBarSize={72} />
            <Bar dataKey={currLabel} fill={CURR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={72} />
          </BarChart>
        </ResponsiveContainer>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package type</TableHead>
              <TableHead className="text-right">{prevLabel}</TableHead>
              <TableHead className="text-right">{currLabel}</TableHead>
              <TableHead className="text-right">Growth</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.division}>
                <TableCell className="font-medium">{r.division}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.prevAvg)}
                  <span className="text-muted-foreground text-xs ml-1">({r.prevCount})</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(r.currAvg)}
                  <span className="text-muted-foreground text-xs ml-1">({r.currCount})</span>
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-medium ${
                    r.growthPct === null ? "text-muted-foreground" : r.growthPct >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {fmtPct(r.growthPct)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">Counts of active deals in each month shown in brackets.</p>
      </CardContent>
    </Card>
  );
}
