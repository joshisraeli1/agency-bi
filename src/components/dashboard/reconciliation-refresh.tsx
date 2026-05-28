"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ReconciliationRefresh() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/reconciliation/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Refresh failed (${res.status})`);
        return;
      }
      const result = await res.json();
      toast.success(
        `Reconciled ${result.totalDeals} deals — ${result.missing} missing, ${result.amountMismatch} mismatched, ${result.aligned} aligned`,
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={refresh} disabled={busy} size="sm">
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      {busy ? "Reconciling…" : "Re-run reconciliation"}
    </Button>
  );
}
