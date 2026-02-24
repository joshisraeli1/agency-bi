/**
 * Merge duplicate Client records caused by HubSpot creating one Client per deal.
 *
 * Strategy:
 *   1. Monday clients (with mondayItemId) are the canonical records
 *   2. HubSpot-only clients whose name matches a Monday client prefix get merged
 *   3. Financial records, time entries, deliverables, etc. are re-linked to the primary
 *   4. Duplicate records are deleted
 *   5. Source field is fixed for clients with hubspotDealId
 *
 * Usage: npx tsx scripts/merge-duplicate-clients.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: url });
const db = new PrismaClient({ adapter });

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/-/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompanyName(dealName: string): string {
  // Strip common HubSpot deal suffixes to get the core company name
  // Handles both "Company - Suffix" and "Company Suffix" patterns
  return dealName
    .replace(/\s*[-–—]\s*(paid content|recurring content|new deal|one[- ]off content|ongoing|content delivery|content|ads?\s*management|ads?\s*mgmt|social media|organic socials|ad creative|upsell|round\s*\d+|batch\s*\d+|website|xmas campaign)$/i, "")
    .replace(/\s*\((ads?\s*management|ads?\s*mgmt|sm|content delivery|content|social media|organic socials)\)$/i, "")
    .replace(/\s+(paid content|recurring content|new deal|one[- ]off content|ongoing|content delivery|ads?\s*management|ads?\s*mgmt|social media|organic socials|ad creative|upsell|round\s*\d+|batch\s*\d+|website|xmas campaign)$/i, "")
    .trim();
}

function getServiceType(dealName: string, companyName: string): string | null {
  // Extract the service type suffix from the deal name
  const suffix = dealName.replace(companyName, "").trim();
  const cleaned = suffix.replace(/^[-–—\s(]+|[)\s]+$/g, "").trim();
  return cleaned || null;
}

async function main() {
  console.log("🔗 Connecting to database...\n");

  // Fetch all non-prospect clients
  const allClients = await db.client.findMany({
    where: { status: { not: "prospect" } },
    select: {
      id: true,
      name: true,
      source: true,
      status: true,
      hubspotDealId: true,
      mondayItemId: true,
      startDate: true,
      endDate: true,
      retainerValue: true,
      industry: true,
      website: true,
      dealStage: true,
    },
    orderBy: { name: "asc" },
  });

  // Split into Monday clients (canonical) and HubSpot-only clients
  const mondayClients = allClients.filter(c => c.mondayItemId);
  const hubspotOnlyClients = allClients.filter(c => !c.mondayItemId && c.hubspotDealId);

  console.log(`Monday clients (canonical): ${mondayClients.length}`);
  console.log(`HubSpot-only clients: ${hubspotOnlyClients.length}`);

  // Build normalized name index for Monday clients
  const mondayByNorm = new Map<string, typeof mondayClients[0]>();
  for (const mc of mondayClients) {
    mondayByNorm.set(normalizeForMatch(mc.name), mc);
  }

  let merged = 0;
  let unmatched = 0;

  for (const hsClient of hubspotOnlyClients) {
    // Try to find matching Monday client
    const extracted = extractCompanyName(hsClient.name);
    const normExtracted = normalizeForMatch(extracted);
    const normFull = normalizeForMatch(hsClient.name);

    let match: typeof mondayClients[0] | undefined;

    // Strategy 1: exact normalized name match
    match = mondayByNorm.get(normFull);

    // Strategy 2: extracted company name match
    if (!match) {
      match = mondayByNorm.get(normExtracted);
    }

    // Strategy 3: Monday client name starts with extracted name (or vice versa)
    if (!match) {
      for (const mc of mondayClients) {
        const normMc = normalizeForMatch(mc.name);
        if (
          (normExtracted.length >= 4 && normMc.startsWith(normExtracted)) ||
          (normMc.length >= 4 && normExtracted.startsWith(normMc))
        ) {
          match = mc;
          break;
        }
      }
    }

    // Strategy 4: first significant word match (must be 5+ chars to avoid false positives)
    if (!match) {
      const firstWord = normExtracted.split(" ")[0];
      if (firstWord && firstWord.length >= 5) {
        for (const mc of mondayClients) {
          const mcFirst = normalizeForMatch(mc.name).split(" ")[0];
          if (mcFirst === firstWord) {
            match = mc;
            break;
          }
        }
      }
    }

    if (!match) {
      unmatched++;
      continue;
    }

    const serviceType = getServiceType(hsClient.name, extracted);
    console.log(`  Merging "${hsClient.name}" → "${match.name}"${serviceType ? ` [${serviceType}]` : ""}`);

    // Move all related records to the primary client
    const primaryId = match.id;
    const dupeId = hsClient.id;

    // Move financial records one-by-one (handle unique constraint conflicts)
    const dupeFinancials = await db.financialRecord.findMany({ where: { clientId: dupeId } });
    let movedFinancialCount = 0;
    for (const f of dupeFinancials) {
      try {
        await db.financialRecord.update({
          where: { id: f.id },
          data: { clientId: primaryId },
        });
        movedFinancialCount++;
      } catch {
        // Conflict: primary already has this month/type/category — keep existing, delete dupe
        await db.financialRecord.delete({ where: { id: f.id } });
      }
    }

    // Move time entries
    const movedTime = await db.timeEntry.updateMany({
      where: { clientId: dupeId },
      data: { clientId: primaryId },
    });

    // Move deliverables
    const movedDeliverables = await db.deliverable.updateMany({
      where: { clientId: dupeId },
      data: { clientId: primaryId },
    });

    // Move communication logs
    await db.communicationLog.updateMany({
      where: { clientId: dupeId },
      data: { clientId: primaryId },
    });

    // Move meeting logs
    await db.meetingLog.updateMany({
      where: { clientId: dupeId },
      data: { clientId: primaryId },
    });

    // Move client assignments (skip if already exists to avoid unique constraint)
    const existingAssignments = await db.clientAssignment.findMany({
      where: { clientId: dupeId },
    });
    for (const a of existingAssignments) {
      try {
        await db.clientAssignment.update({
          where: { id: a.id },
          data: { clientId: primaryId },
        });
      } catch {
        // Unique constraint — assignment already exists on primary, delete dupe
        await db.clientAssignment.delete({ where: { id: a.id } });
      }
    }

    // Create alias for the old name
    try {
      await db.clientAlias.create({
        data: {
          clientId: primaryId,
          alias: hsClient.name,
          source: "hubspot",
          externalId: hsClient.hubspotDealId,
        },
      });
    } catch {
      // Alias already exists
    }

    // If primary doesn't have hubspotDealId, transfer it from the merged record
    if (!match.hubspotDealId && hsClient.hubspotDealId) {
      await db.client.update({
        where: { id: dupeId },
        data: { hubspotDealId: null },
      });
      await db.client.update({
        where: { id: primaryId },
        data: { hubspotDealId: hsClient.hubspotDealId },
      });
    }

    // Copy startDate/endDate if primary is missing them
    if (!match.startDate && hsClient.startDate) {
      await db.client.update({
        where: { id: primaryId },
        data: { startDate: hsClient.startDate },
      });
    }

    // Clear unique fields on dupe before deletion to avoid constraint issues
    await db.client.update({
      where: { id: dupeId },
      data: { hubspotDealId: null, hubspotCompanyId: null, xeroContactId: null },
    });

    // Delete any remaining aliases pointing to the dupe
    await db.clientAlias.deleteMany({ where: { clientId: dupeId } });

    // Delete any divisions on the dupe
    await db.division.deleteMany({ where: { clientId: dupeId } });

    // Delete the duplicate client
    await db.client.delete({ where: { id: dupeId } });

    if (movedFinancialCount > 0 || movedTime.count > 0 || movedDeliverables.count > 0) {
      console.log(`    Moved: ${movedFinancialCount} financials, ${movedTime.count} time entries, ${movedDeliverables.count} deliverables`);
    }

    merged++;
  }

  console.log(`\n✅ Pass 1: Merged ${merged} HubSpot-only → Monday clients`);
  if (unmatched > 0) {
    console.log(`   ${unmatched} HubSpot-only clients had no Monday match`);
  }

  // === Pass 2: Merge HubSpot-to-HubSpot duplicates ===
  // For remaining clients, group by normalized extracted company name and merge
  console.log("\n--- Pass 2: HubSpot-to-HubSpot dedup ---");
  const remaining = await db.client.findMany({
    where: { status: { not: "prospect" } },
    select: {
      id: true, name: true, source: true, hubspotDealId: true, mondayItemId: true,
      startDate: true, endDate: true, retainerValue: true,
    },
    orderBy: { name: "asc" },
  });

  // Group by normalized company name
  const companyGroups = new Map<string, typeof remaining>();
  for (const c of remaining) {
    const extracted = extractCompanyName(c.name);
    const key = normalizeForMatch(extracted);
    const arr = companyGroups.get(key) || [];
    arr.push(c);
    companyGroups.set(key, arr);
  }

  let merged2 = 0;
  for (const [, group] of companyGroups) {
    if (group.length <= 1) continue;

    // Pick the primary: prefer mondayItemId, then shortest name, then first
    group.sort((a, b) => {
      if (a.mondayItemId && !b.mondayItemId) return -1;
      if (!a.mondayItemId && b.mondayItemId) return 1;
      return a.name.length - b.name.length;
    });
    const primary = group[0];
    const dupes = group.slice(1);

    for (const dupe of dupes) {
      const serviceType = getServiceType(dupe.name, extractCompanyName(dupe.name));
      console.log(`  Merging "${dupe.name}" → "${primary.name}"${serviceType ? ` [${serviceType}]` : ""}`);

      // Move financial records one-by-one (handle unique constraint conflicts)
      const dupeFinRecs = await db.financialRecord.findMany({ where: { clientId: dupe.id } });
      let mfCount = 0;
      for (const f of dupeFinRecs) {
        try {
          await db.financialRecord.update({ where: { id: f.id }, data: { clientId: primary.id } });
          mfCount++;
        } catch {
          await db.financialRecord.delete({ where: { id: f.id } });
        }
      }
      const mt = await db.timeEntry.updateMany({ where: { clientId: dupe.id }, data: { clientId: primary.id } });
      const md = await db.deliverable.updateMany({ where: { clientId: dupe.id }, data: { clientId: primary.id } });
      await db.communicationLog.updateMany({ where: { clientId: dupe.id }, data: { clientId: primary.id } });
      await db.meetingLog.updateMany({ where: { clientId: dupe.id }, data: { clientId: primary.id } });

      const dupeAssignments = await db.clientAssignment.findMany({ where: { clientId: dupe.id } });
      for (const a of dupeAssignments) {
        try {
          await db.clientAssignment.update({ where: { id: a.id }, data: { clientId: primary.id } });
        } catch {
          await db.clientAssignment.delete({ where: { id: a.id } });
        }
      }

      try {
        await db.clientAlias.create({
          data: { clientId: primary.id, alias: dupe.name, source: "hubspot", externalId: dupe.hubspotDealId },
        });
      } catch { /* alias exists */ }

      if (!primary.hubspotDealId && dupe.hubspotDealId) {
        await db.client.update({ where: { id: dupe.id }, data: { hubspotDealId: null } });
        await db.client.update({ where: { id: primary.id }, data: { hubspotDealId: dupe.hubspotDealId } });
      }
      if (!primary.startDate && dupe.startDate) {
        await db.client.update({ where: { id: primary.id }, data: { startDate: dupe.startDate } });
      }

      await db.client.update({ where: { id: dupe.id }, data: { hubspotDealId: null, hubspotCompanyId: null, xeroContactId: null } });
      await db.clientAlias.deleteMany({ where: { clientId: dupe.id } });
      await db.division.deleteMany({ where: { clientId: dupe.id } });
      await db.client.delete({ where: { id: dupe.id } });

      if (mfCount > 0 || mt.count > 0 || md.count > 0) {
        console.log(`    Moved: ${mfCount} financials, ${mt.count} time entries, ${md.count} deliverables`);
      }
      merged2++;
    }
  }

  console.log(`\n✅ Pass 2: Merged ${merged2} additional duplicates`);

  // Fix source field: clients with hubspotDealId should show source "hubspot"
  const fixedSource = await db.client.updateMany({
    where: {
      hubspotDealId: { not: null },
      source: "monday",
    },
    data: { source: "hubspot" },
  });
  console.log(`\n🔧 Fixed source to "hubspot" for ${fixedSource.count} clients`);

  // Final counts
  const finalTotal = await db.client.count({ where: { status: { not: "prospect" } } });
  const finalActive = await db.client.count({ where: { status: "active" } });
  console.log(`\n📊 Final: ${finalTotal} non-prospect clients (${finalActive} active)`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
