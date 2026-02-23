import { gmailRateLimiter } from "@/lib/sync/rate-limiter";
import { google } from "googleapis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET not set");
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/gmail/callback`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  const typedTokens = tokens as TokenResponse;

  if (!typedTokens.access_token) {
    throw new Error("Failed to obtain access token from Google");
  }

  return {
    accessToken: typedTokens.access_token,
    refreshToken: typedTokens.refresh_token || "",
    expiresAt: typedTokens.expiry_date || Date.now() + 3600 * 1000,
  };
}

export async function refreshAccessToken(currentRefreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: currentRefreshToken });

  const { credentials } = await oauth2Client.refreshAccessToken();
  const typedCreds = credentials as TokenResponse;

  return {
    accessToken: typedCreds.access_token,
    refreshToken: typedCreds.refresh_token || currentRefreshToken,
    expiresAt: typedCreds.expiry_date || Date.now() + 3600 * 1000,
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function* fetchEmails(
  accessToken: string,
  query?: string,
  maxResults = 100
): AsyncGenerator<GmailEmail[], void, unknown> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  let pageToken: string | undefined;

  do {
    await gmailRateLimiter.acquire();

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query || "in:inbox",
      maxResults: Math.min(maxResults, 100),
      pageToken,
    });

    const messageIds = listResponse.data.messages || [];
    if (messageIds.length === 0) break;

    const emails: GmailEmail[] = [];

    for (const msgRef of messageIds) {
      if (!msgRef.id) continue;

      await gmailRateLimiter.acquire();

      const msgResponse = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });

      const headers = msgResponse.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      emails.push({
        id: msgRef.id,
        threadId: msgResponse.data.threadId || "",
        subject: getHeader("Subject"),
        from: getHeader("From"),
        to: getHeader("To"),
        date: getHeader("Date"),
        snippet: msgResponse.data.snippet || "",
      });
    }

    if (emails.length > 0) {
      yield emails;
    }

    pageToken = listResponse.data.nextPageToken || undefined;
  } while (pageToken);
}

export async function testConnectionGmail(
  accessToken: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    await gmailRateLimiter.acquire();

    const profile = await gmail.users.getProfile({ userId: "me" });

    return {
      success: true,
      email: profile.data.emailAddress || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { success: false, error: message };
  }
}
