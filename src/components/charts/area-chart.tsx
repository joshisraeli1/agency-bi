"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartColor, TOOLTIP_STYLE, TOOLTIP_POSITION } from "./chart-colors";

interface AreaChartCardProps {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  yKeys: string[];
  yLabels?: string[];
  height?: number;
  stacked?: boolean;
  formatY?: (value: number) => string;
}

export function AreaChartCard({
  title,
  data,
  xKey,
  yKeys,
  yLabels,
  height = 300,
  stacked = false,
  formatY,
}: AreaChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey={xKey} className="text-xs" tick={{ fontSize: 12 }} />
            <YAxis className="text-xs" tick={{ fontSize: 12 }} tickFormatter={formatY} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              wrapperStyle={TOOLTIP_POSITION}
              formatter={formatY ? (value: unknown) => formatY(Number(value)) : undefined}
            />
            {yKeys.map((key, i) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={yLabels?.[i] || key}
                stackId={stacked ? "1" : undefined}
                fill={getChartColor(i)}
                stroke={getChartColor(i)}
                fillOpacity={0.3}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
