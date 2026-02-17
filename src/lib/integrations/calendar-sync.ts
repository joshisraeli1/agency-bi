import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { syncLogger } from "@/lib/sync/logger";
import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import {
  fetchEvents,
  refreshAccessToken,
  type CalendarEvent,
} from "./calendar";

interface CalendarConfig {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  calendarId?: string;
}

async function getCalendarConfig(): Promise<CalendarConfig> {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "calendar" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    throw new Error("Calendar integration is not configured");
  }

  const decrypted = decryptJson<CalendarConfig>(config.configJson);

  if (!decrypted.accessToken) {
    throw new Error("Calendar access token is not configured");
  }

  // If token is expired, refresh it
  if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
    if (!decrypted.refreshToken) {
      throw new Error("Calendar refresh token not available. Please re-authenticate.");
    }

    const refreshed = await refreshAccessToken(decrypted.refreshToken);
    const updatedConfig: CalendarConfig = {
      ...decrypted,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    };

    await db.integrationConfig.update({
      where: { provider: "calendar" },
      data: { configJson: encryptJson(updatedConfig as unknown as Record<string, unknown>) },
    });

    return updatedConfig;
  }

  return decrypted;
}

// ---------------------------------------------------------------------------
// Event Sync Adapter
// ---------------------------------------------------------------------------
export class EventSyncAdapter implements SyncAdapter<CalendarEvent> {
  name = "Calendar Events";
  provider = "calendar";

  async *fetchAll(context: SyncContext): AsyncGenerator<CalendarEvent[], void, unknown> {
    const config = await getCalendarConfig();
    const calendarId = config.calendarId || "primary";

    syncLogger.info(
      context.importId,
      `Fetching events from calendar: ${calendarId}`
    );

    for await (const batch of fetchEvents(config.accessToken, calendarId)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    events: CalendarEvent[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Load all clients for attendee email matching
    const clients = await db.client.findMany({
      include: { aliases: true },
    });

    for (const event of events) {
      try {
        if (event.status === "cancelled") continue;

        const date = new Date(event.start);
        const externalId = `calendar-${event.id}`;

        // Match attendees to client
        const clientId = matchAttendeesToClient(event.attendees, clients);

        // Upsert the meeting log
        const meetingLog = await db.meetingLog.upsert({
          where: { id: externalId },
          create: {
            id: externalId,
            clientId: clientId || undefined,
            title: event.summary,
            date,
            duration: event.duration > 0 ? event.duration : undefined,
            summary: event.description?.substring(0, 500) || undefined,
            source: "calendar",
            externalId,
          },
          update: {
            clientId: clientId || undefined,
            title: event.summary,
            date,
            duration: event.duration > 0 ? event.duration : undefined,
            summary: event.description?.substring(0, 500) || undefined,
          },
        });

        // Upsert attendees
        for (const attendee of event.attendees) {
          if (!attendee.email) continue;

          try {
            await db.meetingAttendee.upsert({
              where: {
                meetingId_email: {
                  meetingId: meetingLog.id,
                  email: attendee.email,
                },
              },
              create: {
                meetingId: meetingLog.id,
                email: attendee.email,
                name: attendee.displayName || undefined,
              },
              update: {
                name: attendee.displayName || undefined,
              },
            });
          } catch {
            // Ignore individual attendee errors
          }
        }

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Event ${event.id}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Event ${event.id}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

function matchAttendeesToClient(
  attendees: Array<{ email: string; displayName?: string }>,
  clients: Array<{
    id: string;
    name: string;
    website?: string | null;
    aliases: Array<{ alias: string }>;
  }>
): string | null {
  for (const attendee of attendees) {
    const email = attendee.email.toLowerCase();
    const domain = email.split("@")[1] || "";

    for (const client of clients) {
      // Check website domain match
      if (client.website) {
        const clientDomain = client.website
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0];

        if (domain === clientDomain) {
          return client.id;
        }
      }

      // Check attendee name or email against client name
      const clientNameLower = client.name.toLowerCase();
      if (email.includes(clientNameLower)) {
        return client.id;
      }
      if (attendee.displayName?.toLowerCase().includes(clientNameLower)) {
        return client.id;
      }

      // Check aliases
      for (const alias of client.aliases) {
        const aliasLower = alias.alias.toLowerCase();
        if (email.includes(aliasLower) || attendee.displayName?.toLowerCase().includes(aliasLower)) {
          return client.id;
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createCalendarAdapter(): SyncAdapter {
  return new EventSyncAdapter();
}
