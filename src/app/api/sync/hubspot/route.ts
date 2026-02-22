import { NextRequest, NextResponse } from "next/server";
import { requireRole, logAudit } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHubSpotAdapter } from "@/lib/integrations/hubspot-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as
    | "deals"
    | "companies"
    | "contacts"
    | null;

  if (!type || !["deals", "companies", "contacts"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid sync type. Must be: deals, companies, or contacts" },
      { status: 400 }
    );
  }

  // Verify HubSpot is configured
  const config = await db.integrationConfig.findUnique({
    where: { provider: "hubspot" },
  });

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "HubSpot integration is not enabled" },
      { status: 400 }
    );
  }

  try {
    const adapter = createHubSpotAdapter(type);
    const importId = await syncEngine.run(adapter, "full", "manual");

    await logAudit({ action: "sync_triggered", userId: session.userId, entity: "sync", entityId: importId, details: `Triggered HubSpot sync: ${type}` });

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
