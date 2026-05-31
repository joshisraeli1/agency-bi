"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface Props {
  mrrGoal: number;
  dealsGoal: number;
}

export function MichaelGoalsEditor({ mrrGoal, dealsGoal }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mrr, setMrr] = useState(String(mrrGoal));
  const [deals, setDeals] = useState(String(dealsGoal));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/michael/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrrGoal: Number(mrr), dealsGoal: Number(deals) }),
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

  if (!editing) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>
          Goals: <strong className="text-foreground">{formatCurrency(mrrGoal)}/mo</strong> ·{" "}
          <strong className="text-foreground">{dealsGoal} deals/mo</strong>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="mrr-goal" className="text-xs">MRR goal ($/mo)</Label>
        <Input id="mrr-goal" type="number" value={mrr} onChange={(e) => setMrr(e.target.value)} className="w-32 h-9" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="deals-goal" className="text-xs">Deals goal (/mo)</Label>
        <Input id="deals-goal" type="number" value={deals} onChange={(e) => setDeals(e.target.value)} className="w-28 h-9" />
      </div>
      <Button size="sm" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
        Cancel
      </Button>
    </div>
  );
}
