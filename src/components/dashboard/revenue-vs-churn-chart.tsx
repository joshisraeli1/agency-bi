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
  // Recurring-only by default: a one-off starting is not new recurring revenue
  // and a one-off ending is not churn, so project work makes a busy month look
  // like a wave of wins followed by a wave of losses.
  const [recurringOnly, setRecurringOnly] = useState(true);

  // Both series ship with the page, so the switch is instant and the two views
  // can never disagree about the month they describe.
  const view = (d: Props["data"][number]) => (recurringOnly ? d.recurring : d);

  const chartData = data.map((d) => ({
    month: formatMonth(d.month),
    rawMonth: d.month,
    "New Revenue": view(d).newRevenue,
    "Churned Revenue": view(d).churnedRevenue,
    net: view(d).net,
  }));

  // "$0" rather than a blank: an unlabelled zero leaves a gap where a bar should
  // be, which reads as missing data instead of a month where nothing churned.
  const formatLabel = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "$0";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
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

  const expandedClients = !expandedRow
    ? undefined
    : expanded?.type === "new"
      ? view(expandedRow).newClients
      : view(expandedRow).churnedClients;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>New Revenue vs Churn</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              {recurringOnly
                ? "Recurring work only — one-off projects and ad-hoc jobs excluded from both sides."
                : "All work, including one-off projects and ad-hoc jobs."}
            </p>
          </div>
          <div className="flex items-center rounded-md border shrink-0">
            <button
              onClick={() => setRecurringOnly(true)}
              className={`px-3 py-1.5 text-sm rounded-l-md ${
                recurringOnly ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              Recurring only
            </button>
            <button
              onClick={() => setRecurringOnly(false)}
              className={`px-3 py-1.5 text-sm rounded-r-md ${
                !recurringOnly ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              All revenue
            </button>
          </div>
        </div>
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
              minPointSize={2}
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
              minPointSize={2}
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
                    key={client.entryKey ?? client.id}
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
