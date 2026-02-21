import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { syncEngine } from "@/lib/sync/engine";
import {
  MondayTimeTrackingSyncAdapter,
  MondayCreativesSyncAdapter,
  MondayClientsSyncAdapter,
} from "@/lib/integrations/monday-sync";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    return NextResponse.json({ importId, type });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
