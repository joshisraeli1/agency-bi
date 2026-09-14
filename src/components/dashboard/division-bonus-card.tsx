"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Check } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { DivisionGoalProgress } from "@/lib/analytics/division-goals";

const HIT = "#0d9488";
const PACE = "#ea580c";
const BEHIND = "#94a3b8";

export function DivisionBonusCard({ data }: { data: DivisionGoalProgress }) {
  const {
    tiers, cumulative, projected, monthsElapsed, monthsInPeriod,
    fyStartLabel, latestMonthly, currentBonus, projectedBonus,
  } = data;

  const topTarget = tiers[tiers.length - 1]?.target ?? 0;
  const pct = (v: number) => (topTarget > 0 ? Math.min(100, (v / topTarget) * 100) : 0);
  const nextTier = tiers.find((t) => !t.projectedToHit);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          Bonus Progress
        </CardTitle>
        <p className="text-muted-foreground text-sm mt-1">
          Cumulative division revenue (ex-GST) from {fyStartLabel}. Month {monthsElapsed} of{" "}
          {monthsInPeriod}.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm">
          <span>
            <span className="text-2xl font-semibold tabular-nums">{formatCurrency(cumulative)}</span>
            <span className="text-muted-foreground ml-2">so far</span>
          </span>
          <span className="self-end text-muted-foreground">
            tracking to {formatCurrency(projected)} at {formatCurrency(latestMonthly)}/mo
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* One scale for every tier, so the gaps between them are visible rather
            than each tier having its own full-width bar. */}
        <div className="space-y-1">
          <div className="relative h-3 rounded-full bg-muted overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(projected)}%`, background: PACE, opacity: 0.35 }} />
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(cumulative)}%`, background: HIT }} />
            {tiers.map((t) => (
              <div
                key={t.target}
                className="absolute inset-y-0 w-px bg-background"
                style={{ left: `${pct(t.target)}%` }}
                aria-hidden
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Banked {formatCurrency(cumulative)}</span>
            <span>Projected {formatCurrency(projected)}</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left font-medium py-2 px-3">Tier</th>
                <th className="text-right font-medium py-2 px-3">Revenue target</th>
                <th className="text-right font-medium py-2 px-3">Bonus</th>
                <th className="text-right font-medium py-2 px-3">Progress</th>
                <th className="text-right font-medium py-2 px-3">On current pace</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={t.target} className="border-b">
                  <td className="py-2 px-3 font-medium" title={t.note}>
                    Tier {i + 1}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(t.target)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(t.bonus)}</td>
                  <td className="text-right py-2 px-3 tabular-nums">{t.percentOfTarget}%</td>
                  <td
                    className="text-right py-2 px-3 tabular-nums"
                    style={{ color: t.attained ? HIT : t.projectedToHit ? PACE : BEHIND }}
                  >
                    {t.attained ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Achieved
                      </span>
                    ) : t.projectedToHit ? (
                      "On track"
                    ) : (
                      `${formatCurrency(t.shortfall)} short`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          {currentBonus > 0
            ? `${formatCurrency(currentBonus)} earned if the year ended today. `
            : "No tier reached yet. "}
          {projectedBonus > 0
            ? `On the current run rate the year finishes at ${formatCurrency(projectedBonus)}.`
            : nextTier
              ? `Tier 1 needs another ${formatCurrency(nextTier.shortfall)} above the current run rate — about ${formatCurrency(
                  Math.ceil(nextTier.shortfall / Math.max(1, monthsInPeriod - monthsElapsed)),
                )} more per month for the rest of the year.`
              : ""}
        </p>
      </CardContent>
    </Card>
  );
}
