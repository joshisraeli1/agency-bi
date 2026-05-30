/**
 * CLI wrapper for the Xero P&L Total Income sync. Shares its implementation
 * with the in-app Resync button via src/lib/sync/refresh-syncs.ts.
 *
 * Usage:  npx tsx scripts/sync-xero-pnl.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

(async () => {
  const { syncXeroPnl } = await import("../src/lib/sync/refresh-syncs");
  const r = await syncXeroPnl();
  console.log(`Xero P&L synced: ${r.months} months from "${r.tenant}" (removed ${r.removed} stale records).`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
