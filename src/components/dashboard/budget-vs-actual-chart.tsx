"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import type { BudgetVsActualRow } from "@/lib/analytics/revenue-budget";

const ACTUAL_COLOR = "#ea580c"; // HubSpot orange (matches Monthly Revenue chart)
const BUDGET_COLOR = "#1e293b"; // slate — the target line

export function BudgetVsActualChart({ data }: { data: BudgetVsActualRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, number>>(
    Object.fromEntries(data.map((r) => [r.month, r.budget]))
  );

  const totalActual = data.reduce((s, r) => s + r.actual, 0);
  const totalBudget = data.reduce((s, r) => s + r.budget, 0);
  const variance = totalActual - totalBudget;
  const variancePct = totalBudget > 0 ? (variance / totalBudget) * 100 : 0;
  const ahead = variance >= 0;

  const fmtAxis = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/revenue-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("Revenue budget updated");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Failed to save budget");
    }
    setSaving(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">Revenue vs Budget (ex-GST)</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              Actual HubSpot monthly revenue against the plan.{" "}
              <span className={ahead ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {ahead ? "+" : "−"}
                {formatCurrency(Math.abs(variance))} ({ahead ? "+" : "−"}
                {Math.abs(variancePct).toFixed(1)}%) vs budget
              </span>{" "}
              across the period.
            </p>
          </div>
          {editing ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setForm(Object.fromEntries(data.map((r) => [r.month, r.budget])));
                  setEditing(false);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit budget
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={fmtAxis} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <Legend />
            <Bar dataKey="actual" name="Actual (HubSpot)" fill={ACTUAL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={64}>
              <LabelList
                dataKey="actual"
                position="top"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => fmtAxis(Number(v))}
                style={{ fontSize: 11, fill: "#6b7280" }}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="budget"
              name="Budget"
              stroke={BUDGET_COLOR}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {editing && (
          <div className="mt-4 rounded-lg border p-4">
            <p className="text-sm font-medium mb-3">Monthly budget (ex-GST)</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.map((r) => (
                <label key={r.month} className="text-xs text-muted-foreground">
                  {r.label}
                  <Input
                    type="number"
                    className="mt-1"
                    value={form[r.month] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [r.month]: Number(e.target.value) }))}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
