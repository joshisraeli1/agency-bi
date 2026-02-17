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
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface SlackChannel {
  id: string;
  name: string;
  is_member: boolean;
  num_members: number;
}

interface SyncStatus {
  importId: string;
  status: "running" | "completed" | "failed";
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  currentStep?: string;
}

export default function SlackIntegrationPage() {
  const [botToken, setBotToken] = useState("");
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [availableChannels, setAvailableChannels] = useState<SlackChannel[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Sync state for each type
  const [syncStates, setSyncStates] = useState<
    Record<string, { running: boolean; status: SyncStatus | null }>
  >({
    messages: { running: false, status: null },
    users: { running: false, status: null },
  });

  // Load existing config on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        const res = await fetch("/api/integrations/slack");
        if (!res.ok) return;
        const data = await res.json();

        if (data.config?.botToken) {
          setBotToken(data.config.botToken);
          setIsConnected(data.enabled);
        }
        if (data.config?.channelIds) {
          setChannelIds(data.config.channelIds);
        }
        setConfigLoaded(true);
      } catch {
        setConfigLoaded(true);
      }
    }
    loadConfig();
  }, []);

  // Load channels after connection is established
  const loadChannels = useCallback(async () => {
    setIsLoadingChannels(true);
    try {
      // We need to save first so the token is stored, then fetch channels
      // For now, use the test endpoint to verify, then load channels from config
      const res = await fetch("/api/integrations/slack");
      if (res.ok) {
        const data = await res.json();
        if (data.config?.availableChannels) {
          setAvailableChannels(data.config.availableChannels);
        }
      }
    } catch {
      // Channels will remain empty
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected && configLoaded) {
      loadChannels();
    }
  }, [isConnected, configLoaded, loadChannels]);

  // Poll sync status
  useEffect(() => {
    const intervals: Record<string, ReturnType<typeof setInterval>> = {};

    for (const type of ["messages", "users"]) {
      const state = syncStates[type];
      if (state.running && state.status?.importId) {
        intervals[type] = setInterval(async () => {
          try {
            const res = await fetch(
              `/api/sync/slack/status?importId=${state.status!.importId}`
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
      const res = await fetch("/api/integrations/slack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            botToken,
            channelIds,
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
      await fetch("/api/integrations/slack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { botToken, channelIds },
          enabled: true,
        }),
      });

      const res = await fetch("/api/integrations/slack/test", {
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

  function toggleChannel(channelId: string) {
    setChannelIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  }

  async function handleSync(type: "messages" | "users") {
    // Save channel config before syncing
    if (type === "messages") {
      await fetch("/api/integrations/slack", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { botToken, channelIds },
          enabled: true,
        }),
      });
    }

    setSyncStates((prev) => ({
      ...prev,
      [type]: { running: true, status: null },
    }));

    try {
      const res = await fetch(`/api/sync/slack?type=${type}`, {
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
    type: "messages" | "users",
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
          <h1 className="text-3xl font-bold">Slack Integration</h1>
          <p className="text-muted-foreground mt-1">
            Configure and sync messages and users from Slack.
          </p>
        </div>
      </div>

      {/* Connection Config */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>
            Enter your Slack bot token. You can create one at{" "}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              api.slack.com/apps
            </a>
            . Required scopes: channels:history, channels:read, groups:read,
            users:read, users:read.email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bot-token">Bot Token</Label>
            <Input
              id="bot-token"
              type="password"
              placeholder="xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!botToken || isSaving}>
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
              disabled={!botToken || isTesting}
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

      {/* Channel Selector */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Channel Configuration</CardTitle>
            <CardDescription>
              Select the channels to sync messages from. You can also type
              channel IDs directly if they do not appear in the list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {availableChannels.length > 0 && (
              <div className="space-y-2">
                <Label>Available Channels</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {availableChannels.map((channel) => (
                    <label
                      key={channel.id}
                      className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={channelIds.includes(channel.id)}
                        onChange={() => toggleChannel(channel.id)}
                        className="rounded"
                      />
                      <span className="text-sm">#{channel.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {channel.num_members} members
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="channel-ids">Channel IDs (comma-separated)</Label>
              <Input
                id="channel-ids"
                placeholder="C01XXXXXXXX, C02XXXXXXXX"
                value={channelIds.join(", ")}
                onChange={(e) =>
                  setChannelIds(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  )
                }
              />
            </div>

            <div className="flex items-center gap-3">
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
                  "Save Channel Selection"
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={loadChannels}
                disabled={isLoadingChannels}
              >
                {isLoadingChannels ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Actions */}
      {isConnected && (
        <>
          <Separator />
          <div>
            <h2 className="text-xl font-semibold mb-4">Data Sync</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {renderSyncCard(
                "messages",
                "Messages",
                "Sync channel messages and match to clients as communication logs"
              )}
              {renderSyncCard(
                "users",
                "Users",
                "Sync Slack users and link to team members"
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
