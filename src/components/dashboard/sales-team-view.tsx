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
}

// One hue per person, fixed by position so a filter never repaints the others.
const SERIES = ["#ea580c", "#0d9488", "#7c3aed", "#b45309"];

export function SalesTeamView({ people }: { people: SalesPersonSummary[] }) {
  const [selected, setSelected] = useState<string>("all");
  const shown = selected === "all" ? people : people.filter((p) => p.slug === selected);
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Sales</h1>
          <p className="text-muted-foreground mt-1">
            The team side by side. Open anyone&apos;s board for their own targets and commission.
          </p>
        </div>
        <div className="flex items-center rounded-md border shrink-0">
          <button
            onClick={() => setSelected("all")}
            className={`px-3 py-1.5 text-sm rounded-l-md ${
              selected === "all" ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            All
          </button>
          {people.map((p, i) => (
            <button
              key={p.slug}
              onClick={() => setSelected(p.slug)}
              className={`px-3 py-1.5 text-sm ${i === people.length - 1 ? "rounded-r-md" : ""} ${
                selected === p.slug ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {p.name.split(" ")[0]}
            </button>
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
