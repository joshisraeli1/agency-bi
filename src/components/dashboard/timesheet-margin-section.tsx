"use client";

import { useState, useMemo } from "react";
import { ComboChartCard } from "@/components/charts/combo-chart";
import { StatCard } from "@/components/charts/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatPercent, formatMonth } from "@/lib/utils";
import type { TimesheetClientMarginData } from "@/lib/analytics/types";
import { DollarSign, Clock, TrendingUp } from "lucide-react";

interface Props {
  data: TimesheetClientMarginData;
}

export function TimesheetMarginSection({ data }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  // Extract unique months from the client rows
  const availableMonths = useMemo(() => {
    const months = [...new Set(data.clients.map((c) => c.month))].sort();
    return months;
  }, [data.clients]);

  // Filter clients by selected month, or aggregate across all months
  const filteredClients = useMemo(() => {
    if (selectedMonth === "all") {
      // Aggregate per client across all months (original behavior)
      const agg = new Map<string, { clientId: string; clientName: string; revenue: number; timeCost: number; hours: number }>();
      for (const c of data.clients) {
        const existing = agg.get(c.clientId);
        if (existing) {
          existing.revenue += c.revenue;
          existing.timeCost += c.timeCost;
          existing.hours += c.hours;
        } else {
          agg.set(c.clientId, { clientId: c.clientId, clientName: c.clientName, revenue: c.revenue, timeCost: c.timeCost, hours: c.hours });
        }
      }
      return Array.from(agg.values())
        .map((c) => {
          const margin = c.revenue - c.timeCost;
          const marginPercent = c.revenue > 0 ? Number(((margin / c.revenue) * 100).toFixed(1)) : 0;
          return { ...c, month: "all", margin, marginPercent, hours: Number(c.hours.toFixed(1)) };
        })
        .filter((r) => r.revenue > 0 || r.timeCost > 0)
        .sort((a, b) => a.marginPercent - b.marginPercent);
    }
    return data.clients
      .filter((c) => c.month === selectedMonth)
      .sort((a, b) => a.marginPercent - b.marginPercent);
  }, [data.clients, selectedMonth]);

  // Compute totals from filtered rows
  const totalRevenue = filteredClients.reduce((s, r) => s + r.revenue, 0);
  const totalTimeCost = filteredClients.reduce((s, r) => s + r.timeCost, 0);
  const totalHours = filteredClients.reduce((s, r) => s + r.hours, 0);
  const totalMargin = totalRevenue - totalTimeCost;
  const avgMarginPercent = totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(1)) : 0;

  if (data.clients.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Timesheet-Based Client Margin</h2>
          <p className="text-muted-foreground text-sm mt-1">
            HubSpot revenue (ex-GST) vs time-tracked cost (hours x hourly rate)
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All months" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {availableMonths.map((m) => (
              <SelectItem key={m} value={m}>
                {formatMonth(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="HubSpot Revenue (ex-GST)"
          value={formatCurrency(totalRevenue)}
          description={selectedMonth === "all" ? `${availableMonths.length} months` : formatMonth(selectedMonth)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Timesheet Cost"
          value={formatCurrency(totalTimeCost)}
          description="Hours x hourly rate"
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(avgMarginPercent)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {selectedMonth === "all" && data.monthlyTrend.length > 0 && (
        <ComboChartCard
          title="Monthly Revenue & Timesheet Cost"
          data={data.monthlyTrend}
          xKey="month"
          barKeys={["revenue", "timeCost"]}
          barLabels={["Revenue", "Timesheet Cost"]}
          lineKey="marginPercent"
          lineLabel="Margin %"
          stacked={false}
          formatBar={(v) => formatCurrency(v)}
          formatLine={(v) => `${v}%`}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Margin Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Client</th>
                  <th className="text-right py-2 px-3 font-medium">Revenue</th>
                  <th className="text-right py-2 px-3 font-medium">Time Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Hours</th>
                  <th className="text-right py-2 px-3 font-medium">Margin</th>
                  <th className="text-right py-2 px-3 font-medium">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => (
                  <tr key={`${c.clientId}-${c.month}`} className="border-b last:border-0">
                    <td className="py-2 px-3">{c.clientName}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.revenue)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.timeCost)}</td>
                    <td className="text-right py-2 px-3">{c.hours}h</td>
                    <td
                      className={`text-right py-2 px-3 ${c.margin < 0 ? "text-red-600" : ""}`}
                    >
                      {formatCurrency(c.margin)}
                    </td>
                    <td
                      className={`text-right py-2 px-3 font-medium ${c.marginPercent < 0 ? "text-red-600" : ""}`}
                    >
                      {c.marginPercent}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/50">
                  <td className="py-2 px-3 font-semibold">Total</td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(totalRevenue)}
                  </td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(totalTimeCost)}
                  </td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {totalHours.toFixed(0)}h
                  </td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(totalMargin)}
                  </td>
                  <td className="text-right py-2 px-3 font-semibold">
                    {avgMarginPercent}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
