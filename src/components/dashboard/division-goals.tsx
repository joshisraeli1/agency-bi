"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { PackageTypeRow } from "@/lib/analytics/active-revenue";

interface Props {
  byPackageType: PackageTypeRow[];
  goals: Record<string, number>;
}

export function DivisionGoals({ byPackageType, goals }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, number>>(goals);

  // Show every division that has a goal (stable order), with its current revenue.
  const revByDivision = new Map(byPackageType.map((r) => [r.packageType, r.revenue]));
  const divisions = Object.keys(goals);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/division-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Division goals updated");
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
          <CardTitle className="text-base">Revenue by Division vs Goal (monthly)</CardTitle>
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
      <CardContent className="space-y-4">
        {divisions.map((div) => {
          const actual = revByDivision.get(div) ?? 0;
          const goal = form[div] ?? 0;
          const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0;
          const hit = goal > 0 && actual >= goal;
          return (
            <div key={div}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="font-medium">{div}</span>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">{formatCurrency(actual)} /</span>
                    <Input
                      type="number"
                      value={form[div] ?? 0}
                      onChange={(e) => setForm((p) => ({ ...p, [div]: Number(e.target.value) }))}
                      className="w-28 h-8"
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
                  <div className={`h-full ${hit ? "bg-green-600" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
