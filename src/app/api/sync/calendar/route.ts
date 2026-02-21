import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCalendarAdapter } from "@/lib/integrations/calendar-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify Calendar is configured
  const config = await db.integrationConfig.findUnique({
    where: { provider: "calendar" },
  });

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Calendar integration is not enabled" },
      { status: 400 }
    );
  }

  try {
    const adapter = createCalendarAdapter();
    const importId = await syncEngine.run(adapter, "full", "manual");

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
