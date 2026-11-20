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

type Grain = "day" | "week" | "month";

/** How far back each grain looks, and how it is labelled. A year of daily bars
 *  is unreadable and three months of monthly ones says nothing, so the window
 *  follows the grain rather than being set independently of it. */
const RANGES: Record<Grain, { value: number; label: string }[]> = {
  day: [
    { value: 14, label: "Last 14 days" },
    { value: 30, label: "Last 30 days" },
    { value: 90, label: "Last 90 days" },
  ],
  week: [
    { value: 56, label: "Last 8 weeks" },
    { value: 91, label: "Last 13 weeks" },
    { value: 182, label: "Last 26 weeks" },
  ],
  month: [
    { value: 182, label: "Last 6 months" },
    { value: 365, label: "Last 12 months" },
  ],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Roll daily buckets up to the chosen grain.
 *
 * Buckets are keyed by the period they fall in and keep their meetings, so the
 * drill-down works the same whichever grain is showing — clicking a week opens
 * every meeting booked that week.
 */
function aggregate(days: MeetingsBooked["days"], grain: Grain): MeetingsBooked["days"] {
  if (grain === "day") return days;
  const out = new Map<string, MeetingsBooked["days"][number]>();
  for (const d of days) {
    const date = new Date(`${d.date}T00:00:00`);
    let key: string;
    let label: string;
    if (grain === "month") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      label = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
    } else {
      // Weeks start Monday, so a week reads as a working week.
      const monday = new Date(date);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      label = `${monday.getDate()} ${MONTHS[monday.getMonth()]}`;
    }
    const b = out.get(key) ?? { date: key, label, booked: 0, meetings: [] };
    b.booked += d.booked;
    b.meetings = [...b.meetings, ...d.meetings];
    out.set(key, b);
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-AU", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      })
    : "no start time set";

export function MeetingsBookedChart({ data }: { data: MeetingsBooked }) {
  const [grain, setGrain] = useState<Grain>("day");
  const [range, setRange] = useState<number>(30);
  const [selected, setSelected] = useState<MeetingDay | null>(null);

  // Changing grain changes what a sensible window is, so the range follows it
  // rather than leaving a stale "14 days" selected on a monthly view.
  const setGrainAndRange = (g: Grain) => {
    setGrain(g);
    setRange(RANGES[g][g === "day" ? 1 : 1]?.value ?? RANGES[g][0].value);
    setSelected(null);
  };

  const days = aggregate(data.days.slice(-range), grain);
  const total = days.reduce((s, d) => s + d.booked, 0);
  const activeDays = days.filter((d) => d.booked > 0).length;
  const step = Math.max(1, Math.ceil(days.length / 15));
  const ticks = days.filter((_, i) => i % step === 0).map((d) => d.label);
  const unit = grain === "day" ? "day" : grain === "week" ? "week" : "month";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4" />
            Meetings Booked
          </CardTitle>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center rounded-md border">
              {(["day", "week", "month"] as Grain[]).map((g, i) => (
                <button
                  key={g}
                  onClick={() => setGrainAndRange(g)}
                  className={`px-2.5 py-1 text-sm capitalize ${i === 0 ? "rounded-l-md" : ""} ${
                    i === 2 ? "rounded-r-md" : ""
                  } ${grain === g ? "bg-foreground text-background" : "hover:bg-muted"}`}
                >
                  {g === "day" ? "Daily" : g === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
            <select
              value={range}
              onChange={(e) => setRange(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              {RANGES[grain].map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Counted on the day the meeting was booked, not the day it happens — a meeting set today
          for next month is today&apos;s work. Click a {unit} to see who was booked in.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
          <span>
            <span className="text-2xl font-semibold tabular-nums">{total}</span>
            <span className="text-muted-foreground ml-2">booked</span>
          </span>
          <span className="self-end text-muted-foreground">
            {data.upcoming} still ahead
            {activeDays > 0 && ` · ${(total / activeDays).toFixed(1)} per active ${unit}`}
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
                // The AGGREGATED buckets, not the raw daily ones: at week or
                // month grain the key is a period ("2026-11"), which never
                // matches a daily date, so clicking did nothing.
                const d = days.find((x) => x.date === key);
                if (d) setSelected(d);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
        {selected && (
          <div className="rounded-lg border p-4 mt-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-sm">
                {grain === "day" ? "Booked on" : grain === "week" ? "Booked in the week of" : "Booked in"}{" "}
                {selected.label}
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
                  <span className="font-medium">{m.client ?? "No client attached"}</span>
                  <span className="text-muted-foreground shrink-0">
                    {when(m.scheduledFor)} · {m.outcome ?? (m.upcoming ? "upcoming" : "held")}
                  </span>
                </li>
              ))}
              {selected.meetings.length === 0 && (
                <li className="text-muted-foreground">No meetings booked this day.</li>
              )}
            </ul>
            <p className="text-muted-foreground text-xs mt-3 pt-2 border-t">
              The company the meeting is attached to in HubSpot. Titles, attendees and notes are
              not synced.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
