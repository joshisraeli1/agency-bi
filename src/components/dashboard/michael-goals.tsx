"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { MichaelGoals as Goals, MichaelProgressData } from "@/lib/analytics/michael-sales";

interface Props {
  goals: Goals;
  progress: MichaelProgressData;
}

function ProgressBar({ label, actual, goal, currency }: { label: string; actual: number; goal: number; currency: boolean }) {
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0;
  const hit = goal > 0 && actual >= goal;
  const fmt = (n: number) => (currency ? formatCurrency(n) : String(n));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className={hit ? "font-semibold text-green-600" : "font-semibold"}>{fmt(actual)}</span>
          <span className="text-muted-foreground"> / {fmt(goal)}</span>
          <span className="text-muted-foreground ml-2">{goal > 0 ? `${Math.round((actual / goal) * 100)}%` : "—"}</span>
        </span>
      </div>
      <div className="h-2.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${hit ? "bg-green-600" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function MichaelGoals({ goals, progress }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(goals);

  const setField = (path: string, value: string) => {
    const n = Number(value);
    setForm((prev) => {
      const next = structuredClone(prev);
      if (path === "recurringRevenue") next.recurringRevenue = n;
      else {
        const [metric, period] = path.split(".") as ["newRevenue" | "dealsCreated", "monthly" | "quarterly" | "annual"];
        next[metric][period] = n;
      }
      return next;
    });
  };

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/michael/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Goals updated");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Failed to save goals");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Goals &amp; Progress</CardTitle>
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setForm(goals); setEditing(false); }} disabled={saving}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit goals
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4 text-sm">
            <GoalInput label="Recurring Revenue (MRR) target" value={form.recurringRevenue} onChange={(v) => setField("recurringRevenue", v)} />
            <div>
              <p className="font-medium mb-2">New Revenue goals</p>
              <div className="grid grid-cols-3 gap-3">
                <GoalInput label="Monthly" value={form.newRevenue.monthly} onChange={(v) => setField("newRevenue.monthly", v)} />
                <GoalInput label="Quarterly" value={form.newRevenue.quarterly} onChange={(v) => setField("newRevenue.quarterly", v)} />
                <GoalInput label="Annual" value={form.newRevenue.annual} onChange={(v) => setField("newRevenue.annual", v)} />
              </div>
            </div>
            <div>
              <p className="font-medium mb-2">Deals Created goals</p>
              <div className="grid grid-cols-3 gap-3">
                <GoalInput label="Monthly" value={form.dealsCreated.monthly} onChange={(v) => setField("dealsCreated.monthly", v)} />
                <GoalInput label="Quarterly" value={form.dealsCreated.quarterly} onChange={(v) => setField("dealsCreated.quarterly", v)} />
                <GoalInput label="Annual" value={form.dealsCreated.annual} onChange={(v) => setField("dealsCreated.annual", v)} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <p className="font-medium text-sm">Recurring Revenue</p>
              <ProgressBar label="Current MRR" actual={progress.recurringRevenue.actual} goal={progress.recurringRevenue.goal} currency />
            </div>
            <div className="space-y-3">
              <p className="font-medium text-sm">New Revenue</p>
              <ProgressBar label="This month" actual={progress.newRevenue.monthly.actual} goal={progress.newRevenue.monthly.goal} currency />
              <ProgressBar label="This quarter" actual={progress.newRevenue.quarterly.actual} goal={progress.newRevenue.quarterly.goal} currency />
              <ProgressBar label="This year" actual={progress.newRevenue.annual.actual} goal={progress.newRevenue.annual.goal} currency />
            </div>
            <div className="space-y-3">
              <p className="font-medium text-sm">Deals Created</p>
              <ProgressBar label="This month" actual={progress.dealsCreated.monthly.actual} goal={progress.dealsCreated.monthly.goal} currency={false} />
              <ProgressBar label="This quarter" actual={progress.dealsCreated.quarterly.actual} goal={progress.dealsCreated.quarterly.goal} currency={false} />
              <ProgressBar label="This year" actual={progress.dealsCreated.annual.actual} goal={progress.dealsCreated.annual.goal} currency={false} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GoalInput({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
    </div>
  );
}
