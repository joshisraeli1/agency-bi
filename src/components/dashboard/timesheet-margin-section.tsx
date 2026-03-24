"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatMonth } from "@/lib/utils";
import type { TimesheetClientMarginData } from "@/lib/analytics/types";

interface Props {
  data: TimesheetClientMarginData;
}

export function TimesheetMarginSection({ data }: Props) {
  // Default to the most recent month
  const availableMonths = useMemo(() => {
    return [...new Set(data.clients.map((c) => c.month))].sort();
  }, [data.clients]);

  const [selectedMonth, setSelectedMonth] = useState<string>(
    availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : "all"
  );

  const filteredClients = useMemo(() => {
    if (selectedMonth === "all") {
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
          return { ...c, margin, marginPercent, hours: Number(c.hours.toFixed(1)) };
        })
        .filter((r) => r.revenue > 0 || r.timeCost > 0)
        .sort((a, b) => b.revenue - a.revenue);
    }
    return data.clients
      .filter((c) => c.month === selectedMonth)
      .sort((a, b) => b.revenue - a.revenue);
  }, [data.clients, selectedMonth]);

  const totalRevenue = filteredClients.reduce((s, r) => s + r.revenue, 0);
  const totalTimeCost = filteredClients.reduce((s, r) => s + r.timeCost, 0);
  const totalHours = filteredClients.reduce((s, r) => s + r.hours, 0);
  const totalMargin = totalRevenue - totalTimeCost;
  const avgMarginPercent = totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(1)) : 0;

  if (data.clients.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Client Margin Breakdown</CardTitle>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select month" />
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
                <tr key={c.clientId} className="border-b last:border-0">
                  <td className="py-2 px-3">{c.clientName}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(c.revenue)}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(c.timeCost)}</td>
                  <td className="text-right py-2 px-3">{c.hours}h</td>
                  <td className={`text-right py-2 px-3 ${c.margin < 0 ? "text-red-600" : ""}`}>
                    {formatCurrency(c.margin)}
                  </td>
                  <td className={`text-right py-2 px-3 font-medium ${c.marginPercent < 0 ? "text-red-600" : ""}`}>
                    {c.marginPercent}%
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/50">
                <td className="py-2 px-3 font-semibold">Total</td>
                <td className="text-right py-2 px-3 font-semibold">{formatCurrency(totalRevenue)}</td>
                <td className="text-right py-2 px-3 font-semibold">{formatCurrency(totalTimeCost)}</td>
                <td className="text-right py-2 px-3 font-semibold">{totalHours.toFixed(0)}h</td>
                <td className="text-right py-2 px-3 font-semibold">{formatCurrency(totalMargin)}</td>
                <td className="text-right py-2 px-3 font-semibold">{avgMarginPercent}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
