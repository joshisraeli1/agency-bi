"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneCall } from "lucide-react";
import type { CallActivity, OutcomeBucket } from "@/lib/analytics/call-activity";

// Declared here, not imported: call-activity.ts reaches the database, so a
// value import from it drags Prisma into the client bundle (a type-only import
// is erased at compile time, a const is not).
const OUTCOME_BUCKETS: OutcomeBucket[] = [
  "Meeting booked",
  "Connected",
  "No answer",
  "Other outcome",
  "Not logged",
];

// The four real outcomes reuse the set already validated for this dashboard
// (contrast >= 3:1 and CVD-separable in light and dark). "Not logged" is the
// absence of an outcome rather than a category, so it takes a neutral grey.
const OUTCOME_COLORS: Record<string, string> = {
  "Meeting booked": "#0d9488",
  Connected: "#ea580c",
  "No answer": "#7c3aed",
  "Other outcome": "#dc2626",
  "Not logged": "#94a3b8",
};

const RANGES = [14, 30, 90] as const;

export function CallActivityChart({ data }: { data: CallActivity }) {
  const [range, setRange] = useState<number>(30);
  const days = data.days.slice(-range);

  const calls = days.reduce((s, d) => s + d.calls, 0);
  const talk = days.reduce((s, d) => s + d.talkMinutes, 0);
  const meetings = days.reduce((s, d) => s + d.counts["Meeting booked"], 0);
  const connected = days.reduce((s, d) => s + d.counts.Connected + d.counts["Meeting booked"], 0);
  const activeDays = days.filter((d) => d.calls > 0).length;

  const step = Math.ceil(days.length / 15);
  const ticks = days.filter((_, i) => i % step === 0).map((d) => d.label);

  const chartData = days.map((d) => ({ label: d.label, ...d.counts, calls: d.calls, talkMinutes: d.talkMinutes }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="h-4 w-4" />
            Daily Call Output &amp; Outcomes
          </CardTitle>
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label="Days shown"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r} days
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Calls placed through the dialler, stacked by outcome. Hand-logged calls are excluded —
          they carry no number, duration or outcome.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
          <span>
            <span className="text-2xl font-semibold tabular-nums">{calls}</span>
            <span className="text-muted-foreground ml-2">calls</span>
          </span>
          <span className="self-end text-muted-foreground">
            {connected} connected · {meetings} meeting{meetings === 1 ? "" : "s"} booked · {talk} min talk time
            {activeDays > 0 && ` · ${(calls / activeDays).toFixed(1)} per active day`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="16%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(value, name) => [String(value ?? 0), String(name)]}
              labelFormatter={(label, items) => {
                const p = items?.[0]?.payload;
                return `${label}${p ? ` — ${p.calls} call${p.calls === 1 ? "" : "s"}, ${p.talkMinutes} min` : ""}`;
              }}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            {OUTCOME_BUCKETS.map((b, i) => (
              <Bar
                key={b}
                dataKey={b}
                stackId="a"
                fill={OUTCOME_COLORS[b]}
                maxBarSize={34}
                radius={i === OUTCOME_BUCKETS.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {data.numbers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Dialler numbers in this window:{" "}
            {data.numbers.map((n) => `${n.number} (${n.calls}, from ${n.firstSeen})`).join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
