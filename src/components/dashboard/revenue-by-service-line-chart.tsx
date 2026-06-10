"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface Deal { name: string; amount: number }
interface TrendRow {
  month: string;
  rawMonth: string;
  "Content Delivery": number;
  "Social Media Management": number;
  "Ads Management": number;
  deals: Record<string, Deal[]>;
}

const DIVISIONS = [
  { key: "Content Delivery", color: "#ea580c" },
  { key: "Social Media Management", color: "#14b8a6" },
  { key: "Ads Management", color: "#1e293b" },
] as const;

export function RevenueByServiceLineChart({ data }: { data: TrendRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const fmtAxis = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);
  const selectedRow = selected ? data.find((r) => r.month === selected) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Revenue by Service Line</CardTitle>
        <p className="text-muted-foreground text-sm mt-1">Click a month to see the deals making up each service line.</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            margin={{ top: 10, right: 20, bottom: 5, left: 20 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(state: any) => {
              const label = state?.activeLabel;
              if (label != null) setSelected((prev) => (prev === String(label) ? null : String(label)));
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtAxis} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            {DIVISIONS.map((d) => (
              <Line
                key={d.key}
                type="monotone"
                dataKey={d.key}
                stroke={d.color}
                strokeWidth={2}
                dot={{ r: 3, cursor: "pointer" }}
                activeDot={{ r: 5, cursor: "pointer" }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-1 cursor-default">Click anywhere on a month to drill in.</p>

        {selectedRow && (
          <div className="mt-4 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">{selectedRow.month} — revenue by service line</h4>
              <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {DIVISIONS.map((d) => {
                const deals = selectedRow.deals?.[d.key] ?? [];
                const total = selectedRow[d.key] as number;
                return (
                  <div key={d.key}>
                    <div className="flex items-center justify-between text-sm font-medium border-b pb-1 mb-1" style={{ color: d.color }}>
                      <span>{d.key}</span>
                      <span className="tabular-nums">{formatCurrency(total)}</span>
                    </div>
                    {deals.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deals.</p>
                    ) : (
                      deals.map((deal, i) => (
                        <div key={`${deal.name}-${i}`} className="flex items-center justify-between text-xs py-0.5">
                          <span className="truncate mr-2">{deal.name}</span>
                          <span className="tabular-nums text-muted-foreground">{formatCurrency(deal.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
