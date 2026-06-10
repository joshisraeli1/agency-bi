"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { RevenueForecast } from "@/lib/analytics/forecast";

interface Props {
  data: RevenueForecast;
}

const SLATE = "#475569";
const GREEN = "#22c55e";
const RED = "#ef4444";
const BLUE = "#2563eb";

type Kind = "current" | "in" | "out" | "projected";

export function RevenueForecastSection({ data }: Props) {
  const [expanded, setExpanded] = useState<"in" | "out" | null>(null);

  const { currentMrr, incoming, outgoing, projected, horizonMonths } = data;
  const short = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

  // Waterfall via a transparent `base` segment with a visible `value` on top.
  const chartData: { name: string; kind: Kind; base: number; value: number; color: string; label: string }[] = [
    { name: "Current MRR", kind: "current", base: 0, value: currentMrr, color: SLATE, label: short(currentMrr) },
    { name: "Incoming", kind: "in", base: currentMrr, value: incoming, color: GREEN, label: `+${short(incoming)}` },
    { name: "Outgoing", kind: "out", base: projected, value: outgoing, color: RED, label: `−${short(outgoing)}` },
    { name: "Projected", kind: "projected", base: 0, value: projected, color: BLUE, label: short(projected) },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (entry: any) => {
    const kind: Kind | undefined = entry?.kind;
    if (kind === "in" || kind === "out") setExpanded((prev) => (prev === kind ? null : kind));
  };

  const drillDeals = expanded === "in" ? data.incomingDeals : expanded === "out" ? data.outgoingDeals : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Forecast</CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          How current MRR bridges to projected MRR over the next {horizonMonths} months — revenue coming
          in (signed Contract Out) vs going out (churning). Click Incoming or Outgoing for the deals.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={chartData} margin={{ top: 24, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => short(v)} />
            <Tooltip
              cursor={{ fill: "transparent" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const d = payload.find((p: any) => p.dataKey === "value")?.payload;
                if (!d) return null;
                const signed = d.kind === "out" ? -d.value : d.value;
                return (
                  <div style={{ fontSize: 12, background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}>
                    <div className="font-semibold">{d.name}</div>
                    <div>{d.kind === "in" || d.kind === "out" ? formatCurrency(signed) : formatCurrency(d.value)}</div>
                  </div>
                );
              }}
            />
            <Bar dataKey="base" stackId="a" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleClick} isAnimationActive={false}>
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
              <LabelList dataKey="label" position="top" style={{ fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-2">
          <span>
            Net change: <span className={`font-medium ${projected >= currentMrr ? "text-green-600" : "text-red-600"}`}>
              {projected >= currentMrr ? "+" : "−"}{formatCurrency(Math.abs(projected - currentMrr))}
            </span> over {horizonMonths} months
          </span>
          {data.windingDownRevenue > 0 && (
            <span>Churned but still active (winding down): {formatCurrency(data.windingDownRevenue)}</span>
          )}
          {data.pausedRevenue > 0 && (
            <span>Paused (Not Paying): {formatCurrency(data.pausedRevenue)}</span>
          )}
          {data.unsignedContractOut > 0 && (
            <span>{data.unsignedContractOut} Contract-Out deal{data.unsignedContractOut !== 1 ? "s" : ""} awaiting a Start Date (excluded)</span>
          )}
        </div>

        {expanded && (
          <div className="mt-4 rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                {expanded === "in" ? "Incoming" : "Outgoing"} — next {horizonMonths} months
              </h4>
              <button onClick={() => setExpanded(null)} className="text-xs text-muted-foreground hover:text-foreground">
                Close
              </button>
            </div>
            {drillDeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No {expanded === "in" ? "incoming" : "outgoing"} deals in this window.</p>
            ) : (
              <div className="space-y-1">
                {drillDeals.map((d) => (
                  <div key={`${d.id}-${d.month}`} className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {d.name}
                      {d.month && <span className="text-muted-foreground font-normal ml-2">{formatMonth(d.month)}</span>}
                    </span>
                    <span className={expanded === "in" ? "text-green-600" : "text-red-600"}>
                      {expanded === "in" ? "+" : "−"}{formatCurrency(d.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold border-t pt-1 mt-2">
                  <span>Total</span>
                  <span>{formatCurrency(drillDeals.reduce((s, d) => s + d.amount, 0))}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
