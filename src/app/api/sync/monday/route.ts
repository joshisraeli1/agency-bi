import { NextRequest, NextResponse } from "next/server";
import { requireRole, logAudit } from "@/lib/auth";
import { syncEngine } from "@/lib/sync/engine";
import {
  MondayTimeTrackingSyncAdapter,
  MondayCreativesSyncAdapter,
  MondayClientsSyncAdapter,
} from "@/lib/integrations/monday-sync";

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (!type || !["time_tracking", "creatives", "clients"].includes(type)) {
    return NextResponse.json(
      { error: "Query parameter 'type' must be 'time_tracking', 'creatives', or 'clients'" },
      { status: 400 }
    );
  }

  try {
    const adapter =
      type === "time_tracking"
        ? new MondayTimeTrackingSyncAdapter()
        : type === "creatives"
          ? new MondayCreativesSyncAdapter()
          : new MondayClientsSyncAdapter();

    const importId = await syncEngine.run(adapter, "full", "manual");

    await logAudit({ action: "sync_triggered", userId: session.userId, entity: "sync", entityId: importId, details: `Triggered Monday sync: ${type}` });

    return NextResponse.json({ importId, type });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
