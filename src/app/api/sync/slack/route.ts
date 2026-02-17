import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSlackAdapter } from "@/lib/integrations/slack-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as
    | "messages"
    | "users"
    | null;

  if (!type || !["messages", "users"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid sync type. Must be: messages or users" },
      { status: 400 }
    );
  }

  // Verify Slack is configured
  const config = await db.integrationConfig.findUnique({
    where: { provider: "slack" },
  });

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Slack integration is not enabled" },
      { status: 400 }
    );
  }

  try {
    const adapter = createSlackAdapter(type);
    const importId = await syncEngine.run(adapter, "full", "manual");

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
