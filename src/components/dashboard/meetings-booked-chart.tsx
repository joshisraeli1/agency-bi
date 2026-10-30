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
import { CalendarCheck } from "lucide-react";
import type { MeetingsBooked, MeetingDay } from "@/lib/analytics/meetings-booked";

const BOOKED = "#0d9488";
const RANGES = [14, 30, 90] as const;

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-AU", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      })
    : "no start time set";

export function MeetingsBookedChart({ data }: { data: MeetingsBooked }) {
  const [range, setRange] = useState<number>(30);
  const [selected, setSelected] = useState<MeetingDay | null>(null);
  const days = data.days.slice(-range);

  const total = days.reduce((s, d) => s + d.booked, 0);
  const activeDays = days.filter((d) => d.booked > 0).length;
  const step = Math.max(1, Math.ceil(days.length / 15));
  const ticks = days.filter((_, i) => i % step === 0).map((d) => d.label);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4" />
            Meetings Booked
          </CardTitle>
          <select
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r} days
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Counted on the day the meeting was booked, not the day it happens — a meeting set today
          for next month is today&apos;s work. Click a day to see when those meetings land.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
          <span>
            <span className="text-2xl font-semibold tabular-nums">{total}</span>
            <span className="text-muted-foreground ml-2">booked</span>
          </span>
          <span className="self-end text-muted-foreground">
            {data.upcoming} still ahead
            {activeDays > 0 && ` · ${(total / activeDays).toFixed(1)} per active day`}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={days} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap="16%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" ticks={ticks} tick={{ fontSize: 11 }} tickLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <Tooltip
              cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
              formatter={(v) => [`${v ?? 0} booked`, ""]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Bar
              dataKey="booked"
              fill={BOOKED}
              maxBarSize={34}
              radius={[3, 3, 0, 0]}
              minPointSize={2}
              cursor="pointer"
              onClick={(bar) => {
                const key = (bar as unknown as { payload?: { date?: string } })?.payload?.date;
                const d = data.days.find((x) => x.date === key);
                if (d) setSelected(d);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
        {selected && (
          <div className="rounded-lg border p-4 mt-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-sm">
                Booked on {selected.label}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {selected.booked} meeting{selected.booked === 1 ? "" : "s"}
                </span>
              </p>
              <button
                onClick={() => setSelected(null)}
                className="text-sm text-muted-foreground hover:underline shrink-0"
              >
                Close
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {selected.meetings.map((m) => (
                <li key={m.id} className="flex justify-between gap-4">
                  <span>{when(m.scheduledFor)}</span>
                  <span className="text-muted-foreground">
                    {m.outcome ?? (m.upcoming ? "upcoming" : "held")}
                  </span>
                </li>
              ))}
              {selected.meetings.length === 0 && (
                <li className="text-muted-foreground">No meetings booked this day.</li>
              )}
            </ul>
            <p className="text-muted-foreground text-xs mt-3 pt-2 border-t">
              Times only — the activity sync carries no meeting title or attendee, so who each one
              is with stays in HubSpot.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
