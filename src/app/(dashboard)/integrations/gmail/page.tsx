"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface SyncStatus {
  importId: string;
  status: "running" | "completed" | "failed";
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  currentStep?: string;
}

export default function GmailIntegrationPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Sync state
  const [syncState, setSyncState] = useState<{
    running: boolean;
    status: SyncStatus | null;
  }>({ running: false, status: null });

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected === "true") {
      setTestResult({ success: true, message: "Successfully connected to Gmail" });
      setIsConnected(true);
    } else if (error) {
      setTestResult({ success: false, message: error });
    }
  }, []);

  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/integrations/gmail");
        if (!res.ok) return;
        const data = await res.json();

        if (data.config?.accessToken) {
          setIsConnected(data.enabled);
        }
        setConfigLoaded(true);
      } catch {
        setConfigLoaded(true);
      }
    }
    loadConfig();
  }, []);

  // Poll sync status
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (syncState.running && syncState.status?.importId) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/sync/gmail/status?importId=${syncState.status!.importId}`
          );
          if (!res.ok) return;
          const data: SyncStatus = await res.json();

          setSyncState({
            running: data.status === "running",
            status: data,
          });

          if (data.status !== "running") {
            clearInterval(interval);
          }
        } catch {
          // Continue polling
        }
      }, 1500);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncState.running, syncState.status?.importId]);

  async function handleConnect() {
    window.location.href = "/api/integrations/gmail/auth";
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/integrations/gmail/test", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setTestResult({ success: true, message: data.message });
        setIsConnected(true);
        if (data.message?.includes("@")) {
          setConnectedEmail(data.message.replace("Connected as ", ""));
        }
      } else {
        setTestResult({
          success: false,
          message: data.error || "Connection failed",
        });
        setIsConnected(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection test failed";
      setTestResult({ success: false, message: msg });
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSync() {
    setSyncState({ running: true, status: null });

    try {
      const res = await fetch("/api/sync/gmail", {
        method: "POST",
      });
      const data = await res.json();

      if (data.error) {
        setSyncState({
          running: false,
          status: {
            importId: "",
            status: "failed",
            recordsFound: 0,
            recordsSynced: 0,
            recordsFailed: 0,
            currentStep: data.error,
          },
        });
        return;
      }

      setSyncState({
        running: true,
        status: {
          importId: data.importId,
          status: "running",
          recordsFound: 0,
          recordsSynced: 0,
          recordsFailed: 0,
          currentStep: "Starting...",
        },
      });
    } catch {
      setSyncState({
        running: false,
        status: {
          importId: "",
          status: "failed",
          recordsFound: 0,
          recordsSynced: 0,
          recordsFailed: 0,
          currentStep: "Failed to start sync",
        },
      });
    }
  }

  const { running, status } = syncState;
  const progressPercent =
    status && status.recordsFound > 0
      ? Math.round((status.recordsSynced / status.recordsFound) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/integrations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Gmail Integration</h1>
          <p className="text-muted-foreground mt-1">
            Connect to Gmail to sync email communications with clients.
          </p>
        </div>
      </div>

      {/* Connection Config */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>
            Connect your Google account to sync emails. This will redirect you
            to Google to authorize read-only access to your Gmail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && connectedEmail && (
            <div className="flex items-center gap-2">
              <Badge className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Connected as {connectedEmail}
              </Badge>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleConnect}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {isConnected ? "Reconnect to Gmail" : "Connect to Gmail"}
            </Button>
            {isConnected && (
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>
            )}

            {testResult && (
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {testResult.message}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {testResult.message}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sync Actions */}
      {isConnected && (
        <>
          <Separator />
          <div>
            <h2 className="text-xl font-semibold mb-4">Data Sync</h2>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Emails</CardTitle>
                    <CardDescription>
                      Sync recent emails and match to clients as communication logs
                    </CardDescription>
                  </div>
                  {status?.status === "completed" && (
                    <Badge>Completed</Badge>
                  )}
                  {status?.status === "failed" && (
                    <Badge variant="destructive">Failed</Badge>
                  )}
                  {running && <Badge variant="secondary">Running</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {running && status && (
                  <div className="space-y-2">
                    <Progress value={progressPercent} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{status.currentStep}</span>
                      <span>
                        {status.recordsSynced}/{status.recordsFound} records
                      </span>
                    </div>
                  </div>
                )}

                {!running && status && status.status !== "running" && (
                  <div className="text-sm text-muted-foreground space-y-1">
                    {status.status === "completed" && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>
                          Synced {status.recordsSynced} of {status.recordsFound}{" "}
                          records
                          {status.recordsFailed > 0 &&
                            ` (${status.recordsFailed} failed)`}
                        </span>
                      </div>
                    )}
                    {status.status === "failed" && (
                      <div className="flex items-center gap-2 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span>{status.currentStep || "Sync failed"}</span>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  onClick={handleSync}
                  disabled={!isConnected || running}
                  size="sm"
                  className="w-full"
                >
                  {running ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Emails
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
