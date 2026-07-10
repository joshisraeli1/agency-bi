"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, Loader2 } from "lucide-react";

/**
 * Security settings — currently just "forget all trusted devices", which
 * revokes every device that can skip the 2FA step (see /api/auth/forget-devices).
 */
export function SecuritySettings() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function onForget() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/auth/forget-devices", { method: "POST" });
      if (!res.ok) throw new Error();
      setResult({ success: true, message: "All trusted devices forgotten. Every device will need a 2FA code on next login." });
    } catch {
      setResult({ success: false, message: "Couldn't forget devices. Please try again." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Security
        </CardTitle>
        <CardDescription>
          Manage devices that are allowed to skip two-factor authentication.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <Alert variant={result.success ? "default" : "destructive"}>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between rounded-md border p-4">
          <div>
            <p className="text-sm font-medium">Trusted devices</p>
            <p className="text-xs text-muted-foreground">
              Devices where you ticked &ldquo;Trust this device for 30 days&rdquo; skip the 2FA
              code at login. Forget them all if a device is lost or shared.
            </p>
          </div>
          <Button variant="outline" onClick={onForget} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Forgetting…" : "Forget all trusted devices"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
