"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartColor, TOOLTIP_STYLE } from "./chart-colors";

interface BarChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  yLabels?: string[];
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
  formatY?: (value: number) => string;
}

export function BarChartCard({
  title,
  data,
  xKey,
  yKeys,
  yLabels,
  height = 300,
  stacked = false,
  horizontal = false,
  formatY,
}: BarChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={formatY} />
                <YAxis
                  dataKey={xKey}
                  type="category"
                  tick={{ fontSize: 12 }}
                  width={100}
                />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={formatY} />
              </>
            )}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={formatY ? (value: unknown) => formatY(Number(value)) : undefined}
            />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                name={yLabels?.[i] || key}
                stackId={stacked ? "stack" : undefined}
                fill={getChartColor(i)}
                radius={stacked ? undefined : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
