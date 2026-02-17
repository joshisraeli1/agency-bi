import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { syncLogger } from "@/lib/sync/logger";
import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import {
  fetchChannelHistory,
  fetchUsers,
  type SlackMessage,
  type SlackUser,
} from "./slack";

interface SlackConfig {
  botToken: string;
  channelIds?: string[];
}

async function getSlackConfig(): Promise<SlackConfig> {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "slack" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    throw new Error("Slack integration is not configured");
  }

  const decrypted = decryptJson<SlackConfig>(config.configJson);

  if (!decrypted.botToken) {
    throw new Error("Slack bot token is not configured");
  }

  return decrypted;
}

// ---------------------------------------------------------------------------
// Message Sync Adapter
// ---------------------------------------------------------------------------
export class MessageSyncAdapter implements SyncAdapter<SlackMessage> {
  name = "Slack Messages";
  provider = "slack";

  async *fetchAll(context: SyncContext): AsyncGenerator<SlackMessage[], void, unknown> {
    const config = await getSlackConfig();
    const channelIds = config.channelIds || [];

    if (channelIds.length === 0) {
      syncLogger.info(context.importId, "No channels configured for Slack sync");
      return;
    }

    syncLogger.info(
      context.importId,
      `Fetching messages from ${channelIds.length} channel(s)`
    );

    // Fetch messages from the last 30 days
    const thirtyDaysAgo = String(
      Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
    );

    for (const channelId of channelIds) {
      syncLogger.info(context.importId, `Fetching channel ${channelId}`);
      for await (const batch of fetchChannelHistory(
        config.botToken,
        channelId,
        thirtyDaysAgo
      )) {
        yield batch;
      }
    }
  }

  async mapAndUpsert(
    messages: SlackMessage[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Load all clients with aliases for matching
    const clients = await db.client.findMany({
      include: { aliases: true },
    });

    for (const message of messages) {
      try {
        if (!message.text || message.text.trim() === "") continue;

        // Try to match message to a client based on content or channel name
        const clientId = matchMessageToClient(message, clients);
        if (!clientId) continue; // Skip messages we can't attribute to a client

        const date = new Date(parseFloat(message.ts) * 1000);
        const externalId = `slack-${message.channel}-${message.ts}`;

        await db.communicationLog.upsert({
          where: {
            id: externalId,
          },
          create: {
            id: externalId,
            clientId,
            type: "slack",
            subject: message.text.substring(0, 200),
            summary: message.text.substring(0, 500),
            date,
            source: "slack",
            externalId,
          },
          update: {
            subject: message.text.substring(0, 200),
            summary: message.text.substring(0, 500),
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Message ${message.ts}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Message ${message.ts}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

function matchMessageToClient(
  message: SlackMessage,
  clients: Array<{ id: string; name: string; aliases: Array<{ alias: string }> }>
): string | null {
  const text = message.text.toLowerCase();

  for (const client of clients) {
    // Check client name
    if (text.includes(client.name.toLowerCase())) {
      return client.id;
    }
    // Check aliases
    for (const alias of client.aliases) {
      if (text.includes(alias.alias.toLowerCase())) {
        return client.id;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// User Sync Adapter
// ---------------------------------------------------------------------------
export class UserSyncAdapter implements SyncAdapter<SlackUser> {
  name = "Slack Users";
  provider = "slack";

  async *fetchAll(context: SyncContext): AsyncGenerator<SlackUser[], void, unknown> {
    const config = await getSlackConfig();
    syncLogger.info(context.importId, "Fetching users from Slack");

    for await (const batch of fetchUsers(config.botToken)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    users: SlackUser[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        const name = user.real_name || user.profile.real_name || user.name;
        const email = user.profile.email;

        if (!name) {
          errors.push(`User ${user.id}: missing name, skipped`);
          failed++;
          continue;
        }

        // Try to match by email first, then by slackUserId
        let teamMember = await db.teamMember.findUnique({
          where: { slackUserId: user.id },
        });

        if (!teamMember && email) {
          teamMember = await db.teamMember.findUnique({
            where: { email },
          });
        }

        if (teamMember) {
          // Update existing team member with slackUserId
          await db.teamMember.update({
            where: { id: teamMember.id },
            data: {
              slackUserId: user.id,
              name: teamMember.name || name,
              email: teamMember.email || email,
            },
          });
        } else {
          // Create new team member
          await db.teamMember.create({
            data: {
              name,
              email: email || undefined,
              slackUserId: user.id,
              source: "slack",
              active: true,
            },
          });
        }

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`User ${user.id}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `User ${user.id}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createSlackAdapter(
  type: "messages" | "users"
): SyncAdapter {
  switch (type) {
    case "messages":
      return new MessageSyncAdapter();
    case "users":
      return new UserSyncAdapter();
    default:
      throw new Error(`Unknown Slack sync type: ${type}`);
  }
}
