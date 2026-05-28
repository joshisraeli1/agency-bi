/**
 * Xero Repeating Invoices Sync — pulls templates from /RepeatingInvoices and
 * upserts them into the XeroRepeatingInvoice table. Source-of-truth for the
 * HubSpot↔Xero reconciliation engine.
 *
 * Usage:  npx tsx scripts/sync-xero-repeating.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { XeroRepeatingInvoice } from "../src/lib/integrations/xero";

// Lazy-loaded so dotenv.config() can populate ENCRYPTION_KEY before
// src/lib/encryption is evaluated.
async function loadEncryption() {
  return await import("../src/lib/encryption");
}
async function loadXero() {
  return await import("../src/lib/integrations/xero");
}

interface XeroConfig {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  tenantName?: string;
  expiresAt?: number;
}

function createDb(): PrismaClient {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

function parseXeroDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  // Xero returns "/Date(1234567890000+0000)/" — extract epoch
  const epochMatch = value.match(/\/Date\((\d+)/);
  if (epochMatch) {
    return new Date(parseInt(epochMatch[1], 10));
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

async function getXeroConfig(db: PrismaClient): Promise<XeroConfig> {
  const { decryptJson, encryptJson } = await loadEncryption();
  const { refreshToken } = await loadXero();

  const config = await db.integrationConfig.findUnique({
    where: { provider: "xero" },
  });
  if (!config || !config.configJson || config.configJson === "{}") {
    throw new Error("Xero integration is not configured — connect via /integrations/xero");
  }

  const decrypted = decryptJson<XeroConfig>(config.configJson);
  if (!decrypted.accessToken || !decrypted.tenantId) {
    throw new Error("Xero access token or tenant ID missing");
  }

  if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
    if (!decrypted.refreshToken) {
      throw new Error("Xero refresh token missing — please re-authenticate");
    }
    console.log("🔄 Access token expired, refreshing...");
    const refreshed = await refreshToken(decrypted.refreshToken);
    const updated: XeroConfig = {
      ...decrypted,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000,
    };
    await db.integrationConfig.update({
      where: { provider: "xero" },
      data: { configJson: encryptJson(updated as unknown as Record<string, unknown>) },
    });
    return updated;
  }

  return decrypted;
}

async function main() {
  const db = createDb();

  try {
    console.log("🔑 Loading Xero credentials...");
    const config = await getXeroConfig(db);
    console.log(`   Tenant: ${config.tenantName ?? config.tenantId}`);

    const { fetchRepeatingInvoices } = await loadXero();
    console.log("\n📄 Fetching repeating invoices from Xero...");
    const repeating = await fetchRepeatingInvoices(config.accessToken, config.tenantId);
    console.log(`   Found ${repeating.length} repeating invoice templates`);

    let upserted = 0;
    let accrecCount = 0;
    let authorisedCount = 0;

    for (const r of repeating as XeroRepeatingInvoice[]) {
      const lineDesc = r.LineItems?.[0]?.Description ?? null;
      const data = {
        id: r.RepeatingInvoiceID,
        xeroContactId: r.Contact?.ContactID ?? null,
        xeroContactName: r.Contact?.Name ?? null,
        status: r.Status ?? null,
        type: r.Type ?? null,
        scheduleUnit: r.Schedule?.Unit ?? null,
        scheduleInterval: r.Schedule?.Period ?? null,
        nextScheduledDate: parseXeroDate(r.Schedule?.NextScheduledDate ?? r.Schedule?.NextScheduledDateString),
        subTotal: r.SubTotal ?? null,
        totalTax: r.TotalTax ?? null,
        total: r.Total ?? null,
        currencyCode: r.CurrencyCode ?? null,
        reference: r.Reference ?? null,
        lineItemDescription: lineDesc,
        lastSyncedAt: new Date(),
      };

      await db.xeroRepeatingInvoice.upsert({
        where: { id: r.RepeatingInvoiceID },
        create: data,
        update: data,
      });

      upserted++;
      if (r.Type === "ACCREC") accrecCount++;
      if (r.Status === "AUTHORISED") authorisedCount++;
    }

    console.log(`\n🎉 Sync complete!`);
    console.log(`   Upserted: ${upserted}`);
    console.log(`   ACCREC (customer invoices): ${accrecCount}`);
    console.log(`   AUTHORISED (active): ${authorisedCount}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err.message ?? err);
  process.exit(1);
});
