import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { syncLogger } from "@/lib/sync/logger";
import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import {
  fetchEmails,
  refreshAccessToken,
  type GmailEmail,
} from "./gmail";

interface GmailConfig {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

async function getGmailConfig(): Promise<GmailConfig> {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "gmail" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    throw new Error("Gmail integration is not configured");
  }

  const decrypted = decryptJson<GmailConfig>(config.configJson);

  if (!decrypted.accessToken) {
    throw new Error("Gmail access token is not configured");
  }

  // If token is expired, refresh it
  if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
    if (!decrypted.refreshToken) {
      throw new Error("Gmail refresh token not available. Please re-authenticate.");
    }

    const refreshed = await refreshAccessToken(decrypted.refreshToken);
    const updatedConfig: GmailConfig = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    };

    await db.integrationConfig.update({
      where: { provider: "gmail" },
      data: { configJson: encryptJson(updatedConfig as unknown as Record<string, unknown>) },
    });

    return updatedConfig;
  }

  return decrypted;
}

// ---------------------------------------------------------------------------
// Email Sync Adapter
// ---------------------------------------------------------------------------
export class EmailSyncAdapter implements SyncAdapter<GmailEmail> {
  name = "Gmail Emails";
  provider = "gmail";

  async *fetchAll(context: SyncContext): AsyncGenerator<GmailEmail[], void, unknown> {
    const config = await getGmailConfig();
    syncLogger.info(context.importId, "Fetching emails from Gmail");

    // Fetch emails from the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const query = `after:${Math.floor(thirtyDaysAgo.getTime() / 1000)}`;

    for await (const batch of fetchEmails(config.accessToken, query)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    emails: GmailEmail[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    // Load all clients with aliases for email/domain matching
    const clients = await db.client.findMany({
      include: { aliases: true },
    });

    for (const email of emails) {
      try {
        // Extract email addresses from From and To
        const fromEmail = extractEmail(email.from);
        const toEmail = extractEmail(email.to);

        // Try to match to a client by email domain or name
        const clientId = matchEmailToClient(fromEmail, toEmail, clients);
        if (!clientId) continue; // Skip emails we can't attribute to a client

        const date = email.date ? new Date(email.date) : new Date();
        const externalId = `gmail-${email.id}`;

        await db.communicationLog.upsert({
          where: { id: externalId },
          create: {
            id: externalId,
            clientId,
            type: "email",
            subject: email.subject || "(no subject)",
            summary: email.snippet || undefined,
            date,
            source: "gmail",
            externalId,
          },
          update: {
            subject: email.subject || "(no subject)",
            summary: email.snippet || undefined,
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Email ${email.id}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Email ${email.id}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

function extractEmail(headerValue: string): string {
  // Extract email from "Name <email@example.com>" format
  const match = headerValue.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  // If it's just an email address
  if (headerValue.includes("@")) return headerValue.trim().toLowerCase();
  return "";
}

function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length > 1 ? parts[1] : "";
}

function matchEmailToClient(
  fromEmail: string,
  toEmail: string,
  clients: Array<{
    id: string;
    name: string;
    website?: string | null;
    aliases: Array<{ alias: string }>;
  }>
): string | null {
  const fromDomain = extractDomain(fromEmail);
  const toDomain = extractDomain(toEmail);

  for (const client of clients) {
    // Check website domain match
    if (client.website) {
      const clientDomain = client.website
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];

      if (fromDomain === clientDomain || toDomain === clientDomain) {
        return client.id;
      }
    }

    // Check name in email addresses
    const clientNameLower = client.name.toLowerCase();
    if (fromEmail.includes(clientNameLower) || toEmail.includes(clientNameLower)) {
      return client.id;
    }

    // Check aliases
    for (const alias of client.aliases) {
      const aliasLower = alias.alias.toLowerCase();
      if (fromEmail.includes(aliasLower) || toEmail.includes(aliasLower)) {
        return client.id;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createGmailAdapter(): SyncAdapter {
  return new EmailSyncAdapter();
}
