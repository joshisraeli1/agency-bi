"use client";

import { useState } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ForecastDealRef, ForecastMonth, ThreeMonthForecast as ThreeMonthForecastData } from "@/lib/analytics/forecast-3month";

// Same hues as the Revenue Forecast chart on this page, so "in" and "out" read
// the same in both. The lighter step of each marks an estimate rather than
// named deals; the legend and tooltip name every segment, so colour is never alone.
const RETAINED = "#475569";
const IN = "#16a34a";
const IN_EST = "#86efac";
const OUT = "#dc2626";
const OUT_EST = "#fca5a5";

interface MonthRow {
  tick: string;
  month: string;
  rawMonth: string | null;
  retained: number;
  pipeline: number;
  pipelineAssumed: boolean;
  /** Negative, so the churn stacks below zero. */
  knownChurn: number;
  rateChurn: number;
  projected: number;
  totalLabel: string;
}

const short = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`);

/**
 * One stacked bar per month. Above zero: revenue kept from the month's start,
 * with pipeline on top, so the bar's height is the projected MRR. Below zero:
 * what churned that month, known and rate-based.
 */
function buildRows(data: ThreeMonthForecastData): MonthRow[] {
  const rows: MonthRow[] = [
    {
      tick: "Now", month: "Current MRR", rawMonth: null, retained: data.currentMrr, pipeline: 0,
      pipelineAssumed: false, knownChurn: 0, rateChurn: 0, projected: data.currentMrr,
      totalLabel: short(data.currentMrr),
    },
  ];
  for (const m of data.months) {
    rows.push({
      tick: m.month.split(" ")[0],
      month: m.month,
      rawMonth: m.rawMonth,
      retained: Math.max(0, m.starting - m.knownChurn - m.baselineChurn),
      pipeline: m.pipelineAdded,
      pipelineAssumed: m.pipelineAssumed,
      knownChurn: -m.knownChurn,
      rateChurn: -m.baselineChurn,
      projected: m.projected,
      totalLabel: short(m.projected),
    });
  }
  return rows;
}

function MonthTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthRow }[] }) {
  const r = payload?.[0]?.payload;
  if (!active || !r) return null;
  const line = (label: string, value: string, colour?: string) => (
    <div className="flex items-center justify-between gap-6">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {colour && <span className="h-2 w-2 rounded-sm" style={{ background: colour }} aria-hidden />}
        {label}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm space-y-0.5 min-w-[220px]">
      <p className="font-medium mb-1">{r.month}</p>
      {r.rawMonth === null ? (
        line("Current MRR", formatCurrency(r.retained), RETAINED)
      ) : (
        <>
          {line("Retained", formatCurrency(r.retained), RETAINED)}
          {line(r.pipelineAssumed ? "Pipeline (run-rate)" : "Pipeline", `+${formatCurrency(r.pipeline)}`, r.pipelineAssumed ? IN_EST : IN)}
          {line("Known churn", `−${formatCurrency(-r.knownChurn)}`, OUT)}
          {line("Rate churn", `−${formatCurrency(-r.rateChurn)}`, OUT_EST)}
          <div className="border-t pt-1 mt-1 font-semibold">{line("Projected MRR", formatCurrency(r.projected))}</div>
          <p className="text-muted-foreground pt-0.5">Click pipeline or known churn for the deals</p>
        </>
      )}
    </div>
  );
}

function StackLegend() {
  const items = [
    { c: RETAINED, l: "Retained MRR" },
    { c: IN, l: "Pipeline" },
    { c: IN_EST, l: "Pipeline (run-rate estimate)" },
    { c: OUT, l: "Known churn" },
    { c: OUT_EST, l: "Rate churn (estimate)" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.c }} aria-hidden />
          {i.l}
        </span>
      ))}
    </div>
  );
}

function DealList({ deals }: { deals: ForecastDealRef[] }) {
  if (!deals.length) return <p className="mt-1 text-xs text-muted-foreground">No deals.</p>;
  return (
    <div className="mt-1 space-y-1">
      {deals.map((d, i) => (
        <div key={`${d.name}-${i}`} className="flex items-center justify-between text-xs border-b py-1 last:border-0">
          <span className="truncate mr-2">{d.name}</span>
          <span className="tabular-nums text-muted-foreground">{formatCurrency(d.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function Row({
  label,
  value,
  note,
  sign,
  onClick,
  active,
}: {
  label: string;
  value: number;
  note?: string;
  sign?: "+" | "−";
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center justify-between rounded px-1 py-0.5 text-sm ${onClick ? "hover:bg-muted cursor-pointer" : "cursor-default"} ${active ? "bg-muted" : ""}`}
    >
      <span className="text-muted-foreground">
        {label}
        {note ? <span className="ml-1 text-xs">({note})</span> : null}
        {onClick ? <span className="ml-1 text-xs">▸</span> : null}
      </span>
      <span className="tabular-nums">
        {sign ? `${sign}` : ""}
        {formatCurrency(value)}
      </span>
    </button>
  );
}

function MonthBlock({
  m,
  openKey,
  onToggle,
}: {
  m: ForecastMonth;
  openKey: string | null;
  onToggle: (key: string) => void;
}) {
  const pipeKey = `${m.rawMonth}:pipeline`;
  const churnKey = `${m.rawMonth}:churn`;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm font-semibold">{m.month}</div>
      <div className="space-y-0.5">
        <Row label="Starting" value={m.starting} />
        <Row
          label="Pipeline"
          value={m.pipelineAdded}
          sign="+"
          note={m.pipelineAssumed ? "assumed run-rate" : undefined}
          onClick={() => onToggle(pipeKey)}
          active={openKey === pipeKey}
        />
        {openKey === pipeKey && <DealList deals={m.pipelineDeals} />}
        <Row label="Known churn" value={m.knownChurn} sign="−" onClick={() => onToggle(churnKey)} active={openKey === churnKey} />
        {openKey === churnKey && <DealList deals={m.churnDeals} />}
        <Row label="Baseline churn" value={m.baselineChurn} sign="−" note="rate" />
        <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold">
          <span>Projected MRR</span>
          <span className="tabular-nums">{formatCurrency(m.projected)}</span>
        </div>
      </div>
    </div>
  );
}

export function ThreeMonthForecast({ data }: { data: ThreeMonthForecastData }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));
  const { assumptions } = data;
  const rows = buildRows(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>3-Month Revenue Forecast</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          From current MRR {formatCurrency(data.currentMrr)} · pipeline run-rate{" "}
          <span className="font-semibold text-foreground">{formatCurrency(assumptions.pipelineRunRate)}/mo</span> (recent 3-mo) ·{" "}
          churn <span className="font-semibold text-foreground">{assumptions.churnRatePct}%/mo</span> ·{" "}
          {assumptions.stageProbabilities.map((s) => `${s.stage} ${Math.round(s.probability * 100)}%`).join(" · ")} ·{" "}
          timing ~{assumptions.medianLagDays}d
        </p>
        <StackLegend />
        <div
          className="h-[320px]"
          role="img"
          aria-label="Stacked bars of projected MRR for the next three months; the month cards below give every figure"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} stackOffset="sign" margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
              <XAxis dataKey="tick" tickLine={false} axisLine={false} fontSize={12} interval={0} />
              <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} width={56} />
              <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
              <Tooltip content={<MonthTooltip />} cursor={{ fill: "currentColor", opacity: 0.05 }} />
              <Bar dataKey="retained" stackId="m" fill={RETAINED} isAnimationActive={false} />
              <Bar
                dataKey="pipeline"
                stackId="m"
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(bar) => {
                  const r = (bar as unknown as { payload?: MonthRow })?.payload;
                  if (r?.rawMonth) toggle(`${r.rawMonth}:pipeline`);
                }}
              >
                {rows.map((r) => (
                  <Cell key={r.tick} fill={r.pipelineAssumed ? IN_EST : IN} />
                ))}
                <LabelList dataKey="totalLabel" position="top" fontSize={11} fill="currentColor" />
              </Bar>
              <Bar
                dataKey="knownChurn"
                stackId="m"
                fill={OUT}
                isAnimationActive={false}
                cursor="pointer"
                onClick={(bar) => {
                  const r = (bar as unknown as { payload?: MonthRow })?.payload;
                  if (r?.rawMonth) toggle(`${r.rawMonth}:churn`);
                }}
              />
              <Bar dataKey="rateChurn" stackId="m" fill={OUT_EST} radius={[0, 0, 4, 4]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.months.map((m) => (
            <MonthBlock key={m.rawMonth} m={m} openKey={openKey} onToggle={toggle} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
