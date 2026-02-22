import { NextResponse } from "next/server";
import { requireRole, logAudit } from "@/lib/auth";
import { db } from "@/lib/db";
import { createGmailAdapter } from "@/lib/integrations/gmail-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

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

    await logAudit({ action: "sync_triggered", userId: session.userId, entity: "sync", entityId: importId, details: "Triggered Gmail sync" });

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
