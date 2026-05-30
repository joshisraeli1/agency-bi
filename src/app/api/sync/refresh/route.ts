import { NextResponse } from "next/server";
import { requireRole, logAudit } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncHubspotDeals, syncXeroPnl } from "@/lib/sync/refresh-syncs";

// The HubSpot deal fetch can take a while (paginates all deals), so allow a
// long execution window.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const result: {
    hubspot?: { upserted: number; inPipeline: number };
    xero?: { months: number; tenant?: string };
    errors: string[];
  } = { errors: [] };

  // HubSpot deals
  try {
    const h = await syncHubspotDeals();
    result.hubspot = { upserted: h.upserted, inPipeline: h.inPipeline };
    await db.integrationConfig.updateMany({
      where: { provider: "hubspot" },
      data: { lastSyncAt: new Date(), lastSyncStatus: "success" },
    });
  } catch (e) {
    result.errors.push(`HubSpot: ${e instanceof Error ? e.message : "sync failed"}`);
  }

  // Xero P&L
  try {
    const x = await syncXeroPnl();
    result.xero = { months: x.months, tenant: x.tenant };
    await db.integrationConfig.updateMany({
      where: { provider: "xero" },
      data: { lastSyncAt: new Date(), lastSyncStatus: "success" },
    });
  } catch (e) {
    result.errors.push(`Xero: ${e instanceof Error ? e.message : "sync failed"}`);
  }

  await logAudit({
    action: "sync_triggered",
    userId: auth.session.userId,
    entity: "sync",
    details: `Manual resync — hubspot:${result.hubspot?.upserted ?? "err"} xero:${result.xero?.months ?? "err"}`,
  });

  const status = result.errors.length === 2 ? 500 : 200;
  return NextResponse.json(result, { status });
}
