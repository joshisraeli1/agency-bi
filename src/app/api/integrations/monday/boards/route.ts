import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { fetchBoards, fetchBoardColumns } from "@/lib/integrations/monday";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId");

  try {
    const config = await db.integrationConfig.findUnique({
      where: { provider: "monday" },
    });

    if (!config || !config.configJson || config.configJson === "{}") {
      return NextResponse.json(
        { error: "Monday.com integration is not configured" },
        { status: 400 }
      );
    }

    const decrypted = decryptJson<{ apiToken?: string }>(config.configJson);

    if (!decrypted.apiToken) {
      return NextResponse.json(
        { error: "API token is not set" },
        { status: 400 }
      );
    }

    // If boardId is provided, return columns for that board
    if (boardId) {
      const columns = await fetchBoardColumns(decrypted.apiToken, boardId);
      return NextResponse.json({ columns });
    }

    // Otherwise return all boards
    const boards = await fetchBoards(decrypted.apiToken);
    return NextResponse.json({ boards });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
