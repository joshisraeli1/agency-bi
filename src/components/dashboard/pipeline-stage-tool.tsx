"use client";

import { useState } from "react";
import { StatCard } from "@/components/charts/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PipelineStageColumn } from "@/lib/analytics/pipeline-stages";

export function PipelineStageTool({ stages }: { stages: PipelineStageColumn[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = stages.find((s) => s.stage === selected) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue by Pipeline Stage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {stages.map((s) => (
            <button
              key={s.stage}
              type="button"
              onClick={() => setSelected((prev) => (prev === s.stage ? null : s.stage))}
              className={`text-left rounded-lg transition ${selected === s.stage ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"}`}
            >
              <StatCard
                title={s.stage}
                value={formatCurrency(s.total)}
                description={`${s.deals.length} deal${s.deals.length !== 1 ? "s" : ""}`}
              />
            </button>
          ))}
        </div>

        {active && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                {active.stage} — {active.deals.length} deal{active.deals.length !== 1 ? "s" : ""}
              </h4>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            {active.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals.</p>
            ) : (
              <div className="space-y-1">
                {active.deals.map((d, i) => (
                  <div
                    key={`${d.name}-${i}`}
                    className="flex items-center justify-between text-sm border-b py-1 last:border-0"
                  >
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
      </CardContent>
    </Card>
  );
}
