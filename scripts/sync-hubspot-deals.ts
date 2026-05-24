/**
 * HubSpot Deals Sync — populates the HubspotDeal table with raw deal-level
 * records including owner, createdate, and lifecycle dates. This is the
 * source-of-truth for owner-scoped sales analytics (e.g. Michael's tab).
 *
 * Usage:  npx tsx scripts/sync-hubspot-deals.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
const HUBSPOT_API = "https://api.hubapi.com";
const CONTENT_MACHINE_PIPELINE = "32895309";

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

function mapDealStage(stageId: string): string {
  const label = STAGE_LABELS[stageId] ?? "";
  const l = label.toLowerCase();
  if (l.includes("closed won")) return "closed_won";
  if (l.includes("contract out")) return "proposal";
  if (l.includes("very warm")) return "negotiation";
  if (l.includes("interested")) return "qualified";
  if (l.includes("churned")) return "churned";
  if (l.includes("backburner") || l.includes("re-engage")) return "backburner";
  if (l.includes("legacy")) return "legacy";
  return "prospect";
}

// ---------------------------------------------------------------------------
// HubSpot helpers
// ---------------------------------------------------------------------------

interface HubSpotResult {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotPage {
  results: HubSpotResult[];
  paging?: { next?: { after: string } };
}

interface HubSpotOwner {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

async function hubspotGet<T>(path: string): Promise<T> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllDeals(): Promise<HubSpotResult[]> {
  const items: HubSpotResult[] = [];
  let after: string | undefined;
  const properties = [
    "dealname",
    "amount",
    "amount__excl_gst_",
    "dealstage",
    "pipeline",
    "createdate",
    "closedate",
    "start_date",
    "churn_date",
    "hubspot_owner_id",
    "content_package_type",
    "industry_type",
  ].join(",");

  do {
    const path = `/crm/v3/objects/deals?limit=100&properties=${properties}${after ? `&after=${after}` : ""}`;
    const page = await hubspotGet<HubSpotPage>(path);
    items.push(...page.results);
    after = page.paging?.next?.after;
    process.stdout.write(`\r   Fetched ${items.length} deals`);
  } while (after);
  process.stdout.write("\n");
  return items;
}

async function fetchAllOwners(): Promise<HubSpotOwner[]> {
  const items: HubSpotOwner[] = [];
  let after: string | undefined;
  do {
    const path = `/crm/v3/owners?limit=100${after ? `&after=${after}` : ""}`;
    const page = await hubspotGet<{ results: HubSpotOwner[]; paging?: { next?: { after: string } } }>(path);
    items.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  return items;
}

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

function createDb(): PrismaClient {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!HUBSPOT_TOKEN) {
    console.error("❌ Set HUBSPOT_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  const db = createDb();

  try {
    console.log("👥 Fetching HubSpot owners...");
    const owners = await fetchAllOwners();
    const ownerNameById = new Map<string, string>();
    for (const o of owners) {
      const name = [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || o.id;
      ownerNameById.set(o.id, name);
    }
    console.log(`   Found ${owners.length} owners`);

    // Find Michael for visibility
    const michael = owners.find((o) => {
      const full = `${o.firstName ?? ""} ${o.lastName ?? ""}`.toLowerCase();
      return full.includes("michael") && full.includes("shenfield");
    });
    if (michael) {
      console.log(`   ✅ Found Michael Shenfield: ownerId=${michael.id}`);
    } else {
      console.log(`   ⚠️  Michael Shenfield NOT found among HubSpot owners`);
    }

    console.log("\n💼 Fetching HubSpot deals (Content Machine pipeline)...");
    const allDeals = await fetchAllDeals();
    const relevant = allDeals.filter((d) => d.properties.pipeline === CONTENT_MACHINE_PIPELINE);
    console.log(`   Total deals: ${allDeals.length}, in Content Machine: ${relevant.length}`);

    // Load Client mappings for FK
    const clients = await db.client.findMany({
      select: { id: true, hubspotDealId: true },
      where: { hubspotDealId: { not: null } },
    });
    const clientByDealId = new Map(clients.map((c) => [c.hubspotDealId!, c.id]));

    let upserted = 0;
    let michaelCount = 0;

    for (const deal of relevant) {
      const props = deal.properties;
      const stageId = props.dealstage ?? "";
      const ownerId = props.hubspot_owner_id ?? null;
      const ownerName = ownerId ? ownerNameById.get(ownerId) ?? null : null;

      const data = {
        id: deal.id,
        clientId: clientByDealId.get(deal.id) ?? null,
        name: props.dealname ?? "(unnamed)",
        amount: props.amount ? parseFloat(props.amount) : null,
        amountExGst: props.amount__excl_gst_ ? parseFloat(props.amount__excl_gst_) : null,
        ownerId,
        ownerName,
        stage: mapDealStage(stageId),
        stageLabel: STAGE_LABELS[stageId] ?? stageId,
        pipeline: "Content Machine",
        createDate: parseDate(props.createdate),
        startDate: parseDate(props.start_date),
        closeDate: parseDate(props.closedate),
        churnDate: parseDate(props.churn_date),
        contentPackageType: props.content_package_type ?? null,
        industry: props.industry_type ?? null,
        lastSyncedAt: new Date(),
      };

      await db.hubspotDeal.upsert({
        where: { id: deal.id },
        create: data,
        update: data,
      });
      upserted++;
      if (michael && ownerId === michael.id) michaelCount++;
    }

    console.log(`\n🎉 Deals sync complete!`);
    console.log(`   Upserted: ${upserted}`);
    if (michael) {
      console.log(`   Owned by Michael Shenfield: ${michaelCount}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
