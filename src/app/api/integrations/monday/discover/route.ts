import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { fetchBoards, fetchBoardColumns, fetchBoardItems } from "@/lib/integrations/monday";

/**
 * POST /api/integrations/monday/discover
 *
 * Fetches boards, their columns, groups (client names), and sample items
 * so users can see their actual Monday.com structure before syncing.
 */
export async function POST(_request: NextRequest) {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "monday" },
  });

  if (!config) {
    return NextResponse.json(
      { error: "Monday.com integration not configured" },
      { status: 404 }
    );
  }

  let decrypted: Record<string, unknown>;
  try {
    decrypted = decryptJson(config.configJson);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt config" },
      { status: 400 }
    );
  }

  const apiToken = decrypted.apiToken as string;
  if (!apiToken) {
    return NextResponse.json(
      { error: "API token not configured" },
      { status: 400 }
    );
  }

  try {
    const boards = await fetchBoards(apiToken);
    const boardIds = (decrypted.boardIds as { timeTracking?: string[]; creatives?: string[] }) ?? {};
    const selectedIds = [
      ...(boardIds.timeTracking ?? []),
      ...(boardIds.creatives ?? []),
    ];

    // For selected boards, fetch columns and a sample of items
    const boardDetails = await Promise.all(
      selectedIds.slice(0, 5).map(async (boardId) => {
        const board = boards.find((b) => b.id === boardId);
        try {
          const columns = await fetchBoardColumns(apiToken, boardId);

          // Fetch first page of items (up to 100)
          const sampleItems: Array<{
            id: string;
            name: string;
            group: string;
            columnValues: Record<string, string>;
          }> = [];

          for await (const batch of fetchBoardItems(apiToken, boardId)) {
            for (const item of batch.slice(0, 10)) {
              const vals: Record<string, string> = {};
              for (const cv of item.column_values) {
                vals[cv.id] = cv.text || "";
              }
              sampleItems.push({
                id: item.id,
                name: item.name,
                group: item.group?.title ?? "Unknown",
                columnValues: vals,
              });
            }
            break; // Only first batch
          }

          // Extract unique groups (= client names)
          const groups = [...new Set(sampleItems.map((i) => i.group))];

          return {
            id: boardId,
            name: board?.name ?? boardId,
            columns: columns.map((c) => ({ id: c.id, title: c.title, type: c.type })),
            groups,
            sampleItems: sampleItems.slice(0, 5),
            totalItemsSampled: sampleItems.length,
          };
        } catch (err) {
          return {
            id: boardId,
            name: board?.name ?? boardId,
            columns: [],
            groups: [],
            sampleItems: [],
            totalItemsSampled: 0,
            error: err instanceof Error ? err.message : "Failed to read board",
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      allBoards: boards.map((b) => ({ id: b.id, name: b.name })),
      selectedBoards: boardDetails,
      config: {
        timeTrackingBoards: boardIds.timeTracking ?? [],
        creativesBoards: boardIds.creatives ?? [],
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
