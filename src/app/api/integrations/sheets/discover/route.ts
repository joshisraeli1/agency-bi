import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { getAuthClient, listSheetTabs, readNamedSheet } from "@/lib/integrations/sheets";

/**
 * POST /api/integrations/sheets/discover
 *
 * Connects to the configured Google Sheet, lists all tabs,
 * and returns headers + sample rows for each tab.
 * This lets users see their actual data structure and map tabs
 * to the correct data types before syncing.
 */
export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await db.integrationConfig.findUnique({
    where: { provider: "sheets" },
  });

  if (!config) {
    return NextResponse.json(
      { error: "Google Sheets integration not configured" },
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

  const serviceAccountEmail = decrypted.serviceAccountEmail as string;
  const privateKey = decrypted.privateKey as string;
  const sheetId = decrypted.sheetId as string;

  if (!serviceAccountEmail || !privateKey || !sheetId) {
    return NextResponse.json(
      { error: "Incomplete configuration: need serviceAccountEmail, privateKey, and sheetId" },
      { status: 400 }
    );
  }

  try {
    const auth = getAuthClient(serviceAccountEmail, privateKey);
    const tabNames = await listSheetTabs(auth, sheetId);

    // Read headers + first 5 rows from each tab
    const tabs = await Promise.all(
      tabNames.map(async (tabName) => {
        try {
          const { headers, rows } = await readNamedSheet(auth, sheetId, tabName);
          return {
            name: tabName,
            headers,
            sampleRows: rows.slice(0, 5),
            totalRows: rows.length,
          };
        } catch (err) {
          return {
            name: tabName,
            headers: [],
            sampleRows: [],
            totalRows: 0,
            error: err instanceof Error ? err.message : "Failed to read tab",
          };
        }
      })
    );

    // Include existing tab mappings if configured
    const tabMappings = (decrypted.tabMappings as Record<string, string>) ?? {};

    return NextResponse.json({
      success: true,
      tabs,
      tabMappings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
