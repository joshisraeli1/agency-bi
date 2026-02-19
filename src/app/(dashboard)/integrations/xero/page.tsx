"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Search,
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

export default function XeroIntegrationPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveryData, setDiscoveryData] = useState<{
    organisation: { name: string };
    invoices: { total: number; samples: Array<{ id: string; number: string; contact: string; total: number; status: string; date: string; type: string }> };
    expenses: { total: number; samples: Array<{ id: string; contact: string; total: number; status: string; date: string }> };
  } | null>(null);

  // Sync state for each type
  const [syncStates, setSyncStates] = useState<
    Record<string, { running: boolean; status: SyncStatus | null }>
  >({
    invoices: { running: false, status: null },
    expenses: { running: false, status: null },
    contacts: { running: false, status: null },
  });

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");

    if (connected === "true") {
      setTestResult({ success: true, message: "Successfully connected to Xero" });
    } else if (error) {
      setTestResult({ success: false, message: error });
    }
  }, []);

  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/integrations/xero");
        if (!res.ok) return;
        const data = await res.json();

        if (data.config?.accessToken) {
          setIsConnected(data.enabled);
          if (data.config.tenantName) {
            setTenantName(data.config.tenantName);
          }
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
    const intervals: Record<string, ReturnType<typeof setInterval>> = {};

    for (const type of ["invoices", "expenses", "contacts"]) {
      const state = syncStates[type];
      if (state.running && state.status?.importId) {
        intervals[type] = setInterval(async () => {
          try {
            const res = await fetch(
              `/api/sync/xero/status?importId=${state.status!.importId}`
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

  async function handleConnect() {
    window.location.href = "/api/integrations/xero/auth";
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/integrations/xero/test", {
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

  async function handleDiscover() {
    setDiscovering(true);
    try {
      const res = await fetch("/api/integrations/xero/discover", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDiscoveryData(data);
        }
      }
    } catch {
      // Discovery failed
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSync(type: "invoices" | "expenses" | "contacts") {
    setSyncStates((prev) => ({
      ...prev,
      [type]: { running: true, status: null },
    }));

    try {
      const res = await fetch(`/api/sync/xero?type=${type}`, {
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
    type: "invoices" | "expenses" | "contacts",
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
          <h1 className="text-3xl font-bold">Xero Integration</h1>
          <p className="text-muted-foreground mt-1">
            Connect to Xero to sync invoices, expenses, and contacts.
          </p>
        </div>
      </div>

      {/* Connection Config */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>
            Connect your Xero account using OAuth. This will redirect you to
            Xero to authorize access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isConnected && tenantName && (
            <div className="flex items-center gap-2">
              <Badge className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Connected to {tenantName}
              </Badge>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleConnect}>
              <ExternalLink className="mr-2 h-4 w-4" />
              {isConnected ? "Reconnect to Xero" : "Connect to Xero"}
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

      {/* Data Preview */}
      {isConnected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Data Preview</CardTitle>
                <CardDescription>
                  Preview your Xero data before syncing to verify the structure looks correct.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                onClick={handleDiscover}
                disabled={discovering}
              >
                {discovering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Preview Data
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          {discoveryData && (
            <CardContent className="space-y-6">
              {/* Invoices preview */}
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Invoices ({discoveryData.invoices.total} sampled)
                </h3>
                {discoveryData.invoices.samples.length > 0 ? (
                  <div className="rounded-md border overflow-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-1 px-2">Number</TableHead>
                          <TableHead className="text-xs py-1 px-2">Contact</TableHead>
                          <TableHead className="text-xs py-1 px-2">Total</TableHead>
                          <TableHead className="text-xs py-1 px-2">Status</TableHead>
                          <TableHead className="text-xs py-1 px-2">Date</TableHead>
                          <TableHead className="text-xs py-1 px-2">Type</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discoveryData.invoices.samples.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="text-xs py-1 px-2">{inv.number || "-"}</TableCell>
                            <TableCell className="text-xs py-1 px-2">{inv.contact || "-"}</TableCell>
                            <TableCell className="text-xs py-1 px-2">${Number(inv.total).toLocaleString()}</TableCell>
                            <TableCell className="text-xs py-1 px-2">{inv.status}</TableCell>
                            <TableCell className="text-xs py-1 px-2">{inv.date || "-"}</TableCell>
                            <TableCell className="text-xs py-1 px-2">{inv.type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No invoices found</p>
                )}
              </div>

              {/* Expenses preview */}
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Expenses ({discoveryData.expenses.total} sampled)
                </h3>
                {discoveryData.expenses.samples.length > 0 ? (
                  <div className="rounded-md border overflow-auto max-h-48">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs py-1 px-2">Contact</TableHead>
                          <TableHead className="text-xs py-1 px-2">Total</TableHead>
                          <TableHead className="text-xs py-1 px-2">Status</TableHead>
                          <TableHead className="text-xs py-1 px-2">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discoveryData.expenses.samples.map((exp) => (
                          <TableRow key={exp.id}>
                            <TableCell className="text-xs py-1 px-2">{exp.contact || "-"}</TableCell>
                            <TableCell className="text-xs py-1 px-2">${Number(exp.total).toLocaleString()}</TableCell>
                            <TableCell className="text-xs py-1 px-2">{exp.status}</TableCell>
                            <TableCell className="text-xs py-1 px-2">{exp.date || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No expenses found</p>
                )}
              </div>
            </CardContent>
          )}
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
                "invoices",
                "Invoices",
                "Sync accounts receivable invoices into financial records"
              )}
              {renderSyncCard(
                "expenses",
                "Expenses",
                "Sync bank transaction expenses into financial records"
              )}
              {renderSyncCard(
                "contacts",
                "Contacts",
                "Sync Xero contacts and create client records"
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
