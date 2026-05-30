/**
 * CLI wrapper for the HubSpot deals sync (populates the HubspotDeal table that
 * drives revenue tiles + new/churn). Shares its implementation with the in-app
 * Resync button via src/lib/sync/refresh-syncs.ts.
 *
 * Usage:  npx tsx scripts/sync-hubspot-deals.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

(async () => {
  const { syncHubspotDeals } = await import("../src/lib/sync/refresh-syncs");
  console.log("Syncing HubSpot deals…");
  const r = await syncHubspotDeals();
  console.log(`Done. ${r.inPipeline} deals in Content Machine, upserted ${r.upserted}.`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
