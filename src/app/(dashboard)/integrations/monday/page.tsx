"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plug,
  LayoutGrid,
  Clock,
  Film,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Board {
  id: string;
  name: string;
}

interface Column {
  id: string;
  title: string;
  type: string;
}

interface SyncStatus {
  importId: string;
  status: "running" | "completed" | "failed";
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  currentStep?: string;
}

interface ConnectionResult {
  success: boolean;
  accountName?: string;
  error?: string;
}

interface ConfigData {
  provider: string;
  enabled: boolean;
  config: {
    apiToken?: string;
    boardIds?: { timeTracking: string[]; creatives: string[] };
    columnMappings?: Record<string, Record<string, string>>;
  };
  lastSyncAt?: string;
  lastSyncStatus?: string;
}

// Column mapping field definitions for time tracking boards
const TIME_TRACKING_FIELDS = [
  { key: "timeTracking", label: "Time Tracking", type: "time_tracking" },
  { key: "people", label: "Person / Assignee", type: "people" },
  { key: "date", label: "Date", type: "date" },
  { key: "status", label: "Status", type: "status" },
] as const;

// Column mapping field definitions for creatives boards
const CREATIVES_FIELDS = [
  { key: "status", label: "Status", type: "status" },
  { key: "dueDate", label: "Due Date", type: "date" },
  { key: "people", label: "Main Assignee", type: "people" },
  { key: "revisionCount", label: "Revision Count", type: "numbers" },
  { key: "editor", label: "Editor", type: "people" },
  { key: "animator", label: "Animator", type: "people" },
  { key: "designer", label: "Designer", type: "people" },
  { key: "reviewer", label: "Reviewer", type: "people" },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MondayIntegrationPage() {
  // Connection state
  const [apiToken, setApiToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "testing" | "connected" | "error"
  >("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [savingToken, setSavingToken] = useState(false);

  // Board state
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);

  // Selected boards
  const [timeTrackingBoards, setTimeTrackingBoards] = useState<string[]>([]);
  const [creativesBoards, setCreativesBoards] = useState<string[]>([]);

  // Column state per board
  const [boardColumns, setBoardColumns] = useState<Record<string, Column[]>>({});
  const [columnMappings, setColumnMappings] = useState<
    Record<string, Record<string, string>>
  >({});

  // Sync state
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});
  const [syncingType, setSyncingType] = useState<string | null>(null);

  // Config loading
  const [configLoaded, setConfigLoaded] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load existing config on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/integrations/monday");
        if (res.ok) {
          const data: ConfigData = await res.json();
          if (data.config.apiToken) {
            setApiToken(data.config.apiToken);
            setTokenSaved(true);
            setConnectionStatus("connected");
          }
          if (data.config.boardIds) {
            setTimeTrackingBoards(data.config.boardIds.timeTracking ?? []);
            setCreativesBoards(data.config.boardIds.creatives ?? []);
          }
          if (data.config.columnMappings) {
            setColumnMappings(data.config.columnMappings);
          }
          if (data.lastSyncAt) {
            setLastSyncAt(data.lastSyncAt);
          }
          if (data.lastSyncStatus) {
            setLastSyncStatus(data.lastSyncStatus);
          }
        }
      } catch {
        // Config does not exist yet, that is fine
      }
      setConfigLoaded(true);
    }
    loadConfig();
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch boards when connected
  // ---------------------------------------------------------------------------

  const fetchBoardsList = useCallback(async () => {
    setLoadingBoards(true);
    try {
      const res = await fetch("/api/integrations/monday/boards");
      if (res.ok) {
        const data = await res.json();
        setBoards(data.boards ?? []);
      }
    } catch {
      // Silently fail
    }
    setLoadingBoards(false);
  }, []);

  useEffect(() => {
    if (connectionStatus === "connected" && boards.length === 0) {
      fetchBoardsList();
    }
  }, [connectionStatus, boards.length, fetchBoardsList]);

  // ---------------------------------------------------------------------------
  // Fetch columns when a board is selected
  // ---------------------------------------------------------------------------

  const fetchColumnsForBoard = useCallback(
    async (boardId: string) => {
      if (boardColumns[boardId]) return; // already loaded
      try {
        const res = await fetch(
          `/api/integrations/monday/boards?boardId=${boardId}`
        );
        if (res.ok) {
          const data = await res.json();
          setBoardColumns((prev) => ({ ...prev, [boardId]: data.columns ?? [] }));
        }
      } catch {
        // Silently fail
      }
    },
    [boardColumns]
  );

  useEffect(() => {
    const allSelected = [...timeTrackingBoards, ...creativesBoards];
    for (const boardId of allSelected) {
      fetchColumnsForBoard(boardId);
    }
  }, [timeTrackingBoards, creativesBoards, fetchColumnsForBoard]);

  // ---------------------------------------------------------------------------
  // Save API token
  // ---------------------------------------------------------------------------

  async function handleSaveToken() {
    if (!apiToken.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch("/api/integrations/monday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { apiToken: apiToken.trim() },
          enabled: true,
        }),
      });
      if (res.ok) {
        setTokenSaved(true);
      }
    } catch {
      // Error saving
    }
    setSavingToken(false);
  }

  // ---------------------------------------------------------------------------
  // Test connection
  // ---------------------------------------------------------------------------

  async function handleTestConnection() {
    setConnectionStatus("testing");
    setConnectionMessage("");
    try {
      const res = await fetch("/api/integrations/monday/test", {
        method: "POST",
      });
      const data: ConnectionResult = await res.json();
      if (data.success) {
        setConnectionStatus("connected");
        setConnectionMessage(
          data.accountName
            ? `Connected to ${data.accountName}`
            : "Connection successful"
        );
      } else {
        setConnectionStatus("error");
        setConnectionMessage(data.error ?? "Connection failed");
      }
    } catch (err) {
      setConnectionStatus("error");
      setConnectionMessage(
        err instanceof Error ? err.message : "Connection failed"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Save board selection & column mappings
  // ---------------------------------------------------------------------------

  async function handleSaveBoardConfig() {
    try {
      await fetch("/api/integrations/monday", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            boardIds: {
              timeTracking: timeTrackingBoards,
              creatives: creativesBoards,
            },
            columnMappings,
          },
        }),
      });
    } catch {
      // Error saving
    }
  }

  // ---------------------------------------------------------------------------
  // Board selection helpers
  // ---------------------------------------------------------------------------

  function toggleBoard(
    boardId: string,
    list: string[],
    setList: (v: string[]) => void
  ) {
    if (list.includes(boardId)) {
      setList(list.filter((id) => id !== boardId));
    } else {
      setList([...list, boardId]);
    }
  }

  function updateColumnMapping(boardId: string, field: string, columnId: string) {
    setColumnMappings((prev) => ({
      ...prev,
      [boardId]: {
        ...(prev[boardId] ?? {}),
        [field]: columnId,
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Sync triggers
  // ---------------------------------------------------------------------------

  async function handleSync(type: "time_tracking" | "creatives") {
    // Save config first
    await handleSaveBoardConfig();

    setSyncingType(type);
    try {
      const res = await fetch(`/api/sync/monday?type=${type}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setSyncStatus((prev) => ({
          ...prev,
          [type]: {
            importId: "",
            status: "failed",
            recordsFound: 0,
            recordsSynced: 0,
            recordsFailed: 0,
            currentStep: data.error ?? "Failed to start sync",
          },
        }));
        setSyncingType(null);
        return;
      }

      const { importId } = await res.json();
      setSyncStatus((prev) => ({
        ...prev,
        [type]: {
          importId,
          status: "running",
          recordsFound: 0,
          recordsSynced: 0,
          recordsFailed: 0,
          currentStep: "Starting...",
        },
      }));

      // Start polling
      pollSyncStatus(type, importId);
    } catch {
      setSyncingType(null);
    }
  }

  function pollSyncStatus(type: string, importId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/sync/monday/status?importId=${importId}`
        );
        if (!res.ok) {
          clearInterval(interval);
          setSyncingType(null);
          return;
        }

        const data: SyncStatus = await res.json();
        setSyncStatus((prev) => ({ ...prev, [type]: data }));

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          setSyncingType(null);
          // Refresh last sync info
          setLastSyncAt(new Date().toISOString());
          setLastSyncStatus(
            data.status === "completed" && data.recordsFailed === 0
              ? "success"
              : data.status === "completed"
                ? "partial"
                : "failed"
          );
        }
      } catch {
        clearInterval(interval);
        setSyncingType(null);
      }
    }, 1500);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderSyncStatusBadge() {
    if (!lastSyncStatus) return null;
    const variant =
      lastSyncStatus === "success"
        ? "default"
        : lastSyncStatus === "partial"
          ? "secondary"
          : "destructive";
    return (
      <Badge variant={variant}>
        {lastSyncStatus === "success"
          ? "Last sync: Success"
          : lastSyncStatus === "partial"
            ? "Last sync: Partial"
            : "Last sync: Failed"}
      </Badge>
    );
  }

  function renderSyncProgress(type: string) {
    const status = syncStatus[type];
    if (!status) return null;

    const total = status.recordsFound || 1;
    const done = status.recordsSynced + status.recordsFailed;
    const pct = Math.min(100, Math.round((done / total) * 100));

    return (
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {status.currentStep ?? "Processing..."}
          </span>
          <span>
            {status.recordsSynced} synced
            {status.recordsFailed > 0 && (
              <span className="text-destructive ml-2">
                {status.recordsFailed} failed
              </span>
            )}
          </span>
        </div>
        <Progress value={status.status === "completed" ? 100 : pct} />
        {status.status === "completed" && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="size-4" />
            Sync completed
          </div>
        )}
        {status.status === "failed" && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="size-4" />
            Sync failed
          </div>
        )}
      </div>
    );
  }

  function renderColumnMapper(boardId: string, fields: ReadonlyArray<{ key: string; label: string; type: string }>) {
    const columns = boardColumns[boardId];
    if (!columns) {
      return (
        <p className="text-muted-foreground text-sm">Loading columns...</p>
      );
    }

    const currentMappings = columnMappings[boardId] ?? {};

    return (
      <div className="space-y-3">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center gap-4">
            <Label className="w-40 shrink-0 text-sm">{field.label}</Label>
            <Select
              value={currentMappings[field.key] ?? ""}
              onValueChange={(value) =>
                updateColumnMapping(boardId, field.key, value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select column..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">-- None --</SelectItem>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.title}{" "}
                    <span className="text-muted-foreground text-xs">
                      ({col.type})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  if (!configLoaded) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Monday.com Integration
          </h1>
          <p className="text-muted-foreground text-sm">
            Connect your Monday.com workspace to sync time tracking and
            deliverables data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {renderSyncStatusBadge()}
          {lastSyncAt && (
            <span className="text-muted-foreground text-xs">
              {new Date(lastSyncAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* API Token Card                                                      */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-5" />
            API Connection
          </CardTitle>
          <CardDescription>
            Enter your Monday.com API token. You can find it in your Monday.com
            profile under Admin &gt; API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="api-token" className="sr-only">
                API Token
              </Label>
              <Input
                id="api-token"
                type="password"
                placeholder="Enter your Monday.com API token"
                value={apiToken}
                onChange={(e) => {
                  setApiToken(e.target.value);
                  setTokenSaved(false);
                }}
              />
            </div>
            <Button
              onClick={handleSaveToken}
              disabled={savingToken || !apiToken.trim()}
            >
              {savingToken ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Save Token
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!tokenSaved || connectionStatus === "testing"}
            >
              {connectionStatus === "testing" ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Test Connection
            </Button>

            {connectionStatus === "connected" && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="size-4" />
                {connectionMessage || "Connected"}
              </div>
            )}
            {connectionStatus === "error" && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="size-4" />
                {connectionMessage || "Connection failed"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Board Selection Card                                                */}
      {/* ------------------------------------------------------------------ */}
      {connectionStatus === "connected" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <LayoutGrid className="size-5" />
                  Board Selection
                </CardTitle>
                <CardDescription>
                  Select which Monday.com boards to use for each data type.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchBoardsList}
                disabled={loadingBoards}
              >
                <RefreshCw
                  className={`mr-1 size-4 ${loadingBoards ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingBoards && boards.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading boards...
              </div>
            ) : boards.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No boards found. Make sure your API token has access to your
                workspace boards.
              </p>
            ) : (
              <>
                {/* Time Tracking Boards */}
                <div className="space-y-3">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Clock className="size-4" />
                    Time Tracking Boards
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Select boards that contain time tracking data for team
                    members.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {boards.map((board) => (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() =>
                          toggleBoard(
                            board.id,
                            timeTrackingBoards,
                            setTimeTrackingBoards
                          )
                        }
                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          timeTrackingBoards.includes(board.id)
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        {board.name}
                        {timeTrackingBoards.includes(board.id) && (
                          <Badge className="ml-2" variant="default">
                            Selected
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Creatives Boards */}
                <div className="space-y-3">
                  <Label className="text-base font-medium flex items-center gap-2">
                    <Film className="size-4" />
                    Creatives / Deliverables Boards
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Select boards that track creative deliverables (edits,
                    animations, etc).
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {boards.map((board) => (
                      <button
                        key={board.id}
                        type="button"
                        onClick={() =>
                          toggleBoard(
                            board.id,
                            creativesBoards,
                            setCreativesBoards
                          )
                        }
                        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          creativesBoards.includes(board.id)
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-border hover:bg-accent"
                        }`}
                      >
                        {board.name}
                        {creativesBoards.includes(board.id) && (
                          <Badge className="ml-2" variant="default">
                            Selected
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleSaveBoardConfig}>
                  Save Board Selection
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Column Mapping Cards                                                */}
      {/* ------------------------------------------------------------------ */}
      {timeTrackingBoards.map((boardId) => {
        const board = boards.find((b) => b.id === boardId);
        return (
          <Card key={`tt-map-${boardId}`}>
            <CardHeader>
              <CardTitle className="text-base">
                Column Mapping: {board?.name ?? boardId}
              </CardTitle>
              <CardDescription>
                Map Monday.com columns to time tracking fields.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderColumnMapper(boardId, TIME_TRACKING_FIELDS)}
            </CardContent>
          </Card>
        );
      })}

      {creativesBoards.map((boardId) => {
        const board = boards.find((b) => b.id === boardId);
        return (
          <Card key={`cr-map-${boardId}`}>
            <CardHeader>
              <CardTitle className="text-base">
                Column Mapping: {board?.name ?? boardId}
              </CardTitle>
              <CardDescription>
                Map Monday.com columns to deliverable fields.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderColumnMapper(boardId, CREATIVES_FIELDS)}
            </CardContent>
          </Card>
        );
      })}

      {/* ------------------------------------------------------------------ */}
      {/* Sync Actions Card                                                   */}
      {/* ------------------------------------------------------------------ */}
      {connectionStatus === "connected" &&
        (timeTrackingBoards.length > 0 || creativesBoards.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-5" />
                Sync Data
              </CardTitle>
              <CardDescription>
                Trigger a full sync from Monday.com. This will fetch all items
                from the selected boards and create or update records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Time Tracking Sync */}
              {timeTrackingBoards.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Sync Time Tracking</p>
                      <p className="text-muted-foreground text-xs">
                        {timeTrackingBoards.length} board
                        {timeTrackingBoards.length !== 1 ? "s" : ""} selected
                      </p>
                    </div>
                    <Button
                      onClick={() => handleSync("time_tracking")}
                      disabled={syncingType !== null}
                    >
                      {syncingType === "time_tracking" ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Clock className="mr-2 size-4" />
                      )}
                      Sync Time Tracking
                    </Button>
                  </div>
                  {renderSyncProgress("time_tracking")}
                </div>
              )}

              {/* Creatives Sync */}
              {creativesBoards.length > 0 && (
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Sync Deliverables</p>
                      <p className="text-muted-foreground text-xs">
                        {creativesBoards.length} board
                        {creativesBoards.length !== 1 ? "s" : ""} selected
                      </p>
                    </div>
                    <Button
                      onClick={() => handleSync("creatives")}
                      disabled={syncingType !== null}
                    >
                      {syncingType === "creatives" ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Film className="mr-2 size-4" />
                      )}
                      Sync Deliverables
                    </Button>
                  </div>
                  {renderSyncProgress("creatives")}
                </div>
              )}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
