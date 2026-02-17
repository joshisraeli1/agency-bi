"use client";

import { LineChartCard } from "@/components/charts/line-chart";
import { BarChartCard } from "@/components/charts/bar-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { AreaChartCard } from "@/components/charts/area-chart";

interface ChartData {
  _chart: boolean;
  chartType: "line" | "bar" | "pie" | "area";
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  yLabels?: string[];
}

interface Props {
  chart: ChartData;
}

export function ChatChartRenderer({ chart }: Props) {
  const { chartType, title, data, xKey, yKeys, yLabels } = chart;

  switch (chartType) {
    case "line":
      return (
        <LineChartCard
          title={title}
          data={data}
          xKey={xKey || "name"}
          yKeys={yKeys || ["value"]}
          yLabels={yLabels}
          height={250}
        />
      );
    case "bar":
      return (
        <BarChartCard
          title={title}
          data={data}
          xKey={xKey || "name"}
          yKeys={yKeys || ["value"]}
          yLabels={yLabels}
          height={250}
        />
      );
    case "pie":
      return (
        <PieChartCard
          title={title}
          data={data as { name: string; value: number }[]}
          height={250}
        />
      );
    case "area":
      return (
        <AreaChartCard
          title={title}
          data={data}
          xKey={xKey || "name"}
          yKeys={yKeys || ["value"]}
          yLabels={yLabels}
          height={250}
        />
      );
    default:
      return null;
  }
}
