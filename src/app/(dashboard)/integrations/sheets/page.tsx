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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Search,
  Save,
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

interface DiscoveredTab {
  name: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
  error?: string;
}

// Config key that maps to the tabMappings field in SheetsConfig
const TAB_CONFIG_KEYS: Record<TabKey, string> = {
  salary: "salary",
  clients: "clients",
  costs: "costs",
  "client-match": "clientMatch",
  packages: "packages",
};

const TAB_META: Record<TabKey, { description: string; expectedHeaders: string[] }> = {
  salary: {
    description: "Team member salary, hourly rates, and employment details",
    expectedHeaders: ["name", "email", "role", "division", "salary", "hourly rate"],
  },
  clients: {
    description: "Client retainer values, packages, and deal stages",
    expectedHeaders: ["client name", "retainer value", "deal stage", "status", "package"],
  },
  costs: {
    description: "Monthly segmented cost data per client",
    expectedHeaders: ["client name", "month", "cost", "hours", "category"],
  },
  "client-match": {
    description: "Client name mappings across platforms",
    expectedHeaders: ["monday name", "hubspot name", "canonical name"],
  },
  packages: {
    description: "Package tier definitions with hours and rates",
    expectedHeaders: ["package name", "tier", "hours included", "monthly rate"],
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

  // Discovery state
  const [discovering, setDiscovering] = useState(false);
  const [discoveredTabs, setDiscoveredTabs] = useState<DiscoveredTab[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Tab mapping: maps our data type keys to the actual tab names in the spreadsheet
  const [tabMappings, setTabMappings] = useState<Record<string, string>>({});
  const [mappingsSaved, setMappingsSaved] = useState(false);

  // Preview state: which tab is expanded for preview
  const [previewTab, setPreviewTab] = useState<TabKey | null>(null);

  // Sync state
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
            setSheetId(data.config.sheetId ?? "");
            if (data.config.tabMappings) {
              setTabMappings(data.config.tabMappings);
            }
          }
        }
      } catch {
        // Config not found
      } finally {
        setConfigLoading(false);
      }
    }
    loadConfig();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      for (const interval of Object.values(pollingRef.current)) {
        clearInterval(interval);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Save config (credentials + tab mappings)
  // ---------------------------------------------------------------------------

  async function saveConfig(extraConfig?: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch("/api/integrations/sheets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          config: {
            serviceAccountEmail,
            ...(privateKey ? { privateKey } : {}),
            sheetId,
            tabMappings,
            ...extraConfig,
          },
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Discover tabs (connect + inspect structure)
  // ---------------------------------------------------------------------------

  async function handleDiscover() {
    setDiscovering(true);
    setDiscoverError(null);
    setDiscoveredTabs(null);

    // Save credentials first
    await saveConfig();

    try {
      const res = await fetch("/api/integrations/sheets/discover", { method: "POST" });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setDiscoverError(data.error ?? "Discovery failed");
        return;
      }

      setDiscoveredTabs(data.tabs ?? []);

      // Load existing tab mappings if any
      if (data.tabMappings && Object.keys(data.tabMappings).length > 0) {
        setTabMappings(data.tabMappings);
      }
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save tab mappings
  // ---------------------------------------------------------------------------

  async function handleSaveMappings() {
    setMappingsSaved(false);
    await saveConfig({ tabMappings });
    setMappingsSaved(true);
    setTimeout(() => setMappingsSaved(false), 3000);
  }

  // ---------------------------------------------------------------------------
  // Sync
  // ---------------------------------------------------------------------------

  const startPolling = useCallback((tab: TabKey, importId: string) => {
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
        // Will retry
      }
    };

    poll();
    pollingRef.current[tab] = setInterval(poll, 1500);
  }, []);

  async function handleSync(tab: TabKey) {
    await saveConfig({ tabMappings });
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
      startPolling(tab, data.importId);
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

  async function handleSyncAll() {
    setSyncingAll(true);
    await saveConfig({ tabMappings });
    try {
      const res = await fetch("/api/sync/sheets?tab=all", { method: "POST" });
      const data = await res.json();
      if (data.importIds) {
        const importIds: string[] = data.importIds;
        TAB_ORDER.forEach((tab, idx) => {
          if (importIds[idx]) startPolling(tab, importIds[idx]);
        });
      }
    } catch {
      // Error
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

  function getMappedTabName(tabKey: TabKey): string | null {
    const configKey = TAB_CONFIG_KEYS[tabKey];
    return tabMappings[configKey] || null;
  }

  function getDiscoveredTabData(tabName: string): DiscoveredTab | null {
    return discoveredTabs?.find((t) => t.name === tabName) ?? null;
  }

  const mappedCount = TAB_ORDER.filter((k) => getMappedTabName(k)).length;
  const hasDiscoveredTabs = discoveredTabs && discoveredTabs.length > 0;

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
    <div className="space-y-6 max-w-4xl">
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
              Connect your spreadsheet, map tabs to data types, then sync.
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Connection Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold h-5 w-5">1</span>
            Connection Settings
          </CardTitle>
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
              Paste the private key from your service account JSON file, or the entire JSON contents.
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
              The ID from the spreadsheet URL: docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleDiscover}
              disabled={discovering || !serviceAccountEmail || !sheetId}
            >
              {discovering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discovering...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Discover Tabs
                </>
              )}
            </Button>
          </div>

          {discoverError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 mt-3">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>{discoverError}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Tab Mapping (only show after discovery) */}
      {hasDiscoveredTabs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold h-5 w-5">2</span>
              Map Your Tabs
            </CardTitle>
            <CardDescription>
              Found {discoveredTabs!.length} tab(s) in your spreadsheet. Map each data type to the correct tab.
              {mappedCount > 0 && (
                <span className="ml-1 font-medium text-foreground">
                  ({mappedCount}/{TAB_ORDER.length} mapped)
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Available tabs preview */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Available tabs in your spreadsheet:</Label>
              <div className="flex flex-wrap gap-1.5">
                {discoveredTabs!.map((tab) => (
                  <Badge key={tab.name} variant="secondary" className="text-xs">
                    {tab.name} ({tab.totalRows} rows)
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Mapping dropdowns */}
            <div className="space-y-4">
              {TAB_ORDER.map((tabKey) => {
                const meta = TAB_META[tabKey];
                const configKey = TAB_CONFIG_KEYS[tabKey];
                const mappedTab = tabMappings[configKey] || "";
                const tabData = mappedTab ? getDiscoveredTabData(mappedTab) : null;

                return (
                  <div key={tabKey} className="space-y-2">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <Label className="text-sm font-medium capitalize">
                          {tabKey.replace("-", " ")}
                        </Label>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Expected columns: {meta.expectedHeaders.join(", ")}
                        </p>
                      </div>
                      <Select
                        value={mappedTab}
                        onValueChange={(value) => {
                          setTabMappings((prev) => ({
                            ...prev,
                            [configKey]: value === "__none" ? "" : value,
                          }));
                          setMappingsSaved(false);
                        }}
                      >
                        <SelectTrigger className="w-[240px]">
                          <SelectValue placeholder="Select a tab..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">-- Skip --</SelectItem>
                          {discoveredTabs!.map((tab) => (
                            <SelectItem key={tab.name} value={tab.name}>
                              {tab.name} ({tab.totalRows} rows)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Header match indicator */}
                    {tabData && tabData.headers.length > 0 && (
                      <div className="ml-0 pl-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          <span className="text-xs text-muted-foreground">
                            Headers: {tabData.headers.slice(0, 8).join(", ")}
                            {tabData.headers.length > 8 && ` +${tabData.headers.length - 8} more`}
                          </span>
                        </div>

                        {/* Preview toggle */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-6 px-2"
                          onClick={() =>
                            setPreviewTab(previewTab === tabKey ? null : tabKey)
                          }
                        >
                          {previewTab === tabKey ? "Hide Preview" : "Show Preview"}
                        </Button>

                        {/* Sample data table */}
                        {previewTab === tabKey && tabData.sampleRows.length > 0 && (
                          <div className="mt-2 rounded-md border overflow-auto max-h-48">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {tabData.headers.map((h, i) => (
                                    <TableHead key={i} className="text-xs whitespace-nowrap py-1 px-2">
                                      {h}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {tabData.sampleRows.map((row, ri) => (
                                  <TableRow key={ri}>
                                    {tabData.headers.map((_, ci) => (
                                      <TableCell key={ci} className="text-xs py-1 px-2 whitespace-nowrap max-w-[200px] truncate">
                                        {row[ci] ?? ""}
                                      </TableCell>
                                    ))}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}

                    {tabKey !== TAB_ORDER[TAB_ORDER.length - 1] && <Separator className="mt-3" />}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSaveMappings} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Tab Mappings
                  </>
                )}
              </Button>
              {mappingsSaved && (
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved!
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Sync (only show when tabs are mapped) */}
      {mappedCount > 0 && (
        <>
          <Separator />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span className="flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold h-5 w-5">3</span>
                  Sync Data
                </h2>
                <p className="text-sm text-muted-foreground">
                  Sync mapped tabs. Only tabs with a mapping will be synced.
                </p>
              </div>
              <Button
                onClick={handleSyncAll}
                disabled={syncingAll || isAnySyncing() || mappedCount === 0}
              >
                {syncingAll ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync All ({mappedCount})
                  </>
                )}
              </Button>
            </div>

            {TAB_ORDER.map((tabKey) => {
              const mappedTabName = getMappedTabName(tabKey);
              if (!mappedTabName) return null;

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
                          <h3 className="font-medium text-sm">{mappedTabName}</h3>
                          <Badge variant="outline" className="text-xs capitalize">
                            {tabKey.replace("-", " ")}
                          </Badge>
                          {status?.status === "completed" && (
                            <Badge variant="default" className="text-xs">Completed</Badge>
                          )}
                          {status?.status === "failed" && (
                            <Badge variant="destructive" className="text-xs">Failed</Badge>
                          )}
                          {syncing && (
                            <Badge variant="secondary" className="text-xs">Syncing</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{meta.description}</p>

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

                            {status.errors.length > 0 && status.status !== "running" && (
                              <div className="mt-2 rounded-md bg-destructive/5 border border-destructive/10 p-2">
                                <p className="text-xs font-medium text-destructive mb-1">
                                  Errors ({status.errors.length}):
                                </p>
                                <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-auto">
                                  {status.errors.slice(0, 5).map((error, i) => (
                                    <li key={i} className="truncate">{error}</li>
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
                        disabled={syncing || isAnySyncing()}
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
        </>
      )}
    </div>
  );
}
