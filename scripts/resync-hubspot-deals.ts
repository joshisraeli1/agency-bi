/**
 * Update client retainerValue from HubSpot "Amount (excl GST)" for Closed Won deals.
 * Sums ALL deals per client (matching by company ID, deal ID, or name).
 * Creates new clients for truly unmatched deals.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const PIPELINE_ID = process.env.HUBSPOT_PIPELINE_ID || "32895309";
const CLOSED_WON_STAGE = "98068645";
const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN!;

const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter: pgAdapter });

interface Deal {
  id: string;
  properties: {
    dealname: string;
    amount: string | null;
    amount__excl_gst_: string | null;
    dealstage: string | null;
    pipeline: string | null;
  };
  associations?: {
    companies?: { results: { id: string }[] };
  };
}

type ClientRow = {
  id: string;
  name: string;
  hubspotCompanyId: string | null;
  hubspotDealId: string | null;
  retainerValue: number | null;
  status: string;
};

/** Normalize a name for fuzzy matching: lowercase, strip suffixes, remove non-alpha */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*[-–]\s*(recurring content|content delivery|ads management|ads mgmt|content|ads|one-off campaign|contract extension|social mgmt|round \d+|photoshoot|tiktok|statics|double up|upgrade|uk|extension \d+)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function main() {
  // 1. Build client lookup maps — include ALL clients (not just those with dealId)
  const allClients = await db.client.findMany({
    select: { id: true, name: true, hubspotCompanyId: true, hubspotDealId: true, retainerValue: true, status: true },
  });

  const byCompanyId = new Map<string, ClientRow>();
  const byDealId = new Map<string, ClientRow>();
  const byNormalizedName = new Map<string, ClientRow>();
  for (const c of allClients) {
    if (c.hubspotCompanyId) byCompanyId.set(c.hubspotCompanyId, c);
    if (c.hubspotDealId) byDealId.set(c.hubspotDealId, c);
    // For name matching, prefer active clients
    const norm = normalizeName(c.name);
    const existing = byNormalizedName.get(norm);
    if (!existing || c.status === "active") {
      byNormalizedName.set(norm, c);
    }
  }

  // 2. Fetch Closed Won deals
  console.log(`Fetching Closed Won deals from pipeline ${PIPELINE_ID}...`);
  let after: string | undefined;
  const deals: Deal[] = [];

  do {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/deals");
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", "dealname,amount,amount__excl_gst_,dealstage,pipeline");
    url.searchParams.set("associations", "companies");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await res.json();

    for (const deal of (data.results || []) as Deal[]) {
      if (deal.properties.pipeline === PIPELINE_ID && deal.properties.dealstage === CLOSED_WON_STAGE) {
        deals.push(deal);
      }
    }
    after = data.paging?.next?.after;
  } while (after);

  console.log(`Found ${deals.length} Closed Won deals`);

  // 3. Match each deal to a client and sum amounts
  const clientTotals = new Map<string, { client: ClientRow; total: number; dealNames: string[] }>();
  const unmatched: { deal: Deal; exGst: number }[] = [];

  for (const deal of deals) {
    const exGst = deal.properties.amount__excl_gst_
      ? parseFloat(deal.properties.amount__excl_gst_)
      : deal.properties.amount
        ? parseFloat(deal.properties.amount)
        : 0;

    // Try matching: company first, then deal ID, then name
    const companyId = deal.associations?.companies?.results?.[0]?.id;
    let client = companyId ? byCompanyId.get(companyId) : undefined;
    if (!client) client = byDealId.get(deal.id);
    if (!client) {
      const norm = normalizeName(deal.properties.dealname);
      client = byNormalizedName.get(norm);
      if (client) {
        console.log(`  Name-matched: "${deal.properties.dealname}" → client "${client.name}"`);
      }
    }

    if (!client) {
      unmatched.push({ deal, exGst });
      continue;
    }

    const entry = clientTotals.get(client.id) || { client, total: 0, dealNames: [] };
    entry.total += exGst;
    entry.dealNames.push(deal.properties.dealname);
    clientTotals.set(client.id, entry);
  }

  console.log(`\nMatched to ${clientTotals.size} clients, ${unmatched.length} unmatched`);

  // 4. Create clients for unmatched deals
  if (unmatched.length > 0) {
    console.log("\nCreating clients for unmatched deals:");
    for (const { deal, exGst } of unmatched) {
      const companyId = deal.associations?.companies?.results?.[0]?.id ?? null;
      const newClient = await db.client.create({
        data: {
          name: deal.properties.dealname,
          hubspotDealId: deal.id,
          hubspotCompanyId: companyId,
          retainerValue: exGst,
          source: "hubspot",
          status: "active",
          dealStage: deal.properties.dealstage ?? undefined,
        },
      });
      console.log(`  Created: ${deal.properties.dealname} ($${exGst}) → client ${newClient.id}`);

      // Add to totals (single deal, new client)
      clientTotals.set(newClient.id, {
        client: { ...newClient, retainerValue: 0 } as ClientRow,
        total: exGst,
        dealNames: [deal.properties.dealname],
      });
    }
  }

  // 5. Update retainerValue and status for each client
  let updated = 0;
  for (const [, { client, total, dealNames }] of clientTotals) {
    if (total > 0) {
      await db.client.update({
        where: { id: client.id },
        data: {
          retainerValue: total,
          status: "active", // Closed Won = active
        },
      });

      if (Math.abs((client.retainerValue || 0) - total) > 1) {
        console.log(`  ${client.name}: $${(client.retainerValue || 0).toFixed(0)} → $${total.toFixed(0)} (${dealNames.join(" + ")})`);
      }
      updated++;
    }
  }

  console.log(`\nUpdated ${updated} clients`);

  // 6. Print totals
  const activeClients = await db.client.findMany({
    where: { status: "active", hubspotDealId: { not: null } },
    select: { name: true, retainerValue: true },
  });
  const totalRetainer = activeClients.reduce((s, c) => s + (c.retainerValue || 0), 0);
  console.log(`\nActive client retainerValue total: $${totalRetainer.toFixed(0)}`);

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
