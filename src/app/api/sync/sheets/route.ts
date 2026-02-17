import { NextRequest, NextResponse } from "next/server";
import { syncEngine } from "@/lib/sync/engine";
import {
  createSheetsSyncAdapter,
  ALL_SHEET_TABS,
  type SheetsSyncTab,
} from "@/lib/integrations/sheets-sync";

const VALID_TABS = new Set<string>([
  "salary",
  "clients",
  "costs",
  "client-match",
  "packages",
  "all",
]);

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? "all";

  if (!VALID_TABS.has(tab)) {
    return NextResponse.json(
      {
        error: `Invalid tab: ${tab}. Must be one of: ${[...VALID_TABS].join(", ")}`,
      },
      { status: 400 }
    );
  }

  try {
    if (tab === "all") {
      // Run all tabs in sequence, collect all import IDs
      const importIds: string[] = [];

      for (const sheetTab of ALL_SHEET_TABS) {
        const adapter = createSheetsSyncAdapter(sheetTab);
        const importId = await syncEngine.run(adapter, "full", "api");
        importIds.push(importId);

        // Wait a small moment between starting each sync so they don't all
        // compete for the Sheets rate limiter simultaneously. The engine runs
        // them in the background, but a brief stagger helps.
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      return NextResponse.json({ importIds, tab: "all" });
    }

    const adapter = createSheetsSyncAdapter(tab as SheetsSyncTab);
    const importId = await syncEngine.run(adapter, "full", "api");

    return NextResponse.json({ importId, tab });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
