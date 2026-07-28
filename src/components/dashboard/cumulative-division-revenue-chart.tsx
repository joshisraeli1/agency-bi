"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { CumulativeDivisionMonth } from "@/lib/analytics/division-fy";

// The division-goals store is keyed by goal names ("Content Delivery Paid" …);
// map each to its cumulative-revenue series name and brand colour.
const GOAL_TO_DATA: Record<string, string> = {
  "Content Delivery Paid": "Content Delivery",
  "Social Media Management": "Social Media Management",
  "Ads Management": "Ads Management",
};
const COLORS: Record<string, string> = {
  "Content Delivery Paid": "#ea580c",
  "Social Media Management": "#0d9488",
  "Ads Management": "#6366f1",
};

interface Props {
  data: CumulativeDivisionMonth[];
  goals: Record<string, number>; // per-division MONTHLY goals (shared with the monthly card)
}

export function CumulativeDivisionRevenueChart({ data, goals }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // FY goal = monthly goal × 12; edit here in FY terms.
  const fyGoalsOf = (g: Record<string, number>) =>
    Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v * 12]));
  const [form, setForm] = useState<Record<string, number>>(() => fyGoalsOf(goals));

  const fyLabel = data.length
    ? `FY${data[0].rawMonth.slice(2, 4)}/${String(Number(data[0].rawMonth.slice(0, 4)) + 1).slice(2)}`
    : "FY";
  const last = data.length ? data[data.length - 1] : null;
  const cumOf = (goalKey: string): number => {
    if (!last) return 0;
    const dataKey = GOAL_TO_DATA[goalKey] ?? goalKey;
    return (last as unknown as Record<string, number>)[dataKey] ?? 0;
  };

  async function save() {
    setSaving(true);
    try {
      // Stored as monthly (FY ÷ 12) so this and the monthly card share one goal.
      const monthly = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, Math.round(Number(v) / 12)])
      );
      const res = await fetch("/api/settings/division-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(monthly),
      });
      if (!res.ok) throw new Error();
      toast.success("FY goals updated");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Failed to save goals");
    } finally {
      setSaving(false);
    }
  }

  const divisions = Object.keys(goals);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cumulative Revenue by Division vs Goal — {fyLabel}</CardTitle>
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(fyGoalsOf(goals));
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit goals
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm mt-1">
          Cumulative recognized revenue (ex-GST) this financial year to date, vs each division&apos;s FY goal.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {divisions.map((div) => {
          const actual = cumOf(div);
          const goal = form[div] ?? 0;
          const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0;
          const hit = goal > 0 && actual >= goal;
          const color = COLORS[div] ?? "#64748b";
          return (
            <div key={div}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="font-medium">{GOAL_TO_DATA[div] ?? div}</span>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{formatCurrency(actual)} /</span>
                    <Input
                      type="number"
                      value={form[div] ?? 0}
                      onChange={(e) => setForm((p) => ({ ...p, [div]: Number(e.target.value) }))}
                      className="w-36 h-8"
                    />
                  </div>
                ) : (
                  <span className="tabular-nums">
                    <span className={hit ? "font-semibold text-green-600" : "font-semibold"}>{formatCurrency(actual)}</span>
                    <span className="text-muted-foreground"> / {formatCurrency(goal)}</span>
                    <span className="text-muted-foreground ml-2">{goal > 0 ? `${Math.round((actual / goal) * 100)}%` : "—"}</span>
                  </span>
                )}
              </div>
              {!editing && (
                <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hit ? "#16a34a" : color }} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
