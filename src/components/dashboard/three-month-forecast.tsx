"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ForecastDealRef, ForecastMonth, ThreeMonthForecast as ThreeMonthForecastData } from "@/lib/analytics/forecast-3month";

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
        <Row label="Pipeline" value={m.pipelineAdded} sign="+" onClick={() => onToggle(pipeKey)} active={openKey === pipeKey} />
        {openKey === pipeKey && <DealList deals={m.pipelineDeals} />}
        <Row label="Net-new" value={m.netNewAdded} sign="+" note="run-rate" />
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>3-Month Revenue Forecast</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          From current MRR {formatCurrency(data.currentMrr)} · net-new {formatCurrency(assumptions.netNewMonthly)}/mo ·{" "}
          churn <span className="font-semibold text-foreground">{assumptions.churnRatePct}%/mo</span> ·{" "}
          {assumptions.stageProbabilities.map((s) => `${s.stage} ${Math.round(s.probability * 100)}%`).join(" · ")} ·{" "}
          timing ~{assumptions.medianLagDays}d
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.months.map((m) => (
            <MonthBlock key={m.rawMonth} m={m} openKey={openKey} onToggle={toggle} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
