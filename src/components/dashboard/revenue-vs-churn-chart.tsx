"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { RevenueVsChurnRow } from "@/lib/analytics/revenue-overview";

interface Props {
  data: RevenueVsChurnRow[];
}

type ExpandedState = { month: string; type: "new" | "churn" } | null;

export function RevenueVsChurnChart({ data }: Props) {
  const [expanded, setExpanded] = useState<ExpandedState>(null);

  const chartData = data.map((d) => ({
    month: formatMonth(d.month),
    rawMonth: d.month,
    "New Revenue": d.newRevenue,
    "Churned Revenue": d.churnedRevenue,
    net: d.net,
  }));

  const formatLabel = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${v}`;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleBarClick = (dataKey: "new" | "churn") => (entry: any) => {
    if (!entry?.rawMonth) return;
    setExpanded((prev) =>
      prev !== null && prev.month === entry.rawMonth && prev.type === dataKey
        ? null
        : { month: entry.rawMonth, type: dataKey }
    );
  };

  const expandedRow = expanded
    ? data.find((d) => d.month === expanded.month)
    : null;

  const expandedClients =
    expanded?.type === "new"
      ? expandedRow?.newClients
      : expandedRow?.churnedClients;

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Revenue vs Churn</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => {
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
                return `$${v}`;
              }}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            <Bar
              dataKey="New Revenue"
              fill="#22c55e"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={handleBarClick("new")}
            >
              <LabelList
                dataKey="New Revenue"
                position="top"
                formatter={formatLabel}
                style={{ fontSize: 11, fill: "#22c55e", fontWeight: 600 }}
              />
            </Bar>
            <Bar
              dataKey="Churned Revenue"
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={handleBarClick("churn")}
            >
              <LabelList
                dataKey="Churned Revenue"
                position="top"
                formatter={formatLabel}
                style={{ fontSize: 11, fill: "#ef4444", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {expanded && expandedClients && (
          <div className="mt-4 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                {expanded.type === "new" ? "New Clients" : "Churned Clients"} &mdash;{" "}
                {formatMonth(expanded.month)}
              </h4>
              <button
                onClick={() => setExpanded(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            {expandedClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients for this month.</p>
            ) : (
              <div className="space-y-1">
                {expandedClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium hover:underline"
                    >
                      {client.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {formatCurrency(client.retainerValue)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold border-t pt-1 mt-2">
                  <span>Total</span>
                  <span>
                    {formatCurrency(
                      expandedClients.reduce((s, c) => s + c.retainerValue, 0)
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
