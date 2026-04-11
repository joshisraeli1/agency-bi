"use client";

import { useState, useMemo } from "react";
import { LineChartCard } from "@/components/charts/line-chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { NewClientDealSizeData } from "@/lib/analytics/types";

interface Props {
  data: NewClientDealSizeData;
}

export function DealSizeChart({ data }: Props) {
  const [division, setDivision] = useState<string>("all");

  const divisions = useMemo(() => {
    const set = new Set<string>();
    for (const m of data.months) {
      for (const c of m.clients) {
        if (c.division) set.add(c.division);
      }
    }
    return Array.from(set).sort();
  }, [data.months]);

  const chartData = useMemo(() => {
    return data.months
      .map((m) => {
        const clients =
          division === "all"
            ? m.clients
            : m.clients.filter((c) => c.division === division);

        const withDeal = clients.filter((c) => c.dealSize > 0);
        if (withDeal.length === 0) return null;

        const avg = Math.round(
          withDeal.reduce((s, c) => s + c.dealSize, 0) / withDeal.length
        );
        return {
          month: formatMonth(m.month),
          avgDealSize: avg,
        };
      })
      .filter(Boolean) as { month: string; avgDealSize: number }[];
  }, [data.months, division]);

  if (chartData.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Average New Deal Size Over Time</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Average retainer value of new clients by month
          </p>
        </div>
        <Select value={division} onValueChange={setDivision}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Divisions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {divisions.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <LineChartCard
        title="Avg Deal Size"
        data={chartData}
        xKey="month"
        yKeys={["avgDealSize"]}
        yLabels={["Avg Deal Size"]}
        formatY={(v) => formatCurrency(v)}
      />
    </div>
  );
}
