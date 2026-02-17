import { calendarRateLimiter } from "@/lib/sync/rate-limiter";
import { google } from "googleapis";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string; // ISO date
  end: string; // ISO date
  duration: number; // minutes
  attendees: CalendarAttendee[];
  organizer?: {
    email: string;
    displayName?: string;
  };
  status: string;
}

export interface CalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
}

export interface CalendarInfo {
  id: string;
  summary: string;
  primary?: boolean;
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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/calendar/callback`;

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/calendar.readonly"],
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

export async function* fetchEvents(
  accessToken: string,
  calendarId = "primary",
  timeMin?: string,
  timeMax?: string
): AsyncGenerator<CalendarEvent[], void, unknown> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  let pageToken: string | undefined;

  // Default to last 30 days if no range specified
  const defaultTimeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const defaultTimeMax = new Date().toISOString();

  do {
    await calendarRateLimiter.acquire();

    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin || defaultTimeMin,
      timeMax: timeMax || defaultTimeMax,
      maxResults: 250,
      singleEvents: true,
      orderBy: "startTime",
      pageToken,
    });

    const items = response.data.items || [];
    if (items.length === 0) break;

    const events: CalendarEvent[] = items
      .filter((item) => item.id && item.summary)
      .map((item) => {
        const startStr = item.start?.dateTime || item.start?.date || "";
        const endStr = item.end?.dateTime || item.end?.date || "";

        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        const durationMs = endDate.getTime() - startDate.getTime();
        const durationMinutes = Math.round(durationMs / (1000 * 60));

        return {
          id: item.id!,
          summary: item.summary!,
          description: item.description || undefined,
          start: startStr,
          end: endStr,
          duration: durationMinutes > 0 ? durationMinutes : 0,
          attendees: (item.attendees || []).map((a) => ({
            email: a.email || "",
            displayName: a.displayName || undefined,
            responseStatus: a.responseStatus || undefined,
          })),
          organizer: item.organizer
            ? {
                email: item.organizer.email || "",
                displayName: item.organizer.displayName || undefined,
              }
            : undefined,
          status: item.status || "confirmed",
        };
      });

    if (events.length > 0) {
      yield events;
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
}

export async function fetchCalendars(
  accessToken: string
): Promise<CalendarInfo[]> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  await calendarRateLimiter.acquire();

  const response = await calendar.calendarList.list({
    maxResults: 100,
  });

  return (response.data.items || []).map((cal) => ({
    id: cal.id || "",
    summary: cal.summary || "",
    primary: cal.primary || false,
  }));
}

export async function testConnectionCalendar(
  accessToken: string
): Promise<{ success: boolean; calendars?: CalendarInfo[]; error?: string }> {
  try {
    const calendars = await fetchCalendars(accessToken);

    return {
      success: true,
      calendars,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { success: false, error: message };
  }
}
