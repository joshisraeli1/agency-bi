"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface Pipeline {
  id: string;
  label: string;
}

interface SyncStatus {
  importId: string;
  status: "running" | "completed" | "failed";
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  currentStep?: string;
}

export default function HubSpotIntegrationPage() {
  const [accessToken, setAccessToken] = useState("");
  const [pipelineId, setPipelineId] = useState("");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingPipelines, setIsLoadingPipelines] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Sync state for each type
  const [syncStates, setSyncStates] = useState<
    Record<string, { running: boolean; status: SyncStatus | null }>
  >({
    deals: { running: false, status: null },
    companies: { running: false, status: null },
    contacts: { running: false, status: null },
  });

  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/integrations/hubspot");
        if (!res.ok) return;
        const data = await res.json();

        if (data.config?.accessToken) {
          setAccessToken(data.config.accessToken);
          setIsConnected(data.enabled);
        }
        if (data.config?.pipelineId) {
          setPipelineId(data.config.pipelineId);
        }
        setConfigLoaded(true);
      } catch {
        setConfigLoaded(true);
      }
    }
    loadConfig();
  }, []);

  // Load pipelines after connection is established
  const loadPipelines = useCallback(async () => {
    setIsLoadingPipelines(true);
    try {
      const res = await fetch("/api/sync/hubspot/pipelines");
      if (res.ok) {
        const data = await res.json();
        setPipelines(data.pipelines || []);
      }
    } catch {
      // Pipelines will remain empty
    } finally {
      setIsLoadingPipelines(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected && configLoaded) {
      loadPipelines();
    }
  }, [isConnected, configLoaded, loadPipelines]);

  // Poll sync status
  useEffect(() => {
    const intervals: Record<string, ReturnType<typeof setInterval>> = {};

    for (const type of ["deals", "companies", "contacts"]) {
      const state = syncStates[type];
      if (state.running && state.status?.importId) {
        intervals[type] = setInterval(async () => {
          try {
            const res = await fetch(
              `/api/sync/hubspot/status?importId=${state.status!.importId}`
            );
            if (!res.ok) return;
            const data: SyncStatus = await res.json();

            setSyncStates((prev) => ({
              ...prev,
              [type]: {
                running: data.status === "running",
                status: data,
              },
            }));

            if (data.status !== "running") {
              clearInterval(intervals[type]);
            }
          } catch {
            // Continue polling
          }
        }, 1500);
      }
    }

    return () => {
      for (const id of Object.values(intervals)) {
        clearInterval(id);
      }
    };
  }, [syncStates]);

  async function handleSave() {
    setIsSaving(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/integrations/hubspot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            accessToken,
            ...(pipelineId ? { pipelineId } : {}),
          },
          enabled: true,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save configuration");
      }

      setTestResult({ success: true, message: "Configuration saved" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setTestResult({ success: false, message: msg });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Save first, then test
      await fetch("/api/integrations/hubspot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { accessToken },
          enabled: true,
        }),
      });

      const res = await fetch("/api/integrations/hubspot/test", {
        method: "POST",
      });
      const data = await res.json();

      if (data.success) {
        setTestResult({ success: true, message: data.message });
        setIsConnected(true);
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

  async function handleSync(type: "deals" | "companies" | "contacts") {
    // Save pipeline config before syncing deals
    if (type === "deals" && pipelineId) {
      await fetch("/api/integrations/hubspot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { accessToken, pipelineId },
          enabled: true,
        }),
      });
    }

    setSyncStates((prev) => ({
      ...prev,
      [type]: { running: true, status: null },
    }));

    try {
      const res = await fetch(`/api/sync/hubspot?type=${type}`, {
        method: "POST",
      });
      const data = await res.json();

      if (data.error) {
        setSyncStates((prev) => ({
          ...prev,
          [type]: {
            running: false,
            status: {
              importId: "",
              status: "failed",
              recordsFound: 0,
              recordsSynced: 0,
              recordsFailed: 0,
              currentStep: data.error,
            },
          },
        }));
        return;
      }

      setSyncStates((prev) => ({
        ...prev,
        [type]: {
          running: true,
          status: {
            importId: data.importId,
            status: "running",
            recordsFound: 0,
            recordsSynced: 0,
            recordsFailed: 0,
            currentStep: "Starting...",
          },
        },
      }));
    } catch {
      setSyncStates((prev) => ({
        ...prev,
        [type]: {
          running: false,
          status: {
            importId: "",
            status: "failed",
            recordsFound: 0,
            recordsSynced: 0,
            recordsFailed: 0,
            currentStep: "Failed to start sync",
          },
        },
      }));
    }
  }

  function renderSyncCard(
    type: "deals" | "companies" | "contacts",
    title: string,
    description: string
  ) {
    const state = syncStates[type];
    const { running, status } = state;
    const progressPercent =
      status && status.recordsFound > 0
        ? Math.round((status.recordsSynced / status.recordsFound) * 100)
        : 0;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
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
            onClick={() => handleSync(type)}
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
                Sync {title}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

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
          <h1 className="text-3xl font-bold">HubSpot Integration</h1>
          <p className="text-muted-foreground mt-1">
            Configure and sync deals, companies, and contacts from HubSpot.
          </p>
        </div>
      </div>

      {/* Connection Config */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>
            Enter your HubSpot private app access token. You can create one in
            HubSpot under Settings &gt; Integrations &gt; Private Apps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="access-token">Access Token</Label>
            <Input
              id="access-token"
              type="password"
              placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!accessToken || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!accessToken || isTesting}
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

      {/* Pipeline Selector */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Configuration</CardTitle>
            <CardDescription>
              Select a deal pipeline to sync. Leave blank to sync all pipelines.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline">Deal Pipeline</Label>
              <div className="flex items-center gap-3">
                <Select value={pipelineId} onValueChange={setPipelineId}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="All pipelines" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All pipelines</SelectItem>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadPipelines}
                  disabled={isLoadingPipelines}
                >
                  {isLoadingPipelines ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              size="sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Pipeline Selection"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sync Actions */}
      {isConnected && (
        <>
          <Separator />
          <div>
            <h2 className="text-xl font-semibold mb-4">Data Sync</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderSyncCard(
                "deals",
                "Deals",
                "Sync deal names, amounts, stages, and create client records"
              )}
              {renderSyncCard(
                "companies",
                "Companies",
                "Sync company names, industries, domains, and create aliases"
              )}
              {renderSyncCard(
                "contacts",
                "Contacts",
                "Log contacts linked to companies (full linking in Phase 2)"
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
