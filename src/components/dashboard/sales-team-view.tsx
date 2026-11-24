"use client";

import { useState } from "react";
import Link from "next/link";
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
import { ArrowRight } from "lucide-react";
import { formatCurrency, formatMonth } from "@/lib/utils";

/** The window the headline counts cover. Snapshots (MRR, pipeline, active
 *  deals) are "right now" and ignore it. */
export const RANGES = [
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

interface DealItem {
  name: string;
  amount: number;
}

/** One line in a period's drill-down: what it was, and a figure or date beside it. */
interface DrillItem {
  primary: string;
  secondary: string;
}

export interface SalesPersonSummary {
  slug: string;
  name: string;
  goalModel: "revenue" | "commission";
  currentMrr: number;
  lifetimeRevenue: number;
  activeDealCount: number;
  pipelineValue: number;
  window: { dealsCreated: number; meetings: number; calls: number; emails: number };
  newRevenueDealsByLabel: Record<string, DealItem[]>;
  createdDealsByLabel: Record<string, DealItem[]>;
  newRevenuePerMonth: { month: string; value: number }[];
  dealsCreatedPerMonth: { month: string; value: number }[];
  signed: number | null;
  signingTarget: number | null;
  activityWeeks: { label: string; calls: number; emails: number }[];
  meetingDays: {
    label: string;
    booked: number;
    meetings: { client: string | null; scheduledFor: string | null }[];
  }[];
}

// One hue per person, fixed by position so a filter never repaints the others.
const SERIES = ["#ea580c", "#0d9488", "#7c3aed", "#b45309"];

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "no time set";

const dealItems = (deals: DealItem[] | undefined): DrillItem[] =>
  (deals ?? []).map((d) => ({ primary: d.name, secondary: formatCurrency(d.amount) }));

export function SalesTeamView({ people, range }: { people: SalesPersonSummary[]; range: RangeKey }) {
  const rangeLabel = RANGES.find((r) => r.key === range)!.label;
  const shown = people;
  const colourOf = (slug: string) => SERIES[people.findIndex((p) => p.slug === slug) % SERIES.length];

  // One row per month, one column per person, so the bars sit side by side and
  // the comparison is direct rather than a flick between two pages.
  const monthsOf = (key: "newRevenuePerMonth" | "dealsCreatedPerMonth") => {
    const all = [...new Set(people.flatMap((p) => p[key].map((m) => m.month)))].sort().slice(-12);
    return all.map((month) => {
      const row: Record<string, string | number> = { label: formatMonth(month) };
      for (const p of shown) {
        row[p.name] = p[key].find((m) => m.month === month)?.value ?? 0;
      }
      return row;
    });
  };
  const revenueData = monthsOf("newRevenuePerMonth");
  const dealsData = monthsOf("dealsCreatedPerMonth");

  // Both people are bucketed over the same window, so the day labels line up.
  const meetingData = () => {
    const labels = [...new Set(people.flatMap((p) => p.meetingDays.map((d) => d.label)))];
    return labels.map((label) => {
      const row: Record<string, string | number> = { label };
      for (const p of shown) {
        row[p.name] = p.meetingDays.find((d) => d.label === label)?.booked ?? 0;
      }
      return row;
    });
  };

  // Weeks are keyed by label rather than date: both people are bucketed by the
  // same weekStart, so the labels line up across the team.
  const activityData = (key: "calls" | "emails") => {
    const labels = [...new Set(people.flatMap((p) => p.activityWeeks.map((w) => w.label)))];
    return labels.map((label) => {
      const row: Record<string, string | number> = { label };
      for (const p of shown) {
        row[p.name] = p.activityWeeks.find((w) => w.label === label)?.[key] ?? 0;
      }
      return row;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Sales</h1>
          <p className="text-muted-foreground mt-1">
            The team side by side. Pick a name for that person&apos;s full board — goals, pipeline,
            activity log, call outcomes and commission.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center rounded-md border" role="group" aria-label="Timeframe">
          {RANGES.map((r, i) => (
            <Link
              key={r.key}
              href={`/sales?range=${r.key}`}
              scroll={false}
              className={`px-3 py-1.5 text-sm ${
                r.key === range ? "bg-foreground text-background" : "hover:bg-muted"
              } ${i === 0 ? "rounded-l-md" : ""} ${i === RANGES.length - 1 ? "rounded-r-md" : ""}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center rounded-md border">
          <span className="px-3 py-1.5 text-sm bg-foreground text-background rounded-l-md">All</span>
          {people.map((p, i) => (
            <Link
              key={p.slug}
              href={`/sales/${p.slug}`}
              className={`px-3 py-1.5 text-sm hover:bg-muted ${
                i === people.length - 1 ? "rounded-r-md" : ""
              }`}
            >
              {p.name.split(" ")[0]}
            </Link>
          ))}
        </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((p) => (
          <Card key={p.slug}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/sales/${p.slug}`} className="group inline-flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: colourOf(p.slug) }}
                    aria-hidden
                  />
                  <span className="font-medium group-hover:underline">{p.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
                <span className="text-xs text-muted-foreground">
                  {p.goalModel === "commission" ? "Commission" : "Revenue"} targets
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
                <Stat label="Recurring revenue" value={formatCurrency(p.currentMrr)} />
                <Stat label="Pipeline" value={formatCurrency(p.pipelineValue)} />
                <Stat label={`Deals created · ${rangeLabel}`} value={String(p.window.dealsCreated)} />
                <Stat label="Active deals" value={String(p.activeDealCount)} />
                <Stat label={`Meetings · ${rangeLabel}`} value={String(p.window.meetings)} />
                <Stat label={`Calls · ${rangeLabel}`} value={p.window.calls.toLocaleString()} />
                <Stat label={`Emails · ${rangeLabel}`} value={p.window.emails.toLocaleString()} />
                {p.signed !== null && (
                  <Stat
                    label="Clients signed"
                    value={`${p.signed} of ${p.signingTarget}`}
                    note="commission year"
                  />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <TeamChart
        title="New revenue won"
        note="Monthly, ex-GST. Each person's own board carries their targets — the two are measured on different things, so no target is drawn here."
        data={revenueData}
        people={shown}
        colourOf={colourOf}
        itemsOf={(p, label) => dealItems(p.newRevenueDealsByLabel[label])}
        money
      />

      <TeamChart
        title="Deals created"
        note="Deals entered in the CRM each month."
        data={dealsData}
        people={shown}
        colourOf={colourOf}
        itemsOf={(p, label) => dealItems(p.createdDealsByLabel[label])}
      />

      <TeamChart
        title="Meetings booked"
        note="Daily, last 30 days — counted on the day the meeting was booked, not the day it happens."
        data={meetingData()}
        people={shown}
        colourOf={colourOf}
        itemsOf={(p, label) =>
          (p.meetingDays.find((d) => d.label === label)?.meetings ?? []).map((m) => ({
            primary: m.client ?? "No client attached",
            secondary: fmtWhen(m.scheduledFor),
          }))
        }
      />

      <TeamChart
        title="Calls logged"
        note="Weekly, last 12 weeks — dialler and hand-logged together. Each person's own board splits the two and carries the outcome mix."
        data={activityData("calls")}
        people={shown}
        colourOf={colourOf}
      />

      <TeamChart
        title="Emails sent"
        note="Weekly outbound email, last 12 weeks."
        data={activityData("emails")}
        people={shown}
        colourOf={colourOf}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  );
}

function TeamChart({
  title,
  note,
  data,
  people,
  colourOf,
  itemsOf,
  money = false,
}: {
  title: string;
  note: string;
  data: Record<string, string | number>[];
  people: SalesPersonSummary[];
  colourOf: (slug: string) => string;
  /** The records behind one person's bar. Omitted where only counts are synced. */
  itemsOf?: (person: SalesPersonSummary, label: string) => DrillItem[];
  money?: boolean;
}) {
  // Clicking a bar opens that period for everyone, so the comparison stays the
  // point — the per-person boards are where a single person's detail lives.
  const [period, setPeriod] = useState<Record<string, string | number> | null>(null);
  const fmt = (v: number) =>
    money ? (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`) : String(v);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-4 text-sm">
            {people.map((p) => (
              <span key={p.slug} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ background: colourOf(p.slug) }}
                  aria-hidden
                />
                {p.name.split(" ")[0]}
              </span>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          {note} Click a bar to see {itemsOf ? "what's behind" : "both people for"} that period.
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={12} width={54} />
              <Tooltip formatter={(v) => (money ? formatCurrency(Number(v ?? 0)) : String(v ?? 0))} />
              {people.map((p) => (
                <Bar
                  key={p.slug}
                  dataKey={p.name}
                  fill={colourOf(p.slug)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                  minPointSize={2}
                  cursor="pointer"
                  onClick={(bar) => {
                    const label = (bar as unknown as { payload?: { label?: string } })?.payload?.label;
                    const row = data.find((d) => d.label === label);
                    if (row) setPeriod(row);
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {period && (
          <div className="rounded-lg border p-4 mt-4">
            <div className="flex items-center justify-between gap-4">
              <p className="font-medium text-sm">
                {title} · {String(period.label)}
              </p>
              <button
                onClick={() => setPeriod(null)}
                className="text-sm text-muted-foreground hover:underline shrink-0"
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-4 text-sm">
              {people.map((p) => {
                const items = itemsOf?.(p, String(period.label)) ?? [];
                return (
                  <div key={p.slug}>
                    <div className="flex justify-between gap-4">
                      <Link
                        href={`/sales/${p.slug}`}
                        className="inline-flex items-center gap-2 font-medium hover:underline"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: colourOf(p.slug) }}
                          aria-hidden
                        />
                        {p.name}
                      </Link>
                      <span className="tabular-nums font-medium">
                        {money
                          ? formatCurrency(Number(period[p.name] ?? 0))
                          : Number(period[p.name] ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {items.length > 0 && (
                      <ul className="mt-1.5 ml-[18px] space-y-1">
                        {items.map((it, i) => (
                          <li key={i} className="flex justify-between gap-4 text-muted-foreground">
                            <span className="truncate">{it.primary}</span>
                            <span className="tabular-nums shrink-0">{it.secondary}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
