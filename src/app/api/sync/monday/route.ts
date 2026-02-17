import { NextRequest, NextResponse } from "next/server";
import { syncEngine } from "@/lib/sync/engine";
import {
  MondayTimeTrackingSyncAdapter,
  MondayCreativesSyncAdapter,
} from "@/lib/integrations/monday-sync";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (!type || !["time_tracking", "creatives"].includes(type)) {
    return NextResponse.json(
      { error: "Query parameter 'type' must be 'time_tracking' or 'creatives'" },
      { status: 400 }
    );
  }

  try {
    const adapter =
      type === "time_tracking"
        ? new MondayTimeTrackingSyncAdapter()
        : new MondayCreativesSyncAdapter();

    const importId = await syncEngine.run(adapter, "full", "manual");

    return NextResponse.json({ importId, type });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
