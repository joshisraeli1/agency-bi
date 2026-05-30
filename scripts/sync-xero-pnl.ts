/**
 * Sync Xero Profit & Loss "Total Income" (actual revenue, accrual basis) into
 * FinancialRecord(source="xero") so the Xero revenue charts reflect the real
 * P&L revenue line instead of invoice/bank-transaction-derived figures.
 *
 * Stores one record per month on a synthetic "Xero P&L" client (it has no
 * HubSpot deal/company, so it's excluded from client lists and HubSpot revenue
 * but feeds the source="xero" revenue series). Replaces any prior invoice-
 * derived xero revenue records so the chart shows the P&L total exactly.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

const SYNTH_CLIENT_NAME = "Xero P&L (Total Income)";
const PNL_CATEGORY = "xero_pnl_income";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { decryptJson, encryptJson } = await import("../src/lib/encryption");
  const { fetchProfitAndLoss, refreshToken } = await import("../src/lib/integrations/xero");

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  // 1. Load + (if needed) refresh the Xero token
  const cfgRow = await db.integrationConfig.findUnique({ where: { provider: "xero" } });
  if (!cfgRow || cfgRow.configJson === "{}") throw new Error("Xero not connected");
  let cfg = decryptJson<{ accessToken: string; refreshToken: string; tenantId: string; tenantName?: string; expiresAt?: number }>(cfgRow.configJson);

  if (cfg.expiresAt && Date.now() > cfg.expiresAt - 60_000) {
    console.log("Refreshing Xero token...");
    const r = await refreshToken(cfg.refreshToken);
    cfg = { ...cfg, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: Date.now() + r.expiresIn * 1000 };
    await db.integrationConfig.update({ where: { provider: "xero" }, data: { configJson: encryptJson(cfg) } });
  }

  // 2. Fetch monthly P&L Total Income (~24 months)
  const pnl = await fetchProfitAndLoss(cfg.accessToken, cfg.tenantId, 11);
  console.log(`Fetched ${pnl.length} months of P&L Total Income from "${cfg.tenantName}"`);
  for (const m of pnl) console.log(`   ${m.month}: $${Math.round(m.totalIncome).toLocaleString()}`);

  // 3. Ensure the synthetic P&L client exists
  let synth = await db.client.findFirst({ where: { name: SYNTH_CLIENT_NAME, source: "xero" } });
  if (!synth) {
    synth = await db.client.create({ data: { name: SYNTH_CLIENT_NAME, source: "xero", status: "active" } });
    console.log("Created synthetic Xero P&L client");
  }

  // 4. Replace any prior xero revenue records (invoice-derived) so the chart
  //    shows the P&L total only — no double counting.
  const removed = await db.financialRecord.deleteMany({
    where: { source: "xero", type: { in: ["retainer", "project"] }, NOT: { clientId: synth.id } },
  });
  if (removed.count) console.log(`Removed ${removed.count} prior (invoice-derived) xero revenue records`);

  // 5. Upsert one P&L record per month
  for (const m of pnl) {
    await db.financialRecord.upsert({
      where: { clientId_month_type_category: { clientId: synth.id, month: m.month, type: "retainer", category: PNL_CATEGORY } },
      create: { clientId: synth.id, month: m.month, type: "retainer", category: PNL_CATEGORY, amount: m.totalIncome, source: "xero", description: "Xero P&L Total Income" },
      update: { amount: m.totalIncome },
    });
  }
  console.log(`\nUpserted ${pnl.length} monthly P&L revenue records. Done.`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
