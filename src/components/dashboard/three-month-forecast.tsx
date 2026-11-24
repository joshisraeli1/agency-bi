"use client";

import { useState } from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ForecastDealRef, ForecastMonth, ThreeMonthForecast as ThreeMonthForecastData } from "@/lib/analytics/forecast-3month";

// Same hues as the Revenue Forecast waterfall on this page, so "in" and "out"
// read the same in both. The lighter step of each marks an estimate rather than
// named deals; every bar also carries a signed label, so colour is never alone.
const TOTAL = "#475569";
const PROJECTED = "#2563eb";
const IN = "#16a34a";
const IN_EST = "#86efac";
const OUT = "#dc2626";
const OUT_EST = "#fca5a5";

type StepKind = "total" | "pipeline" | "churn" | "baseline";

interface Step {
  key: string;
  tick: string;
  month: string;
  label: string;
  kind: StepKind;
  base: number;
  value: number;
  color: string;
  barLabel: string;
  estimate: boolean;
  openKey?: string;
}

const short = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${Math.round(v)}`);

/**
 * The months chained into one waterfall: today's MRR, then each month's pipeline
 * up, churn down, landing on its projected total, which is the next month's
 * start. Zero steps are left out rather than drawn as empty slots.
 */
function buildSteps(data: ThreeMonthForecastData): Step[] {
  const steps: Step[] = [
    {
      key: "now", tick: "Now", month: "Current", label: "Current MRR", kind: "total",
      base: 0, value: data.currentMrr, color: TOTAL, barLabel: short(data.currentMrr), estimate: false,
    },
  ];
  for (const m of data.months) {
    const abbr = m.month.split(" ")[0];
    let level = m.starting;
    if (m.pipelineAdded > 0) {
      steps.push({
        key: `${m.rawMonth}-pipe`, tick: "+ Pipeline", month: m.month,
        label: m.pipelineAssumed ? "Pipeline (assumed run-rate)" : "Pipeline",
        kind: "pipeline", base: level, value: m.pipelineAdded,
        color: m.pipelineAssumed ? IN_EST : IN, barLabel: `+${short(m.pipelineAdded)}`,
        estimate: m.pipelineAssumed, openKey: `${m.rawMonth}:pipeline`,
      });
      level += m.pipelineAdded;
    }
    if (m.knownChurn > 0) {
      level -= m.knownChurn;
      steps.push({
        key: `${m.rawMonth}-churn`, tick: "− Churn", month: m.month, label: "Known churn",
        kind: "churn", base: level, value: m.knownChurn, color: OUT,
        barLabel: `−${short(m.knownChurn)}`, estimate: false, openKey: `${m.rawMonth}:churn`,
      });
    }
    if (m.baselineChurn > 0) {
      level -= m.baselineChurn;
      steps.push({
        key: `${m.rawMonth}-base`, tick: "− Rate", month: m.month, label: "Baseline churn (rate)",
        kind: "baseline", base: level, value: m.baselineChurn, color: OUT_EST,
        barLabel: `−${short(m.baselineChurn)}`, estimate: true,
      });
    }
    steps.push({
      key: `${m.rawMonth}-total`, tick: abbr, month: m.month, label: "Projected MRR", kind: "total",
      base: 0, value: m.projected, color: PROJECTED, barLabel: short(m.projected), estimate: false,
    });
  }
  return steps;
}

function StepTooltip({ active, payload }: { active?: boolean; payload?: { payload: Step }[] }) {
  const s = payload?.[0]?.payload;
  if (!active || !s) return null;
  const sign = s.kind === "pipeline" ? "+" : s.kind === "total" ? "" : "−";
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{s.month}</p>
      <p className="text-muted-foreground">{s.label}</p>
      <p className="tabular-nums font-semibold mt-0.5">{sign}{formatCurrency(s.value)}</p>
      {s.estimate && <p className="text-muted-foreground mt-0.5">Estimate, not named deals</p>}
      {s.openKey && <p className="text-muted-foreground mt-0.5">Click for the deals</p>}
    </div>
  );
}

function WaterfallLegend() {
  const items = [
    { c: TOTAL, l: "Current MRR" },
    { c: IN, l: "Pipeline" },
    { c: OUT, l: "Known churn" },
    { c: PROJECTED, l: "Projected MRR" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.l} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.c }} aria-hidden />
          {i.l}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: IN_EST }} aria-hidden />
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT_EST }} aria-hidden />
        Lighter = estimate (run-rate pipeline, rate-based churn)
      </span>
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
  const steps = buildSteps(data);

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
        <WaterfallLegend />
        <div
          className="h-[300px]"
          role="img"
          aria-label="Waterfall of projected MRR over the next three months; the month cards below give every figure"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={steps} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
              <XAxis dataKey="tick" tickLine={false} axisLine={false} fontSize={11} interval={0} />
              <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} width={56} />
              <Tooltip content={<StepTooltip />} cursor={{ fill: "currentColor", opacity: 0.05 }} />
              <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
              <Bar
                dataKey="value"
                stackId="w"
                radius={[4, 4, 4, 4]}
                isAnimationActive={false}
                onClick={(bar) => {
                  const k = (bar as unknown as { payload?: Step })?.payload?.openKey;
                  if (k) toggle(k);
                }}
              >
                {steps.map((s) => (
                  <Cell key={s.key} fill={s.color} cursor={s.openKey ? "pointer" : "default"} />
                ))}
                <LabelList dataKey="barLabel" position="top" fontSize={11} fill="currentColor" />
              </Bar>
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
