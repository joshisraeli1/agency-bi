import { NextRequest, NextResponse } from "next/server";
import { requireRole, logAudit } from "@/lib/auth";
import { syncEngine } from "@/lib/sync/engine";
import { MondayTimeTrackingSyncAdapter } from "@/lib/integrations/monday-sync";

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  try {
    const adapter = new MondayTimeTrackingSyncAdapter();
    const importId = await syncEngine.run(adapter, "full", "manual");

    await logAudit({ action: "sync_triggered", userId: session.userId, entity: "sync", entityId: importId, details: "Triggered Monday time tracking sync" });

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
