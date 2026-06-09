"use client";

import { useState } from "react";
import Link from "next/link";
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

interface DataPoint {
  name: string;
  x: number;
  y: number;
  z: number;
  id?: string;
}

interface ScatterChartCardProps {
  title: string;
  data: DataPoint[];
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  height?: number;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  formatZ?: (value: number) => string;
  referenceY?: number;
  /** When set, clicking a point reveals a link to `${clickHrefBase}/${id}`. */
  clickHrefBase?: string;
}

function CustomTooltip({
  active,
  payload,
  xLabel,
  yLabel,
  zLabel,
  formatX,
  formatY,
  formatZ,
}: {
  active?: boolean;
  payload?: { payload: DataPoint }[];
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  formatZ?: (value: number) => string;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE}>
      <p className="font-semibold mb-1">{d.name}</p>
      <p>{xLabel || "X"}: {formatX ? formatX(d.x) : d.x}</p>
      <p>{yLabel || "Y"}: {formatY ? formatY(d.y) : d.y}</p>
      <p>{zLabel || "Size"}: {formatZ ? formatZ(d.z) : d.z}</p>
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
  formatZ,
  referenceY,
  clickHrefBase,
}: ScatterChartCardProps) {
  const zRange: [number, number] = [40, 400];
  const [selected, setSelected] = useState<DataPoint | null>(null);

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
              label={{ value: xLabel, position: "bottom", offset: 0, fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tick={{ fontSize: 12 }}
              tickFormatter={formatY}
              label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 10, fontSize: 12 }}
            />
            <ZAxis type="number" dataKey="z" range={zRange} name={zLabel} />
            {referenceY !== undefined && (
              <ReferenceLine
                y={referenceY}
                stroke="var(--destructive)"
                strokeDasharray="5 5"
                label={{ value: `${referenceY}%`, fontSize: 11 }}
              />
            )}
            <Tooltip
              isAnimationActive={false}
              allowEscapeViewBox={{ x: true, y: true }}
              content={
                <CustomTooltip
                  xLabel={xLabel}
                  yLabel={yLabel}
                  zLabel={zLabel}
                  formatX={formatX}
                  formatY={formatY}
                  formatZ={formatZ}
                />
              }
            />
            <Scatter
              data={data}
              fill={getChartColor(0)}
              cursor="pointer"
              onClick={(node: unknown) => {
                const p = (node as { payload?: DataPoint })?.payload ?? (node as DataPoint);
                if (p?.name) setSelected(p);
              }}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={getChartColor(index % 12)} fillOpacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>

        {selected ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-semibold">{selected.name}</span>
              <span className="text-muted-foreground">{xLabel}: {formatX ? formatX(selected.x) : selected.x}</span>
              <span className="text-muted-foreground">{yLabel}: {formatY ? formatY(selected.y) : selected.y}</span>
              <span className="text-muted-foreground">{zLabel}: {formatZ ? formatZ(selected.z) : selected.z}</span>
            </div>
            <div className="flex items-center gap-3 whitespace-nowrap">
              {clickHrefBase && selected.id && (
                <Link href={`${clickHrefBase}/${selected.id}`} className="font-medium hover:underline">
                  View client →
                </Link>
              )}
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:underline">
                Close
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">Click a bubble to see the client (size = LTV).</p>
        )}
      </CardContent>
    </Card>
  );
}
