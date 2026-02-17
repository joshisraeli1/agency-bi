import { mondayRateLimiter } from "@/lib/sync/rate-limiter";

const MONDAY_API_URL = "https://api.monday.com/v2";
const PAGE_SIZE = 100;

interface MondayBoard {
  id: string;
  name: string;
}

interface MondayColumn {
  id: string;
  title: string;
  type: string;
}

interface MondayColumnValue {
  id: string;
  type: string;
  text: string;
  value: string | null;
}

export interface MondayItem {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: MondayColumnValue[];
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  error_code?: string;
  status_code?: number;
}

async function mondayRequest<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  await mondayRateLimiter.acquire();

  const response = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `Monday.com API error: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    throw new Error(
      `Monday.com GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`
    );
  }

  if (!json.data) {
    throw new Error("Monday.com API returned no data");
  }

  return json.data;
}

export async function fetchBoards(
  token: string
): Promise<MondayBoard[]> {
  const query = `
    query {
      boards(limit: 200) {
        id
        name
      }
    }
  `;

  const data = await mondayRequest<{ boards: MondayBoard[] }>(token, query);
  return data.boards;
}

export async function fetchBoardColumns(
  token: string,
  boardId: string
): Promise<MondayColumn[]> {
  const query = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const data = await mondayRequest<{
    boards: Array<{ columns: MondayColumn[] }>;
  }>(token, query, { boardId: [boardId] });

  if (!data.boards || data.boards.length === 0) {
    throw new Error(`Board ${boardId} not found`);
  }

  return data.boards[0].columns;
}

export async function* fetchBoardItems(
  token: string,
  boardId: string
): AsyncGenerator<MondayItem[], void, unknown> {
  let cursor: string | null = null;
  let hasMore = true;

  // First request uses items_page on the board
  const firstQuery = `
    query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        items_page(limit: ${PAGE_SIZE}) {
          cursor
          items {
            id
            name
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
            }
          }
        }
      }
    }
  `;

  const firstData = await mondayRequest<{
    boards: Array<{
      items_page: {
        cursor: string | null;
        items: MondayItem[];
      };
    }>;
  }>(token, firstQuery, { boardId: [boardId] });

  if (!firstData.boards || firstData.boards.length === 0) {
    return;
  }

  const firstPage = firstData.boards[0].items_page;
  if (firstPage.items.length > 0) {
    yield firstPage.items;
  }

  cursor = firstPage.cursor;
  hasMore = cursor !== null && firstPage.items.length === PAGE_SIZE;

  // Subsequent requests use next_items_page with cursor
  while (hasMore && cursor) {
    const nextQuery = `
      query ($cursor: String!) {
        next_items_page(cursor: $cursor, limit: ${PAGE_SIZE}) {
          cursor
          items {
            id
            name
            group {
              id
              title
            }
            column_values {
              id
              type
              text
              value
            }
          }
        }
      }
    `;

    const nextData = await mondayRequest<{
      next_items_page: {
        cursor: string | null;
        items: MondayItem[];
      };
    }>(token, nextQuery, { cursor });

    const page = nextData.next_items_page;
    if (page.items.length > 0) {
      yield page.items;
    }

    cursor = page.cursor;
    hasMore = cursor !== null && page.items.length === PAGE_SIZE;
  }
}

/**
 * Test the API connection by fetching the current user.
 */
export async function testConnection(
  token: string
): Promise<{ success: boolean; accountName?: string; error?: string }> {
  try {
    const data = await mondayRequest<{
      me: { name: string; account: { name: string } };
    }>(token, `query { me { name account { name } } }`);

    return {
      success: true,
      accountName: data.me.account.name,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
