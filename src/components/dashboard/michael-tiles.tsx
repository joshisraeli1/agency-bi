"use client";

import { useState } from "react";
import { StatCard } from "@/components/charts/stat-card";
import { formatCurrency } from "@/lib/utils";
import type { DealRef } from "@/lib/analytics/michael-sales";
import { DollarSign, TrendingUp, FileCheck, FilePlus } from "lucide-react";

interface Props {
  currentMrr: number;
  currentMrrDeals: DealRef[];
  lifetimeRevenue: number;
  lifetimeDeals: DealRef[];
  activeDealCount: number;
  activeDeals: DealRef[];
  dealsCreatedLast12mo: number;
  dealsCreated12moDeals: DealRef[];
}

export function MichaelTiles(props: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const tiles = [
    { key: "mrr", title: "Current MRR", value: formatCurrency(props.currentMrr), description: "Recurring revenue this month", icon: <DollarSign className="h-4 w-4 text-muted-foreground" />, deals: props.currentMrrDeals },
    { key: "ltv", title: "Lifetime Revenue", value: formatCurrency(props.lifetimeRevenue), description: "All-time recurring revenue owned", icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, deals: props.lifetimeDeals },
    { key: "active", title: "Active Deals", value: String(props.activeDealCount), description: "Closed-won, not churned", icon: <FileCheck className="h-4 w-4 text-muted-foreground" />, deals: props.activeDeals },
    { key: "created", title: "Deals Created (12mo)", value: String(props.dealsCreatedLast12mo), description: "Added to pipeline", icon: <FilePlus className="h-4 w-4 text-muted-foreground" />, deals: props.dealsCreated12moDeals },
  ];

  const active = tiles.find((t) => t.key === selected);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSelected((prev) => (prev === t.key ? null : t.key))}
            className={`text-left rounded-lg transition ${selected === t.key ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"}`}
          >
            <StatCard title={t.title} value={t.value} description={t.description} icon={t.icon} />
          </button>
        ))}
      </div>

      {active && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">
              {active.title} — {active.deals.length} deal{active.deals.length !== 1 ? "s" : ""}
            </h4>
            <button onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Close
            </button>
          </div>
          {active.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals.</p>
          ) : (
            <div className="space-y-1">
              {active.deals.map((d, i) => (
                <div key={`${d.name}-${i}`} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
                  <span className="truncate mr-2">{d.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(d.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold border-t pt-1 mt-2">
                <span>Total</span>
                <span>{formatCurrency(active.deals.reduce((s, d) => s + d.amount, 0))}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
