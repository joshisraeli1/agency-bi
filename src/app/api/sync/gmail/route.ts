import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createGmailAdapter } from "@/lib/integrations/gmail-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify Gmail is configured
  const config = await db.integrationConfig.findUnique({
    where: { provider: "gmail" },
  });

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Gmail integration is not enabled" },
      { status: 400 }
    );
  }

  try {
    const adapter = createGmailAdapter();
    const importId = await syncEngine.run(adapter, "full", "manual");

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
