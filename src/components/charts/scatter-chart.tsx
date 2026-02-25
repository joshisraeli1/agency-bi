"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChartColor, TOOLTIP_STYLE } from "./chart-colors";

interface ScatterChartCardProps {
  title: string;
  data: {
    name: string;
    x: number;
    y: number;
    z: number;
  }[];
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  height?: number;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  referenceY?: number;
}

function CustomTooltip({
  active,
  payload,
  xLabel,
  yLabel,
  zLabel,
  formatX,
  formatY,
}: {
  active?: boolean;
  payload?: { payload: { name: string; x: number; y: number; z: number } }[];
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE}>
      <p className="font-semibold mb-1">{d.name}</p>
      <p>
        {xLabel || "X"}: {formatX ? formatX(d.x) : d.x}
      </p>
      <p>
        {yLabel || "Y"}: {formatY ? formatY(d.y) : d.y}
      </p>
      <p>
        {zLabel || "Size"}: {d.z}
      </p>
    </div>
  );
}

export function ScatterChartCard({
  title,
  data,
  xLabel,
  yLabel,
  zLabel,
  height = 400,
  formatX,
  formatY,
  referenceY,
}: ScatterChartCardProps) {
  const zRange: [number, number] = [40, 400];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fontSize: 12 }}
              tickFormatter={formatX}
              label={{
                value: xLabel,
                position: "bottom",
                offset: 0,
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tick={{ fontSize: 12 }}
              tickFormatter={formatY}
              label={{
                value: yLabel,
                angle: -90,
                position: "insideLeft",
                offset: 10,
                fontSize: 12,
              }}
            />
            <ZAxis
              type="number"
              dataKey="z"
              range={zRange}
              name={zLabel}
            />
            {referenceY !== undefined && (
              <ReferenceLine
                y={referenceY}
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5"
                label={{ value: `${referenceY}%`, fontSize: 11 }}
              />
            )}
            <Tooltip
              position={{ x: 0, y: 0 }}
              content={
                <CustomTooltip
                  xLabel={xLabel}
                  yLabel={yLabel}
                  zLabel={zLabel}
                  formatX={formatX}
                  formatY={formatY}
                />
              }
            />
            <Scatter data={data} fill={getChartColor(0)}>
              {data.map((_, index) => (
                <Cell
                  key={index}
                  fill={getChartColor(index % 12)}
                  fillOpacity={0.7}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
