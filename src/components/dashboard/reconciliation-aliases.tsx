"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";

interface Alias {
  xeroName: string;
  clientName: string;
}

export function ReconciliationAliases({ initial }: { initial: Alias[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Alias[]>(initial.length ? initial : []);
  const [busy, setBusy] = useState(false);

  function update(i: number, field: keyof Alias, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }
  function add() {
    setRows((r) => [...r, { xeroName: "", clientName: "" }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function save() {
    setBusy(true);
    try {
      const cleaned = rows.filter((r) => r.xeroName.trim() && r.clientName.trim());
      const res = await fetch("/api/reconciliation/aliases", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aliases: cleaned }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Save failed (${res.status})`);
        return;
      }
      const body = await res.json();
      setRows(body.aliases ?? cleaned);
      toast.success("Name mappings saved — re-run reconciliation to apply.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-5 w-5 text-muted-foreground" /> Name mappings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Map a Xero contact name to the HubSpot client it bills. Use this when the names differ
          (e.g. <strong>HC Operating</strong> → <strong>Everlab</strong>), or to pull a separate
          Ads/Content deal onto a client&apos;s single combined Xero invoice (e.g.{" "}
          <strong>Smartpay Australia Limited</strong> → <strong>Smartpay Ads Mgmt</strong>). Deals
          that share a Xero invoice are then reconciled on their combined total.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 && (
          <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 text-xs text-muted-foreground">
            <span>Xero contact name</span>
            <span />
            <span>HubSpot client name</span>
            <span />
          </div>
        )}
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
            <Input
              value={row.xeroName}
              placeholder="HC Operating"
              onChange={(e) => update(i, "xeroName", e.target.value)}
            />
            <span className="text-muted-foreground">→</span>
            <Input
              value={row.clientName}
              placeholder="Everlab"
              onChange={(e) => update(i, "clientName", e.target.value)}
            />
            <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No name mappings yet.</p>
        )}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="h-4 w-4" /> Add mapping
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Save mappings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
