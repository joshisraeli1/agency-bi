"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * Resyncs the dashboard's source data — HubSpot deals (revenue tiles +
 * new/churn) and the Xero P&L (Xero revenue charts) — then refreshes the page.
 */
export function RefreshDataButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onClick() {
    setLoading(true);
    const id = toast.loading("Resyncing HubSpot & Xero…");
    try {
      const res = await fetch("/api/sync/refresh", { method: "POST" });
      const data = await res.json();

      if (!res.ok && data.errors?.length === 2) {
        toast.error(`Resync failed: ${data.errors.join("; ")}`, { id });
        return;
      }

      const parts: string[] = [];
      if (data.hubspot) parts.push(`HubSpot: ${data.hubspot.upserted} deals`);
      if (data.xero) parts.push(`Xero: ${data.xero.months} mo`);
      const msg = parts.join(" · ") || "Done";

      if (data.errors?.length) {
        toast.warning(`${msg} — ${data.errors.join("; ")}`, { id });
      } else {
        toast.success(`Resynced — ${msg}`, { id });
      }
      router.refresh();
    } catch {
      toast.error("Resync failed — check your connection and try again.", { id });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Resyncing…" : "Resync data"}
    </Button>
  );
}
