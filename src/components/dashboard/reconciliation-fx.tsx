"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, Coins } from "lucide-react";
import { toast } from "sonner";

interface Rate {
  code: string;
  rate: string;
}

export function ReconciliationFx({ initial }: { initial: Record<string, number> }) {
  const router = useRouter();
  const [rows, setRows] = useState<Rate[]>(
    Object.entries(initial).map(([code, rate]) => ({ code, rate: String(rate) })),
  );
  const [busy, setBusy] = useState(false);

  function update(i: number, field: keyof Rate, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }
  function add() {
    setRows((r) => [...r, { code: "", rate: "" }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    try {
      const rates: Record<string, number> = {};
      for (const { code, rate } of rows) {
        const c = code.trim().toUpperCase();
        const n = Number(rate);
        if (c && c !== "AUD" && Number.isFinite(n) && n > 0) rates[c] = n;
      }
      const res = await fetch("/api/reconciliation/fx", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rates }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Save failed (${res.status})`);
        return;
      }
      const body = await res.json();
      setRows(Object.entries(body.rates as Record<string, number>).map(([code, rate]) => ({ code, rate: String(rate) })));
      toast.success("FX rates saved — re-run reconciliation to apply.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-5 w-5 text-muted-foreground" /> Currency rates
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          HubSpot deals are in AUD. When a Xero invoice is in another currency (e.g. Superpower
          bills in USD), it&apos;s converted to AUD at these rates before comparing. 1 unit of the
          currency = X AUD.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[100px_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
          <span>Currency</span>
          <span>1 unit = ? AUD</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[100px_1fr_auto] items-center gap-2">
            <Input
              value={row.code}
              placeholder="USD"
              maxLength={3}
              onChange={(e) => update(i, "code", e.target.value.toUpperCase())}
            />
            <Input
              value={row.rate}
              placeholder="1.5"
              inputMode="decimal"
              onChange={(e) => update(i, "rate", e.target.value)}
            />
            <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4" /> Add currency
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Save rates"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
