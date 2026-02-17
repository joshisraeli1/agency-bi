import { slackRateLimiter } from "@/lib/sync/rate-limiter";

const BASE_URL = "https://slack.com/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackChannel {
  id: string;
  name: string;
  is_channel: boolean;
  is_private: boolean;
  is_archived: boolean;
  is_member: boolean;
  num_members: number;
}

export interface SlackMessage {
  type: string;
  user?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  channel?: string; // injected during fetch
}

export interface SlackUser {
  id: string;
  name: string;
  real_name: string;
  profile: {
    email?: string;
    display_name: string;
    real_name: string;
    image_72?: string;
  };
  is_bot: boolean;
  is_admin: boolean;
  deleted: boolean;
}

interface SlackResponse {
  ok: boolean;
  error?: string;
}

interface SlackChannelsResponse extends SlackResponse {
  channels: SlackChannel[];
  response_metadata?: {
    next_cursor: string;
  };
}

interface SlackHistoryResponse extends SlackResponse {
  messages: SlackMessage[];
  has_more: boolean;
  response_metadata?: {
    next_cursor: string;
  };
}

interface SlackUsersResponse extends SlackResponse {
  members: SlackUser[];
  response_metadata?: {
    next_cursor: string;
  };
}

interface SlackAuthTestResponse extends SlackResponse {
  url: string;
  team: string;
  user: string;
  team_id: string;
  user_id: string;
}

// ---------------------------------------------------------------------------
// Private fetch helper
// ---------------------------------------------------------------------------

async function slackFetch<T extends SlackResponse>(
  token: string,
  method: string,
  params?: Record<string, string>
): Promise<T> {
  await slackRateLimiter.acquire();

  const url = new URL(`${BASE_URL}/${method}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(`Slack API HTTP error: ${response.status}`);
  }

  const data = (await response.json()) as T;

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error || "unknown error"}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function fetchChannels(
  token: string
): Promise<SlackChannel[]> {
  const allChannels: SlackChannel[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "200",
    };
    if (cursor) params.cursor = cursor;

    const response = await slackFetch<SlackChannelsResponse>(
      token,
      "conversations.list",
      params
    );

    allChannels.push(...response.channels);
    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return allChannels;
}

export async function* fetchChannelHistory(
  token: string,
  channelId: string,
  oldest?: string
): AsyncGenerator<SlackMessage[], void, unknown> {
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      channel: channelId,
      limit: "200",
    };
    if (oldest) params.oldest = oldest;
    if (cursor) params.cursor = cursor;

    const response = await slackFetch<SlackHistoryResponse>(
      token,
      "conversations.history",
      params
    );

    // Inject channel ID into messages
    const messages = response.messages.map((m) => ({
      ...m,
      channel: channelId,
    }));

    if (messages.length > 0) {
      yield messages;
    }

    cursor = response.response_metadata?.next_cursor || undefined;
    if (!response.has_more) break;
  } while (cursor);
}

export async function* fetchUsers(
  token: string
): AsyncGenerator<SlackUser[], void, unknown> {
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      limit: "200",
    };
    if (cursor) params.cursor = cursor;

    const response = await slackFetch<SlackUsersResponse>(
      token,
      "users.list",
      params
    );

    const users = response.members.filter((u) => !u.is_bot && !u.deleted);
    if (users.length > 0) {
      yield users;
    }

    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);
}

export async function testConnection(
  token: string
): Promise<{ success: boolean; team?: string; user?: string; error?: string }> {
  try {
    const response = await slackFetch<SlackAuthTestResponse>(
      token,
      "auth.test"
    );

    return {
      success: true,
      team: response.team,
      user: response.user,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { success: false, error: message };
  }
}
