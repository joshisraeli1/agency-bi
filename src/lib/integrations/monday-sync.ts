import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import { syncLogger } from "@/lib/sync/logger";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { fetchBoardItems, type MondayItem } from "./monday";
import {
  parseColumnValue,
  parseTimeTracking,
  type MondayPersonRef,
} from "./monday-mapper";

// ---------------------------------------------------------------------------
// Config shape stored encrypted in IntegrationConfig.configJson
// ---------------------------------------------------------------------------

export interface MondayConfig {
  apiToken: string;
  boardIds: {
    timeTracking: string[];
    creatives?: string[];
    clients?: string[];
  };
  columnMappings?: {
    [boardId: string]: {
      timeTracking?: string;       // column id for time tracking
      status?: string;             // column id for status
      people?: string;             // column id for people/assignees
      date?: string;               // column id for date
    };
  };
}

const SWAN_STUDIO_NAMES = ["swan studio", "swan", "internal", "overhead"];

async function loadConfig(): Promise<MondayConfig> {
  const integration = await db.integrationConfig.findUnique({
    where: { provider: "monday" },
  });

  if (!integration || !integration.configJson || integration.configJson === "{}") {
    throw new Error("Monday.com integration is not configured");
  }

  const config = decryptJson<MondayConfig>(integration.configJson);

  if (!config.apiToken) {
    throw new Error("Monday.com API token is not configured");
  }

  return config;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getColumnValue(
  item: MondayItem,
  columnId: string | undefined
): { type: string; text: string; value: string | null } | null {
  if (!columnId) return null;
  return item.column_values.find((cv) => cv.id === columnId) ?? null;
}

function findColumnByType(
  item: MondayItem,
  type: string
): { id: string; type: string; text: string; value: string | null } | null {
  return item.column_values.find(
    (cv) => cv.type === type || cv.type === type.replace("_", "-")
  ) ?? null;
}

async function findTeamMemberByMondayUserId(
  mondayUserId: string
): Promise<string | null> {
  const member = await db.teamMember.findUnique({
    where: { mondayUserId: mondayUserId },
    select: { id: true },
  });
  return member?.id ?? null;
}

async function findOrCreateClientByName(
  name: string
): Promise<string | null> {
  if (!name || name.trim() === "") return null;

  const trimmed = name.trim();

  // Check aliases first
  const alias = await db.clientAlias.findFirst({
    where: { alias: trimmed, source: "monday" },
    select: { clientId: true },
  });
  if (alias) return alias.clientId;

  // Check by exact name
  const client = await db.client.findFirst({
    where: { name: trimmed },
    select: { id: true },
  });
  if (client) return client.id;

  // Case-insensitive fallback: check all clients
  const allClients = await db.client.findMany({
    select: { id: true, name: true },
  });
  const match = allClients.find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  return match?.id ?? null;
}

function isOverheadClient(name: string): boolean {
  return SWAN_STUDIO_NAMES.includes(name.toLowerCase().trim());
}

function extractEditCode(name: string): string | null {
  // Match patterns like "SW-001", "ABC-123", etc.
  const match = name.match(/^([A-Z]{2,4}-\d{3,4})/);
  return match ? match[1] : null;
}

function extractPersonIds(
  item: MondayItem,
  columnId: string | undefined
): MondayPersonRef[] {
  const col = getColumnValue(item, columnId);
  if (!col) {
    // Fall back to finding a people-type column
    const peopleCol = findColumnByType(item, "people");
    if (!peopleCol) return [];
    return parseColumnValue("people", peopleCol.value, peopleCol.text) as MondayPersonRef[];
  }
  return parseColumnValue("people", col.value, col.text) as MondayPersonRef[];
}

// ---------------------------------------------------------------------------
// MondayTimeTrackingSyncAdapter
// ---------------------------------------------------------------------------

export class MondayTimeTrackingSyncAdapter implements SyncAdapter<MondayItem> {
  name = "Monday Time Tracking";
  provider = "monday";

  async *fetchAll(context: SyncContext): AsyncGenerator<MondayItem[], void, unknown> {
    const config = await loadConfig();
    const boardIds = config.boardIds?.timeTracking ?? [];

    if (boardIds.length === 0) {
      syncLogger.info(context.importId, "No time tracking boards configured");
      return;
    }

    for (const boardId of boardIds) {
      syncLogger.info(context.importId, `Fetching items from board ${boardId}`);

      try {
        for await (const batch of fetchBoardItems(config.apiToken, boardId)) {
          // Filter to items that actually have time tracking data
          const withTime = batch.filter((item) => {
            const mappings = config.columnMappings?.[boardId];
            const ttCol = getColumnValue(item, mappings?.timeTracking);
            if (ttCol) {
              return ttCol.text !== "" || (ttCol.value !== null && ttCol.value !== "{}");
            }
            // Fallback: find any time_tracking column
            const fallback = findColumnByType(item, "time_tracking");
            return fallback !== null && (fallback.text !== "" || (fallback.value !== null && fallback.value !== "{}"));
          });

          // Attach boardId to items for downstream processing
          for (const item of withTime) {
            (item as MondayItem & { _boardId?: string })._boardId = boardId;
          }

          if (withTime.length > 0) {
            yield withTime;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        syncLogger.error(context.importId, `Error fetching board ${boardId}: ${msg}`);
      }
    }
  }

  async mapAndUpsert(
    items: MondayItem[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];
    const config = await loadConfig();

    for (const item of items) {
      try {
        const boardId = (item as MondayItem & { _boardId?: string })._boardId ?? "";
        const mappings = config.columnMappings?.[boardId] ?? {};

        // Parse time tracking value
        const ttCol = getColumnValue(item, mappings.timeTracking) ?? findColumnByType(item, "time_tracking");
        const hours = ttCol ? parseTimeTracking(ttCol.value ?? ttCol.text) : null;
        const isIncomplete = hours === null || hours === 0;

        // Parse people / assignee
        const personRefs = extractPersonIds(item, mappings.people);

        // Derive client from group name (board group = client name)
        const groupName = item.group?.title ?? "";
        const clientId = await findOrCreateClientByName(groupName);
        const overhead = isOverheadClient(groupName);

        // Parse date
        const dateCol = getColumnValue(item, mappings.date) ?? findColumnByType(item, "date");
        let entryDate: Date;
        if (dateCol) {
          const parsed = parseColumnValue("date", dateCol.value, dateCol.text) as Date | null;
          entryDate = parsed ?? new Date();
        } else {
          entryDate = new Date();
        }

        if (personRefs.length === 0) {
          // Single entry with no team member
          await db.timeEntry.upsert({
            where: {
              mondayItemId_teamMemberId_date: {
                mondayItemId: item.id,
                teamMemberId: "",
                date: entryDate,
              },
            },
            create: {
              mondayItemId: item.id,
              mondayBoardId: boardId,
              clientId,
              teamMemberId: null,
              date: entryDate,
              hours: hours ?? 0,
              description: item.name,
              isIncomplete,
              isOverhead: overhead,
              source: "monday",
            },
            update: {
              hours: hours ?? 0,
              description: item.name,
              isIncomplete,
              isOverhead: overhead,
              clientId,
              mondayBoardId: boardId,
            },
          });
          synced++;
        } else {
          // Create one entry per person
          for (const person of personRefs) {
            if (person.kind !== "person") continue;

            const teamMemberId = await findTeamMemberByMondayUserId(
              String(person.id)
            );

            await db.timeEntry.upsert({
              where: {
                mondayItemId_teamMemberId_date: {
                  mondayItemId: item.id,
                  teamMemberId: teamMemberId ?? "",
                  date: entryDate,
                },
              },
              create: {
                mondayItemId: item.id,
                mondayBoardId: boardId,
                clientId,
                teamMemberId,
                date: entryDate,
                hours: hours ?? 0,
                description: item.name,
                isIncomplete,
                isOverhead: overhead,
                source: "monday",
              },
              update: {
                hours: hours ?? 0,
                description: item.name,
                isIncomplete,
                isOverhead: overhead,
                clientId,
                mondayBoardId: boardId,
              },
            });
            synced++;
          }
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Item ${item.id} (${item.name}): ${msg}`);
        syncLogger.error(
          context.importId,
          `Failed to sync time entry for item ${item.id}: ${msg}`
        );
      }
    }

    return { synced, failed, errors };
  }
}

