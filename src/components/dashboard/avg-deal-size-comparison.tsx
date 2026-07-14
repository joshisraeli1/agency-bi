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

export function AvgDealSizeComparisonCard({ data }: { data: AvgDealSizeComparison }) {
  const { prevLabel, currLabel, rows } = data;

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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Avg. Deal Size Improvements
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Average deal size per package type (ex-GST) — {prevLabel} vs {currLabel}.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 24, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="division" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtAxis} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            <Bar dataKey={prevLabel} fill={PREV_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
            <Bar dataKey={currLabel} fill={CURR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
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
