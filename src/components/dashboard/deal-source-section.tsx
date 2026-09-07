"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { DealSourceRow } from "@/lib/analytics/deal-source";

const SOURCE_COLOR = "#ea580c";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

export function DealSourceSection({ data }: { data: DealSourceRow[] }) {
  if (data.length === 0) return null;

  const totalRevenue = data.reduce((s, r) => s + r.revenue, 0);
  const totalDeals = data.reduce((s, r) => s + r.deals, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Radio className="h-4 w-4" />
          Deal Source
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Where the live book came from, per HubSpot&apos;s Outreach Source. Upsells are folded
          onto the deal they expanded, so a client won through outreach stays credited to it.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }} barCategoryGap="24%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="source" tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={48} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(value, _name, item) => [
                `${formatCurrency(Number(value ?? 0))} · ${item?.payload?.deals ?? 0} deals`,
                "Revenue",
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey="revenue" fill={SOURCE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={64} />
          </BarChart>
        </ResponsiveContainer>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left font-medium py-2 px-3">Source</th>
                <th className="text-right font-medium py-2 px-3">Deals</th>
                <th className="text-right font-medium py-2 px-3">Revenue (MRR)</th>
                <th className="text-right font-medium py-2 px-3">Avg deal</th>
                <th className="text-right font-medium py-2 px-3">Share</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.source} className="border-b">
                  <td className="py-2 px-3 font-medium">{r.source}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{r.deals}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(r.revenue)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(r.avgDealSize)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{r.percentOfRevenue}%</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 px-3">Total</td>
                <td className="text-right py-2 px-3 tabular-nums">{totalDeals}</td>
                <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(totalRevenue)}</td>
                <td className="text-right py-2 px-3 tabular-nums">
                  {formatCurrency(totalDeals > 0 ? Math.round(totalRevenue / totalDeals) : 0)}
                </td>
                <td className="text-right py-2 px-3 tabular-nums">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          A few deals carry more than one source; the first is treated as primary rather than
          counting the deal twice.
        </p>
      </CardContent>
    </Card>
  );
}
