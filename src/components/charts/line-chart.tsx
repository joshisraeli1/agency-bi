"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartColor, TOOLTIP_STYLE } from "./chart-colors";

interface LineChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  yLabels?: string[];
  height?: number;
  formatY?: (value: number) => string;
}

export function LineChartCard({
  title,
  data,
  xKey,
  yKeys,
  yLabels,
  height = 300,
  formatY,
}: LineChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={formatY} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              position={{ x: 0, y: 0 }}
              formatter={formatY ? (value: unknown) => formatY(Number(value)) : undefined}
            />
            {yKeys.length > 1 && <Legend />}
            {yKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={yLabels?.[i] || key}
                stroke={getChartColor(i)}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
