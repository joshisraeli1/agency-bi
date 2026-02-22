import { NextResponse } from "next/server";
import { requireRole, logAudit } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCalendarAdapter } from "@/lib/integrations/calendar-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

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

    await logAudit({ action: "sync_triggered", userId: session.userId, entity: "sync", entityId: importId, details: "Triggered calendar sync" });

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
