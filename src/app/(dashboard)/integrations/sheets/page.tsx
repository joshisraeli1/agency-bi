"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Eye,
} from "lucide-react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncStatus {
  importId: string;
  status: "running" | "completed" | "failed";
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  currentStep: string;
  errors: string[];
}

type TabKey = "salary" | "clients" | "costs" | "client-match" | "packages";

const TAB_META: Record<TabKey, { tabName: string; description: string }> = {
  salary: {
    tabName: "4.3 Salary Data",
    description: "Team member salary, hourly rates, and employment details",
  },
  clients: {
    tabName: "4.2 Client Data",
    description: "Client retainer values, packages, and deal stages",
  },
  costs: {
    tabName: "4.4 Segmented Cost Data",
    description: "Monthly segmented cost data per client",
  },
  "client-match": {
    tabName: "5.3 Client Match",
    description: "Client name mappings between Monday.com and HubSpot",
  },
  packages: {
    tabName: "5.2 Package Lookup",
    description: "Package tier definitions with hours and rates",
  },
};

const TAB_ORDER: TabKey[] = ["salary", "clients", "costs", "client-match", "packages"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SheetsIntegrationPage() {
  // Config state
  const [serviceAccountEmail, setServiceAccountEmail] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [availableTabs, setAvailableTabs] = useState<string[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Sync state: per-tab import IDs and statuses
  const [syncImports, setSyncImports] = useState<Record<TabKey, string | null>>({
    salary: null,
    clients: null,
    costs: null,
    "client-match": null,
    packages: null,
  });
  const [syncStatuses, setSyncStatuses] = useState<Record<TabKey, SyncStatus | null>>({
    salary: null,
    clients: null,
    costs: null,
    "client-match": null,
    packages: null,
  });
  const [syncingAll, setSyncingAll] = useState(false);

  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // ---------------------------------------------------------------------------
  // Load existing config on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/integrations/sheets");
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            setServiceAccountEmail(data.config.serviceAccountEmail ?? "");
            // Private key is masked, so don't set it — user needs to re-enter
            setSheetId(data.config.sheetId ?? "");
          }
        }
      } catch {
        // Config not found — that's fine, user will set it up
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // Cleanup polling on unmount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      for (const interval of Object.values(pollingRef.current)) {
        clearInterval(interval);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Save config
  // ---------------------------------------------------------------------------

  async function saveConfig() {
    setSaving(true);
    try {
      // Ensure the integration record exists
      await fetch("/api/integrations/sheets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          config: {
            serviceAccountEmail,
            ...(privateKey ? { privateKey } : {}),
            sheetId,
          },
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Test connection
  // ---------------------------------------------------------------------------

  async function handleTestConnection() {
    setTesting(true);
    setTestError(null);
    setAvailableTabs(null);

    // Save first
    await saveConfig();

    try {
      const res = await fetch("/api/integrations/sheets/test", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setAvailableTabs(data.tabs ?? []);
      } else {
        setTestError(data.error ?? "Connection test failed");
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Poll sync status
  // ---------------------------------------------------------------------------

  const startPolling = useCallback((tab: TabKey, importId: string) => {
    // Clear existing poll for this tab
    if (pollingRef.current[tab]) {
      clearInterval(pollingRef.current[tab]);
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/sync/sheets/status?importId=${importId}`);
        if (res.ok) {
          const data: SyncStatus = await res.json();
          setSyncStatuses((prev) => ({ ...prev, [tab]: data }));

          if (data.status === "completed" || data.status === "failed") {
            clearInterval(pollingRef.current[tab]);
            delete pollingRef.current[tab];
          }
        }
      } catch {
        // Polling error, will retry next interval
      }
    };

    // Initial poll
    poll();
    pollingRef.current[tab] = setInterval(poll, 1500);
  }, []);

  // ---------------------------------------------------------------------------
  // Sync single tab
  // ---------------------------------------------------------------------------

  async function handleSync(tab: TabKey) {
    // Save config first
    await saveConfig();

    try {
      const res = await fetch(`/api/sync/sheets?tab=${tab}`, { method: "POST" });
      const data = await res.json();

      if (data.error) {
        setSyncStatuses((prev) => ({
          ...prev,
          [tab]: {
            importId: "",
            status: "failed" as const,
            recordsFound: 0,
            recordsSynced: 0,
            recordsFailed: 0,
            currentStep: "Failed to start",
            errors: [data.error],
          },
        }));
        return;
      }

      const importId = data.importId;
      setSyncImports((prev) => ({ ...prev, [tab]: importId }));
      startPolling(tab, importId);
    } catch (err) {
      setSyncStatuses((prev) => ({
        ...prev,
        [tab]: {
          importId: "",
          status: "failed" as const,
          recordsFound: 0,
          recordsSynced: 0,
          recordsFailed: 0,
          currentStep: "Request failed",
          errors: [err instanceof Error ? err.message : "Unknown error"],
        },
      }));
    }
  }

  // ---------------------------------------------------------------------------
  // Sync all tabs
  // ---------------------------------------------------------------------------

  async function handleSyncAll() {
    setSyncingAll(true);

    // Save config first
    await saveConfig();

    try {
      const res = await fetch("/api/sync/sheets?tab=all", { method: "POST" });
      const data = await res.json();

      if (data.error) {
        setSyncingAll(false);
        return;
      }

      if (data.importIds) {
        const importIds: string[] = data.importIds;
        TAB_ORDER.forEach((tab, idx) => {
          if (importIds[idx]) {
            setSyncImports((prev) => ({ ...prev, [tab]: importIds[idx] }));
            startPolling(tab, importIds[idx]);
          }
        });
      }
    } catch {
      // Error starting sync all
    } finally {
      setSyncingAll(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function isTabSyncing(tab: TabKey): boolean {
    const status = syncStatuses[tab];
    return !!status && status.status === "running";
  }

  function isAnySyncing(): boolean {
    return TAB_ORDER.some(isTabSyncing);
  }

  function getProgressPercent(status: SyncStatus | null): number {
    if (!status || status.recordsFound === 0) return 0;
    return Math.round(
      ((status.recordsSynced + status.recordsFailed) / status.recordsFound) * 100
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (configLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/integrations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2.5">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Google Sheets Integration</h1>
            <p className="text-sm text-muted-foreground">
              Connect to the efficiency spreadsheet for salary, client, and cost data.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>
            Configure your Google service account credentials and spreadsheet ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-email">Service Account Email</Label>
            <Input
              id="service-email"
              type="email"
              placeholder="myproject@myproject-123456.iam.gserviceaccount.com"
              value={serviceAccountEmail}
              onChange={(e) => setServiceAccountEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="private-key">Private Key</Label>
            <Textarea
              id="private-key"
              placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
              rows={4}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Paste the private key from your service account JSON file. You can also paste the
              entire JSON file contents, and the key will be extracted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sheet-id">Spreadsheet ID</Label>
            <Input
              id="sheet-id"
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The ID from the spreadsheet URL: docs.google.com/spreadsheets/d/
              <strong>SPREADSHEET_ID</strong>/edit
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleTestConnection}
              disabled={testing || !serviceAccountEmail || !sheetId}
              variant="outline"
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview Tabs
                </>
              )}
            </Button>
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </div>

          {/* Test results */}
          {testError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mt-3">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{testError}</span>
              </div>
            </div>
          )}

          {availableTabs && (
            <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 p-3 mt-3">
              <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 mb-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Connection successful! Found {availableTabs.length} tab(s):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableTabs.map((tab) => (
                  <Badge key={tab} variant="secondary" className="text-xs">
                    {tab}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Sync Tabs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Data Sync</h2>
            <p className="text-sm text-muted-foreground">
              Sync data from individual sheet tabs or run all at once.
            </p>
          </div>
          <Button
            onClick={handleSyncAll}
            disabled={syncingAll || isAnySyncing() || !sheetId}
          >
            {syncingAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync All
              </>
            )}
          </Button>
        </div>

        {TAB_ORDER.map((tabKey) => {
          const meta = TAB_META[tabKey];
          const status = syncStatuses[tabKey];
          const syncing = isTabSyncing(tabKey);
          const progress = getProgressPercent(status);

          return (
            <Card key={tabKey}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-sm">{meta.tabName}</h3>
                      {status?.status === "completed" && (
                        <Badge variant="default" className="text-xs">
                          Completed
                        </Badge>
                      )}
                      {status?.status === "failed" && (
                        <Badge variant="destructive" className="text-xs">
                          Failed
                        </Badge>
                      )}
                      {syncing && (
                        <Badge variant="secondary" className="text-xs">
                          Syncing
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>

                    {/* Progress bar */}
                    {status && (
                      <div className="mt-3 space-y-1.5">
                        <Progress value={progress} className="h-1.5" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{status.currentStep}</span>
                          <span>
                            {status.recordsSynced}/{status.recordsFound} synced
                            {status.recordsFailed > 0 && (
                              <span className="text-destructive">
                                {" "}({status.recordsFailed} failed)
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Errors */}
                        {status.errors.length > 0 && status.status !== "running" && (
                          <div className="mt-2 rounded-md bg-destructive/5 border border-destructive/10 p-2">
                            <p className="text-xs font-medium text-destructive mb-1">
                              Errors ({status.errors.length}):
                            </p>
                            <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-auto">
                              {status.errors.slice(0, 5).map((error, i) => (
                                <li key={i} className="truncate">
                                  {error}
                                </li>
                              ))}
                              {status.errors.length > 5 && (
                                <li className="text-muted-foreground/70">
                                  ...and {status.errors.length - 5} more
                                </li>
                              )}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(tabKey)}
                    disabled={syncing || isAnySyncing() || !sheetId}
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Syncing
                      </>
                    ) : (
                      "Sync"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
