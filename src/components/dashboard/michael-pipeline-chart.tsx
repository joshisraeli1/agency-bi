"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PipelineStage } from "@/lib/analytics/michael-sales";

const COLORS: Record<string, string> = {
  Interested: "#94a3b8",
  "Very Warm": "#f59e0b",
  "Contract out": "#6366f1",
  "Closed Won": "#22c55e",
};

export function MichaelPipelineChart({ data }: { data: PipelineStage[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const chartData = data.map((s) => ({ stage: s.stage, count: s.count, value: s.value }));
  const selectedStage = selected ? data.find((s) => s.stage === selected) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Deal Pipeline</CardTitle>
        <p className="text-muted-foreground text-sm mt-1">Michael&apos;s deals by stage. Click a bar to see the deals.</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
            <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} />
            <YAxis type="category" dataKey="stage" tick={{ fontSize: 12 }} width={100} />
            <Tooltip
              cursor={{ fill: "transparent" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, _n: any, item: any) => [`${value} deals · ${formatCurrency(item?.payload?.value ?? 0)}`, "Pipeline"]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(e: any) => {
                const stage: string | undefined = e?.payload?.stage ?? e?.stage;
                setSelected((prev) => (prev === stage ? null : stage ?? null));
              }}
            >
              {chartData.map((d) => (
                <Cell key={d.stage} fill={COLORS[d.stage] ?? "#6366f1"} />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => {
                  const { x, y, width, height, index } = props;
                  const row = chartData[index];
                  if (!row) return null;
                  return (
                    <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={12} fontWeight={600} fill="currentColor">
                      {row.count} · {formatCurrency(row.value)}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {selectedStage && (
          <div className="mt-4 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                {selectedStage.stage} — {selectedStage.count} deal{selectedStage.count !== 1 ? "s" : ""} · {formatCurrency(selectedStage.value)}
              </h4>
              <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
            {selectedStage.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals in this stage.</p>
            ) : (
              <div className="space-y-1">
                {selectedStage.deals.map((d, i) => (
                  <div key={`${d.name}-${i}`} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
                    <span className="truncate mr-2">{d.name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(d.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
