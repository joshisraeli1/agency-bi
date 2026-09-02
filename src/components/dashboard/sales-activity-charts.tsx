"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone } from "lucide-react";
import type { ActivityWeek } from "@/lib/analytics/sales-activity";

// Validated against the chart surface in both light and dark mode (contrast
// >= 3:1, CVD-separable). The dashboard's usual #14b8a6 teal sits at 2.42:1,
// below the floor, so calls use the next step down.
const EMAIL_COLOR = "#ea580c";
const CALL_COLOR = "#0d9488";

const RANGES = [12, 26, 52] as const;

interface Props {
  weeks: ActivityWeek[];
}

interface ChartProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  weeks: ActivityWeek[];
  dataKey: "emails" | "calls";
  color: string;
  seriesLabel: string;
  footnote?: string;
  range: number;
  onRangeChange: (weeks: number) => void;
}

function ActivityChart({
  title, icon, description, weeks, dataKey, color, seriesLabel, footnote, range, onRangeChange,
}: ChartProps) {
  const total = weeks.reduce((s, w) => s + w[dataKey], 0);
  const perWeek = weeks.length > 0 ? total / weeks.length : 0;

  // Label every nth week so ticks never collide as the range widens.
  const step = Math.ceil(weeks.length / 13);
  const ticks = weeks.filter((_, i) => i % step === 0).map((w) => w.label);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {icon}
            {title}
          </CardTitle>
          <select
            value={range}
            onChange={(e) => onRangeChange(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label={`${title} — weeks shown`}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r} weeks
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
        <p className="text-sm mt-2">
          <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</span>
          <span className="text-muted-foreground ml-2">
            total · {perWeek.toFixed(1)} per week
          </span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={weeks} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(value) => [Number(value ?? 0).toLocaleString(), seriesLabel]}
              labelFormatter={(label) => `Week of ${String(label)}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}

export function SalesActivityCharts({ weeks }: Props) {
  const [range, setRange] = useState<number>(26);
  const shown = weeks.slice(-range);
  // Both figures come from the visible range, so the footnote can't compare a
  // range-limited total against an all-time count.
  const totalCalls = shown.reduce((s, w) => s + w.calls, 0);
  const withDuration = shown.reduce((s, w) => s + w.callsWithDuration, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ActivityChart
        title="Emails Sent"
        icon={<Mail className="h-4 w-4" />}
        description="Outbound emails logged in HubSpot each week. Replies received are excluded."
        weeks={shown}
        dataKey="emails"
        color={EMAIL_COLOR}
        seriesLabel="Emails sent"
        range={range}
        onRangeChange={setRange}
      />
      <ActivityChart
        title="Phone Calls"
        icon={<Phone className="h-4 w-4" />}
        description="Calls logged in HubSpot each week, however they were recorded."
        weeks={shown}
        dataKey="calls"
        color={CALL_COLOR}
        seriesLabel="Calls"
        footnote={
          totalCalls > 0
            ? `${withDuration} of ${totalCalls} calls in this range have a recorded duration — most are logged manually rather than captured by the phone system.`
            : undefined
        }
        range={range}
        onRangeChange={setRange}
      />
    </div>
  );
}
