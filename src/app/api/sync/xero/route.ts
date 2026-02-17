import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createXeroAdapter } from "@/lib/integrations/xero-sync";
import { syncEngine } from "@/lib/sync/engine";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as
    | "invoices"
    | "expenses"
    | "contacts"
    | null;

  if (!type || !["invoices", "expenses", "contacts"].includes(type)) {
    return NextResponse.json(
      { error: "Invalid sync type. Must be: invoices, expenses, or contacts" },
      { status: 400 }
    );
  }

  // Verify Xero is configured
  const config = await db.integrationConfig.findUnique({
    where: { provider: "xero" },
  });

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "Xero integration is not enabled" },
      { status: 400 }
    );
  }

  try {
    const adapter = createXeroAdapter(type);
    const importId = await syncEngine.run(adapter, "full", "manual");

    return NextResponse.json({ importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed to start";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
