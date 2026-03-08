"use client";

import { useState, useMemo } from "react";
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
import type { HolisticClientMarginData } from "@/lib/analytics/types";
import { DollarSign, TrendingUp, Calculator } from "lucide-react";

interface Props {
  data: HolisticClientMarginData;
}

export function HolisticMarginSection({ data }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const availableMonths = useMemo(() => {
    const months = [...new Set(data.clients.map((c) => c.month))].sort();
    return months;
  }, [data.clients]);

  const filteredClients = useMemo(() => {
    if (selectedMonth === "all") {
      // Aggregate per client across all months
      const agg = new Map<
        string,
        {
          clientId: string;
          clientName: string;
          revenue: number;
          timeCost: number;
          meetingCost: number;
          commCost: number;
          creatorCount: number;
        }
      >();
      for (const c of data.clients) {
        const existing = agg.get(c.clientId);
        if (existing) {
          existing.revenue += c.revenue;
          existing.timeCost += c.timeCost;
          existing.meetingCost += c.meetingCost;
          existing.commCost += c.commCost;
          existing.creatorCount = Math.max(existing.creatorCount, c.creatorCount);
        } else {
          agg.set(c.clientId, {
            clientId: c.clientId,
            clientName: c.clientName,
            revenue: c.revenue,
            timeCost: c.timeCost,
            meetingCost: c.meetingCost,
            commCost: c.commCost,
            creatorCount: c.creatorCount,
          });
        }
      }
      return Array.from(agg.values())
        .map((c) => {
          const totalCost = c.timeCost + c.meetingCost + c.commCost;
          const margin = c.revenue - totalCost;
          const marginPercent = c.revenue > 0 ? Number(((margin / c.revenue) * 100).toFixed(1)) : 0;
          return { ...c, month: "all", totalCost, margin, marginPercent };
        })
        .filter((r) => r.revenue > 0 || r.totalCost > 0)
        .sort((a, b) => a.marginPercent - b.marginPercent);
    }
    return data.clients
      .filter((c) => c.month === selectedMonth)
      .sort((a, b) => a.marginPercent - b.marginPercent);
  }, [data.clients, selectedMonth]);

  const totalRevenue = filteredClients.reduce((s, r) => s + r.revenue, 0);
  const totalCost = filteredClients.reduce((s, r) => s + r.totalCost, 0);
  const totalMargin = totalRevenue - totalCost;
  const avgMarginPercent = totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(1)) : 0;

  if (data.clients.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Holistic Client Margin</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Revenue vs comprehensive cost (time + meetings + communications)
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(totalRevenue)}
          description={selectedMonth === "all" ? `${availableMonths.length} months` : formatMonth(selectedMonth)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Holistic Cost"
          value={formatCurrency(totalCost)}
          icon={<Calculator className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(avgMarginPercent)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Blended Hourly Rate"
          value={formatCurrency(data.blendedHourlyRate)}
          description="Avg team member rate"
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Holistic Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium">Client</th>
                  <th className="text-right py-2 px-3 font-medium">Revenue</th>
                  <th className="text-right py-2 px-3 font-medium">Time Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Meeting Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Comm Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Creators</th>
                  <th className="text-right py-2 px-3 font-medium">Total Cost</th>
                  <th className="text-right py-2 px-3 font-medium">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => (
                  <tr key={`${c.clientId}-${c.month}`} className="border-b last:border-0">
                    <td className="py-2 px-3">{c.clientName}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.revenue)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.timeCost)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.meetingCost)}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.commCost)}</td>
                    <td className="text-right py-2 px-3">{c.creatorCount}</td>
                    <td className="text-right py-2 px-3">{formatCurrency(c.totalCost)}</td>
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
                  <td colSpan={4} />
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(totalCost)}
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
