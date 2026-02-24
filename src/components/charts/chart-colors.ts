import type { CSSProperties } from "react";

/** Shared tooltip content styles — high contrast, visible above chart data */
export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  fontSize: "13px",
  padding: "8px 12px",
  lineHeight: "1.5",
  color: "hsl(var(--popover-foreground))",
};

/** Forces tooltip wrapper to top-right of chart area */
export const TOOLTIP_POSITION: CSSProperties = {
  top: 10,
  right: 10,
  left: "auto",
  transform: "none",
  transition: "none",
};

export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
