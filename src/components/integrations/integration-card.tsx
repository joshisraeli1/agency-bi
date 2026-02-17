"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  Calendar,
  FileSpreadsheet,
  Hash,
  Mail,
  MessageSquare,
  Receipt,
  Trello,
  Plug,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  monday: Trello,
  hubspot: Hash,
  sheets: FileSpreadsheet,
  xero: Receipt,
  slack: MessageSquare,
  gmail: Mail,
  calendar: Calendar,
};

interface IntegrationCardProps {
  provider: string;
  name: string;
  description: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  configUrl: string;
  disabled?: boolean;
}

export function IntegrationCard({
  provider,
  name,
  description,
  enabled,
  lastSyncAt,
  lastSyncStatus,
  configUrl,
  disabled = false,
}: IntegrationCardProps) {
  const Icon = iconMap[provider] || Plug;

  return (
    <Card className={disabled ? "opacity-50" : undefined}>
      <CardHeader className="flex flex-row items-start gap-4 space-y-0">
        <div className="rounded-lg bg-muted p-2.5">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{name}</CardTitle>
            {disabled ? (
              <Badge variant="outline">Coming Soon</Badge>
            ) : enabled ? (
              <Badge
                variant={
                  lastSyncStatus === "success"
                    ? "default"
                    : lastSyncStatus === "failed"
                    ? "destructive"
                    : "secondary"
                }
              >
                {lastSyncStatus === "success"
                  ? "Connected"
                  : lastSyncStatus === "failed"
                  ? "Error"
                  : "Configured"}
              </Badge>
            ) : (
              <Badge variant="outline">Not Connected</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {lastSyncAt
              ? `Last sync: ${formatDate(lastSyncAt, "dd MMM yyyy HH:mm")}`
              : "Never synced"}
          </span>
          {disabled ? (
            <Button variant="outline" size="sm" disabled>
              Configure
            </Button>
          ) : (
            <Link href={configUrl}>
              <Button variant="outline" size="sm">
                Configure
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
