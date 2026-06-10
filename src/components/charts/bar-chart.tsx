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
  /** When set, clicking a bar calls this with the category (xKey) value. */
  onBarClick?: (category: string) => void;
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
  onBarClick,
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
              isAnimationActive={false}
              allowEscapeViewBox={{ x: true, y: true }}
              cursor={{ fill: "rgba(0,0,0,0.05)" }}
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
                cursor={onBarClick ? "pointer" : undefined}
                onClick={
                  onBarClick
                    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (e: any) => {
                        const cat = e?.payload?.[xKey];
                        if (cat != null) onBarClick(String(cat));
                      }
                    : undefined
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
