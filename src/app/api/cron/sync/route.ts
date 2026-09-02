import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncHubspotActivity, syncHubspotDeals, syncXeroPnl } from "@/lib/sync/refresh-syncs";

// Scheduled data refresh (Vercel Cron). Runs the same syncs as the in-app
// "Resync data" button — HubSpot deals (revenue tiles + new/churn) and the
// Xero P&L — so the dashboard never goes stale between manual resyncs.
//
// Vercel Cron invokes this as a GET and attaches `Authorization: Bearer
// $CRON_SECRET` when the CRON_SECRET env var is set. We reject anything without
// the matching secret so the endpoint can't be triggered by the public.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: {
    hubspot?: { upserted: number; inPipeline: number; removed: number };
    xero?: { months: number; tenant?: string };
    activity?: { calls: number; emails: number };
    errors: string[];
  } = { errors: [] };

  try {
    const h = await syncHubspotDeals();
    result.hubspot = { upserted: h.upserted, inPipeline: h.inPipeline, removed: h.removed };
    await db.integrationConfig.updateMany({
      where: { provider: "hubspot" },
      data: { lastSyncAt: new Date(), lastSyncStatus: "success" },
    });
  } catch (e) {
    result.errors.push(`HubSpot: ${e instanceof Error ? e.message : "sync failed"}`);
  }

  // HubSpot sales activity (calls + emails). Isolated from the deal sync so an
  // activity failure never blocks the revenue refresh.
  try {
    const a = await syncHubspotActivity();
    result.activity = { calls: a.calls, emails: a.emails };
  } catch (e) {
    result.errors.push(`HubSpot activity: ${e instanceof Error ? e.message : "sync failed"}`);
  }

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

  const status = result.errors.length === 2 ? 500 : 200;
  return NextResponse.json(result, { status });
}
