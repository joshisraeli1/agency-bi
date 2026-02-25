"use client";

import {
  ComposedChart,
  Bar,
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

interface ComboChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  barKeys: string[];
  barLabels?: string[];
  lineKey: string;
  lineLabel?: string;
  height?: number;
  stacked?: boolean;
  formatBar?: (value: number) => string;
  formatLine?: (value: number) => string;
}

export function ComboChartCard({
  title,
  data,
  xKey,
  barKeys,
  barLabels,
  lineKey,
  lineLabel,
  height = 350,
  stacked = true,
  formatBar,
  formatLine,
}: ComboChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 12 }}
              tickFormatter={formatBar}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
              tickFormatter={formatLine}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              position={{ x: 0, y: 0 }}
              formatter={(value: unknown, name?: string) => {
                const v = Number(value);
                if (name === (lineLabel || lineKey)) {
                  return formatLine ? formatLine(v) : v;
                }
                return formatBar ? formatBar(v) : v;
              }}
            />
            <Legend />
            {barKeys.map((key, i) => (
              <Bar
                key={key}
                yAxisId="left"
                dataKey={key}
                name={barLabels?.[i] || key}
                stackId={stacked ? "stack" : undefined}
                fill={getChartColor(i)}
                radius={stacked ? undefined : [4, 4, 0, 0]}
              />
            ))}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={lineKey}
              name={lineLabel || lineKey}
              stroke={getChartColor(barKeys.length + 1)}
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
