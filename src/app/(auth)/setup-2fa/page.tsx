"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Setup2FAPage() {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "verify">("intro");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup-2fa");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate 2FA secret");
        setLoading(false);
        return;
      }
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("verify");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setLoading(false);
        return;
      }
      // 2FA is now enabled; session has been refreshed — go to dashboard
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Set Up Two-Factor Authentication</CardTitle>
          <CardDescription>
            Two-factor authentication is required for all accounts. Set it up now
            to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === "intro" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You will need an authenticator app such as Google Authenticator,
                Authy, or 1Password. Click the button below to generate your
                secret key and QR code.
              </p>
              <Button
                onClick={handleGenerate}
                className="w-full"
                disabled={loading}
              >
                {loading ? "Generating..." : "Generate QR Code"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleLogout}
              >
                Sign out
              </Button>
            </div>
          )}

          {step === "verify" && (
            <div className="space-y-4">
              {qrCode && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="Scan this QR code with your authenticator app"
                    width={200}
                    height={200}
                  />
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  Scan the QR code above with your authenticator app. If you
                  cannot scan it, enter this secret manually:
                </p>
                <div className="bg-muted rounded-md p-2 text-center font-mono text-sm break-all select-all">
                  {secret}
                </div>
              </div>

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token">Verification Code</Label>
                  <Input
                    id="token"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    autoFocus
                    placeholder="000000"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Verifying..." : "Verify & Enable 2FA"}
                </Button>
              </form>

              <Button
                variant="ghost"
                className="w-full"
                onClick={handleLogout}
              >
                Sign out
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
