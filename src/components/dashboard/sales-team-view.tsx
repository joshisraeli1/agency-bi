"use client";

import Link from "next/link";
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
import { ArrowRight } from "lucide-react";
import { formatCurrency, formatMonth } from "@/lib/utils";

export interface SalesPersonSummary {
  slug: string;
  name: string;
  goalModel: "revenue" | "commission";
  currentMrr: number;
  lifetimeRevenue: number;
  activeDealCount: number;
  dealsCreatedLast12mo: number;
  pipelineValue: number;
  calls: number;
  emails: number;
  newRevenuePerMonth: { month: string; value: number }[];
  dealsCreatedPerMonth: { month: string; value: number }[];
  signed: number | null;
  signingTarget: number | null;
  activityWeeks: { label: string; calls: number; emails: number }[];
}

// One hue per person, fixed by position so a filter never repaints the others.
const SERIES = ["#ea580c", "#0d9488", "#7c3aed", "#b45309"];

export function SalesTeamView({ people }: { people: SalesPersonSummary[] }) {
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
        <div className="flex items-center rounded-md border shrink-0">
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
                <Stat label="Deals created · 12mo" value={String(p.dealsCreatedLast12mo)} />
                <Stat label="Active deals" value={String(p.activeDealCount)} />
                <Stat label="Calls · 12wk" value={String(p.calls)} />
                <Stat label="Emails · 12wk" value={String(p.emails)} />
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
        money
      />

      <TeamChart
        title="Deals created"
        note="Deals entered in the CRM each month."
        data={dealsData}
        people={shown}
        colourOf={colourOf}
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
  money = false,
}: {
  title: string;
  note: string;
  data: Record<string, string | number>[];
  people: SalesPersonSummary[];
  colourOf: (slug: string) => string;
  money?: boolean;
}) {
  const fmt = (v: number) =>
    money ? (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`) : String(v);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-muted-foreground text-sm mt-1">{note}</p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={12} width={54} />
              <Tooltip formatter={(v) => (money ? formatCurrency(Number(v ?? 0)) : String(v ?? 0))} />
              <Legend />
              {people.map((p) => (
                <Bar
                  key={p.slug}
                  dataKey={p.name}
                  fill={colourOf(p.slug)}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
