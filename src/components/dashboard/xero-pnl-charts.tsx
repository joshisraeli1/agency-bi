"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { XeroPnlPoint, XeroPnlSeries } from "@/lib/analytics/xero-pnl";

// Validated against the chart surface in light and dark mode (contrast >= 3:1,
// CVD-separable, and separable from the revenue orange used elsewhere).
const EXPENSE_COLOR = "#7c3aed";
const PROFIT_COLOR = "#0d9488";
const LOSS_COLOR = "#dc2626";

const fmtAxis = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${v}`;
};

interface ChartCardProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  headline: string;
  headlineNote: string;
  children: React.ReactNode;
  footnote?: string;
}

function ChartCard({ title, icon, description, headline, headlineNote, children, footnote }: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
        <p className="text-sm mt-2">
          <span className="text-2xl font-semibold tabular-nums">{headline}</span>
          <span className="text-muted-foreground ml-2">{headlineNote}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}


/**
 * Net-profit tooltip: the margin is the number people actually want on hover,
 * and it's already on the data point. The in-progress month is annotated because
 * its margin is inflated — revenue has landed but most bills haven't.
 */
function NetProfitTooltip({
  active, payload, partialMonth,
}: {
  active?: boolean;
  payload?: { payload: XeroPnlPoint }[];
  partialMonth: string | null;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  const isPartial = point.month === partialMonth;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{point.label}</p>
      <p className="mt-1 tabular-nums">
        Net profit <span className="font-medium">{formatCurrency(point.netProfit)}</span>
      </p>
      <p className="tabular-nums">
        Margin{" "}
        <span className="font-medium">
          {point.marginPercent === null ? "—" : `${point.marginPercent.toFixed(1)}%`}
        </span>
        <span className="text-muted-foreground"> of {formatCurrency(point.revenue)} revenue</span>
      </p>
      {isPartial && (
        <p className="mt-1 max-w-[15rem] text-muted-foreground">
          Month still in progress — costs are incomplete, so this margin is overstated.
        </p>
      )}
    </div>
  );
}

function axes(points: XeroPnlPoint[]) {
  // Label every other month past ~8 so ticks never collide.
  const step = points.length > 8 ? 2 : 1;
  return points.filter((_, i) => i % step === 0).map((p) => p.label);
}

export function XeroPnlCharts({ data }: { data: XeroPnlSeries }) {
  const { points, partialMonth } = data;
  if (points.length === 0) return null;

  // The in-progress month is excluded from totals and averages — mixing a
  // part-month into them understates both.
  const complete = partialMonth ? points.filter((p) => p.month !== partialMonth) : points;
  const latest = complete[complete.length - 1];
  const ticks = axes(points);
  const partialLabel = partialMonth ? points.find((p) => p.month === partialMonth)?.label : null;
  const partialNote = partialLabel
    ? `${partialLabel} is still in progress, so its bar is a part-month and is excluded from the figures above.`
    : undefined;

  const avgExpenses = complete.length
    ? complete.reduce((s, p) => s + p.expenses, 0) / complete.length
    : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard
        title="Monthly Expenses"
        icon={<Receipt className="h-4 w-4" />}
        description="Cost of sales plus operating expenses from the Xero P&L (ex-GST)."
        headline={latest ? formatCurrency(latest.expenses) : "—"}
        headlineNote={latest ? `in ${latest.label} · ${formatCurrency(Math.round(avgExpenses))} monthly average` : ""}
        footnote={partialNote}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(value) => [formatCurrency(Number(value ?? 0)), "Expenses"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Net Profit"
        icon={<TrendingUp className="h-4 w-4" />}
        description="Xero's Net Profit line — income less all costs (ex-GST)."
        headline={latest ? formatCurrency(latest.netProfit) : "—"}
        headlineNote={
          latest
            ? `in ${latest.label}${latest.marginPercent !== null ? ` · ${latest.marginPercent.toFixed(1)}% margin` : ""}`
            : ""
        }
        footnote={partialNote}
      >
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              content={<NetProfitTooltip partialMonth={partialMonth} />}
            />
            {/* Zero line so a loss month reads as below the baseline, not just a different colour. */}
            <ReferenceLine y={0} className="stroke-muted-foreground" strokeWidth={1} />
            <Bar dataKey="netProfit" radius={[4, 4, 0, 0]} maxBarSize={44}>
              {points.map((p) => (
                <Cell key={p.month} fill={p.netProfit >= 0 ? PROFIT_COLOR : LOSS_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
