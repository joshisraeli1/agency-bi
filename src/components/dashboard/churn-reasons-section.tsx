"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartColor, TOOLTIP_STYLE } from "@/components/charts/chart-colors";
import { formatMonth } from "@/lib/utils";
import type { ChurnReasonsData } from "@/lib/analytics/churn-reasons";
import { OTHER_REASON } from "@/lib/analytics/churn-reason-labels";

interface Props {
  data: ChurnReasonsData;
}

/** The rollup bucket always sits last in the stack and takes a muted colour. */
const OTHER_COLOR = "#94a3b8";

const colorFor = (reason: string, index: number) =>
  reason === OTHER_REASON ? OTHER_COLOR : getChartColor(index);

export function ChurnReasonsSection({ data }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  if (data.churnedDeals === 0) return null;

  const series = [...data.topReasons, OTHER_REASON];
  const pieData = data.totals.map((t) => ({ name: t.reason, value: t.count }));

  // Recharts needs each series as a flat key on the row.
  const chartData = data.byMonth.map((row) => ({
    month: formatMonth(row.month),
    ...row.counts,
  }));

  const selectedRow = selected
    ? data.byMonth.find((r) => formatMonth(r.month) === selected)
    : null;
  const selectedReasons = selectedRow
    ? Object.entries(selectedRow.deals).sort((a, b) => b[1].length - a[1].length)
    : [];

  const caption = `${data.churnedDeals} churned ${
    data.churnedDeals === 1 ? "deal" : "deals"
  } cited ${data.reasonMentions} ${
    data.reasonMentions === 1 ? "reason" : "reasons"
  } — a deal can have more than one.`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Reasons for Churn</h2>
        <p className="text-muted-foreground text-sm mt-1">{caption}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Total by Reason</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((slice, i) => (
                    <Cell key={slice.name} fill={colorFor(slice.name, i)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  isAnimationActive={false}
                  allowEscapeViewBox={{ x: true, y: true }}
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value)} ${Number(value) === 1 ? "deal" : "deals"}`,
                    String(name),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* A ranked list rather than a pie legend: 13 slice labels overlap
                at this size, and the exact counts are the point. */}
            <div className="mt-2 space-y-1">
              {data.totals.map((t, i) => (
                <div key={t.reason} className="flex items-baseline gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: colorFor(t.reason, i) }}
                  />
                  <span className="truncate">{t.reason}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{t.count}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground w-11 text-right">
                    {((t.count / data.reasonMentions) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Churn Reasons Over Time</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              Deals churned each month by reason. Click a month to see which deals cited what.
            </p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 5, left: 0 }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={(state: any) => {
                  const label = state?.activeLabel;
                  if (label != null)
                    setSelected((prev) => (prev === String(label) ? null : String(label)));
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={36} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  isAnimationActive={false}
                  formatter={(value: unknown, name: unknown) => [Number(value), String(name)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {series.map((reason, i) => (
                  <Bar
                    key={reason}
                    dataKey={reason}
                    name={reason}
                    stackId="a"
                    fill={colorFor(reason, i)}
                    cursor="pointer"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {selectedRow && (
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">Churned in {selected}</span>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Close
                  </button>
                </div>
                {selectedReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No deals churned this month.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedReasons.map(([reason, names]) => (
                      <div key={reason}>
                        <div className="text-sm font-medium">
                          {reason} · {names.length}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {names.join(", ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
