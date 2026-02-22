/**
 * Direct HubSpot Sync Script
 *
 * Usage:  npx tsx scripts/sync-hubspot.ts
 *
 * Pulls deals + companies from HubSpot and enriches client records.
 * Focuses on "Content Machine" and "Swan Studio US" pipelines.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
const HUBSPOT_API = "https://api.hubapi.com";

// Pipelines we care about (US pipeline excluded — irrelevant)
const PIPELINE_IDS = {
  contentMachine: "32895309",
};

// Stage ID → label mapping for Content Machine
const STAGE_LABELS: Record<string, string> = {
  "73380170": "Backburner",
  "98549656": "Re-engage in future",
  "73380171": "Interested",
  "73380172": "Very Warm",
  "143813234": "Contract out",
  "98068645": "Closed Won",
  "1086044538": "Churned but still active",
  "73380176": "Legacy Urban Swan Sales",
  "114291350": "Churned",
};

// ---------------------------------------------------------------------------
// HubSpot API helpers
// ---------------------------------------------------------------------------

async function hubspotGet<T>(path: string): Promise<T> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HubSpot ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface HubSpotResult {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotPage {
  results: HubSpotResult[];
  paging?: { next?: { after: string } };
}

async function fetchAll(objectType: string, properties: string[]): Promise<HubSpotResult[]> {
  const items: HubSpotResult[] = [];
  let after: string | undefined;
  const props = properties.join(",");

  do {
    const url = `/${objectType}?limit=100&properties=${props}${after ? `&after=${after}` : ""}`;
    const page = await hubspotGet<HubSpotPage>(`/crm/v3/objects${url}`);
    items.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  return items;
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

function createDb(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  if (url.startsWith("postgresql:") || url.startsWith("postgres:")) {
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  const path = require("path");
  const dbPath = url.startsWith("file:")
    ? path.resolve(process.cwd(), url.replace("file:", "").replace("./", ""))
    : path.resolve(process.cwd(), "dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Map deal stage → app deal stage
// ---------------------------------------------------------------------------

function mapDealStage(stageId: string): string {
  const label = STAGE_LABELS[stageId] ?? "unknown";
  const l = label.toLowerCase();
  if (l.includes("closed won") || l.includes("signed")) return "closed_won";
  if (l.includes("contract out")) return "proposal";
  if (l.includes("very warm")) return "negotiation";
  if (l.includes("interested")) return "qualified";
  if (l.includes("churned")) return "churned";
  if (l.includes("backburner") || l.includes("re-engage")) return "backburner";
  if (l.includes("legacy")) return "legacy";
  return "prospect";
}

// ---------------------------------------------------------------------------
// Sync Deals
// ---------------------------------------------------------------------------

async function syncDeals(db: PrismaClient) {
  console.log("\n💰 Fetching HubSpot deals...");

  const deals = await fetchAll("deals", [
    "dealname", "amount", "dealstage", "pipeline", "closedate",
    "createdate", "hs_lastmodifieddate", "notes_last_updated",
  ]);

  // Filter to our pipelines
  const relevant = deals.filter(
    (d) => d.properties.pipeline === PIPELINE_IDS.contentMachine
  );

  console.log(`   Found ${deals.length} total deals, ${relevant.length} in Content Machine / US pipeline`);

  // Load existing clients for matching
  const clients = await db.client.findMany({
    select: { id: true, name: true, hubspotDealId: true },
  });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));
  const clientByDealId = new Map(
    clients.filter((c) => c.hubspotDealId).map((c) => [c.hubspotDealId!, c])
  );

  let matched = 0;
  let created = 0;
  let skipped = 0;

  for (const deal of relevant) {
    const dealName = deal.properties.dealname ?? "";
    const stageId = deal.properties.dealstage ?? "";
    const amount = deal.properties.amount ? parseFloat(deal.properties.amount) : null;
    const closeDate = deal.properties.closedate;
    const stage = mapDealStage(stageId);
    const stageLabel = STAGE_LABELS[stageId] ?? stageId;
    const pipeline = "AU";

    // Try to match to existing client
    let client = clientByDealId.get(deal.id);
    if (!client) {
      // Try name match
      const nameLower = dealName.toLowerCase();
      client = clientByName.get(nameLower);

      // Fuzzy: try if deal name contains a client name or vice versa
      if (!client) {
        for (const [cName, c] of clientByName) {
          if (nameLower.includes(cName) || cName.includes(nameLower)) {
            client = c;
            break;
          }
        }
      }
    }

    if (client) {
      // Update existing client with HubSpot data
      await db.client.update({
        where: { id: client.id },
        data: {
          hubspotDealId: deal.id,
          dealStage: `${stageLabel} (${pipeline})`,
          notes: await appendNote(db, client.id, `HubSpot: ${stageLabel} | ${pipeline} pipeline${amount ? ` | $${amount}` : ""}`),
        },
      });
      matched++;
    } else {
      // Create new client from deal
      await db.client.create({
        data: {
          name: dealName,
          status: stage === "closed_won" ? "active" : stage === "churned" ? "churned" : "prospect",
          hubspotDealId: deal.id,
          dealStage: `${stageLabel} (${pipeline})`,
          retainerValue: amount,
          source: "hubspot",
          notes: `HubSpot Deal | Pipeline: ${pipeline} | Stage: ${stageLabel}${closeDate ? ` | Close: ${closeDate.slice(0, 10)}` : ""}`,
        },
      });
      created++;
    }
  }

  console.log(`   ✅ Matched ${matched} to existing clients, created ${created} new, skipped ${skipped}`);
}

async function appendNote(db: PrismaClient, clientId: string, newNote: string): Promise<string> {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { notes: true } });
  const existing = client?.notes ?? "";
  // Don't duplicate
  if (existing.includes(newNote)) return existing;
  return existing ? `${existing}\n${newNote}` : newNote;
}

// ---------------------------------------------------------------------------
// Sync Companies
// ---------------------------------------------------------------------------

async function syncCompanies(db: PrismaClient) {
  console.log("\n🏢 Fetching HubSpot companies...");

  const companies = await fetchAll("companies", [
    "name", "domain", "industry", "city", "country",
    "annualrevenue", "lifecyclestage", "description",
  ]);

  console.log(`   Found ${companies.length} companies`);

  // Load existing clients
  const clients = await db.client.findMany({
    select: { id: true, name: true, hubspotCompanyId: true, website: true, industry: true },
  });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));
  const clientByCompanyId = new Map(
    clients.filter((c) => c.hubspotCompanyId).map((c) => [c.hubspotCompanyId!, c])
  );

  let enriched = 0;
  let newCompanies = 0;

  for (const company of companies) {
    const name = company.properties.name ?? "";
    if (!name) continue;

    const domain = company.properties.domain;
    const industry = company.properties.industry;
    const city = company.properties.city;
    const country = company.properties.country;

    // Try to match
    let client = clientByCompanyId.get(company.id);
    if (!client) {
      const nameLower = name.toLowerCase();
      client = clientByName.get(nameLower);

      // Fuzzy match
      if (!client) {
        for (const [cName, c] of clientByName) {
          if (nameLower.includes(cName) || cName.includes(nameLower)) {
            client = c;
            break;
          }
        }
      }

      // Try domain match against existing website
      if (!client && domain) {
        for (const c of clients) {
          if (c.website && c.website.includes(domain)) {
            client = c;
            break;
          }
        }
      }
    }

    if (client) {
      // Enrich existing client
      const updates: Record<string, unknown> = {
        hubspotCompanyId: company.id,
      };
      if (!client.website && domain) updates.website = `https://${domain}`;
      if (!client.industry && industry) updates.industry = industry.replace(/_/g, " ").toLowerCase();

      await db.client.update({
        where: { id: client.id },
        data: updates,
      });
      enriched++;
    } else {
      // Only create if it looks like a real company (has a domain or industry)
      if (domain || industry) {
        // Check if already exists by domain
        if (domain) {
          const existingByDomain = await db.client.findFirst({
            where: { website: { contains: domain } },
          });
          if (existingByDomain) {
            await db.client.update({
              where: { id: existingByDomain.id },
              data: { hubspotCompanyId: company.id },
            });
            enriched++;
            continue;
          }
        }

        await db.client.create({
          data: {
            name,
            status: "prospect",
            hubspotCompanyId: company.id,
            website: domain ? `https://${domain}` : null,
            industry: industry?.replace(/_/g, " ").toLowerCase() ?? null,
            source: "hubspot",
            notes: [city, country].filter(Boolean).join(", ") || null,
          },
        });
        newCompanies++;
      }
    }
  }

  console.log(`   ✅ Enriched ${enriched} existing clients, created ${newCompanies} new from companies`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!HUBSPOT_TOKEN) {
    console.error("❌ Set HUBSPOT_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  console.log("🔗 Connecting to database...");
  const db = createDb();

  try {
    await syncDeals(db);
    await syncCompanies(db);

    // Summary
    const totalClients = await db.client.count();
    const hubspotClients = await db.client.count({ where: { hubspotDealId: { not: null } } });
    const hubspotCompanies = await db.client.count({ where: { hubspotCompanyId: { not: null } } });

    console.log(`\n🎉 HubSpot sync complete!`);
    console.log(`   Total clients: ${totalClients}`);
    console.log(`   With HubSpot deal: ${hubspotClients}`);
    console.log(`   With HubSpot company: ${hubspotCompanies}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
