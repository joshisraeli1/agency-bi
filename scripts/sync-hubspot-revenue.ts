/**
 * HubSpot Revenue Sync — generates monthly FinancialRecord entries
 * from Content Machine deals with amount_excl_gst, start_date, churn_date.
 *
 * Usage:  npx tsx scripts/sync-hubspot-revenue.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
const CONTENT_MACHINE_PIPELINE = "32895309";
const CLOSED_WON_STAGE = "98068645";
const CHURNED_STAGE = "114291350";
const CHURNED_ACTIVE_STAGE = "1086044538";

// ---------------------------------------------------------------------------
// HubSpot helpers
// ---------------------------------------------------------------------------

interface HubSpotDeal {
  id: string;
  properties: Record<string, string | null>;
}

async function searchDeals(after?: number): Promise<{ results: HubSpotDeal[]; total: number; after?: number }> {
  const body: Record<string, unknown> = {
    filterGroups: [{
      filters: [
        { propertyName: "pipeline", operator: "EQ", value: CONTENT_MACHINE_PIPELINE },
      ],
    }],
    properties: [
      "dealname", "amount", "amount__excl_gst_", "dealstage",
      "start_date", "churn_date", "closedate", "industry_type",
    ],
    limit: 100,
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
  };
  if (after !== undefined) {
    (body as Record<string, unknown>).after = after;
  }

  const res = await fetch("https://api.hubapi.com/crm/v3/objects/deals/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    results: data.results,
    total: data.total,
    after: data.paging?.next?.after ? parseInt(data.paging.next.after) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseMonth(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // Handle YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const match = dateStr.match(/^(\d{4}-\d{2})/);
  return match ? match[1] : null;
}

function monthsBetween(startMonth: string, endMonth: string): string[] {
  const months: string[] = [];
  let [y, m] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);

  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

function createDb(): PrismaClient {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
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
    // Fetch all Content Machine deals
    console.log("📡 Fetching Content Machine deals...");
    const allDeals: HubSpotDeal[] = [];
    let after: number | undefined;
    let total = 0;

    do {
      const page = await searchDeals(after);
      allDeals.push(...page.results);
      total = page.total;
      after = page.after;
      process.stdout.write(`\r   Fetched ${allDeals.length} / ${total}`);
    } while (after);

    console.log(`\n   Total: ${allDeals.length} deals`);

    // Filter to Closed Won or Churned (deals that actually generated revenue)
    const revenueDeals = allDeals.filter((d) => {
      const stage = d.properties.dealstage;
      return stage === CLOSED_WON_STAGE || stage === CHURNED_STAGE || stage === CHURNED_ACTIVE_STAGE;
    });

    console.log(`   Revenue-generating deals (Closed Won + Churned): ${revenueDeals.length}`);

    // Load clients for matching
    const clients = await db.client.findMany({
      select: { id: true, name: true, hubspotDealId: true },
    });
    const clientByDealId = new Map(
      clients.filter((c) => c.hubspotDealId).map((c) => [c.hubspotDealId!, c.id])
    );
    const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));

    // Stage label lookup
    const STAGE_LABELS: Record<string, string> = {
      [CLOSED_WON_STAGE]: "Closed Won (AU)",
      [CHURNED_STAGE]: "Churned (AU)",
      [CHURNED_ACTIVE_STAGE]: "Churned Active (AU)",
    };

    const now = currentMonth();
    const nowDate = new Date();
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let unmatched = 0;

    // Track per-client data for two-pass status determination
    // A client is "active" only if they have a Closed Won deal with no churn date (or future churn date)
    const clientHasActiveDeal = new Map<string, boolean>();
    const clientDealStage = new Map<string, string>();  // latest deal stage label
    const clientDates = new Map<string, { startDate?: Date; endDate?: Date }>();
    const clientIndustry = new Map<string, string>();

    for (const deal of revenueDeals) {
      const props = deal.properties;
      const dealName = props.dealname ?? "";
      const amountExGst = props.amount__excl_gst_ ? parseFloat(props.amount__excl_gst_) : null;
      const startMonth = parseMonth(props.start_date);
      const churnMonth = parseMonth(props.churn_date);
      const stage = props.dealstage;

      if (!amountExGst || !startMonth) continue;

      // Match to client
      let clientId = clientByDealId.get(deal.id);
      if (!clientId) {
        const nameLower = dealName.toLowerCase();
        clientId = clientByName.get(nameLower);
        if (!clientId) {
          for (const [cName, cId] of clientByName) {
            if (nameLower.includes(cName) || cName.includes(nameLower)) {
              clientId = cId;
              break;
            }
          }
        }
      }

      if (!clientId) {
        unmatched++;
        continue;
      }

      // Track whether this client has any active deal
      // Active = Closed Won + no churn date or churn date in the future
      if (stage === CLOSED_WON_STAGE) {
        const churnDate = props.churn_date ? new Date(props.churn_date) : null;
        const isStillActive = !churnDate || churnDate > nowDate;
        if (isStillActive) {
          clientHasActiveDeal.set(clientId, true);
        }
      }
      // Only mark as NOT active if we haven't already found an active deal
      if (!clientHasActiveDeal.has(clientId)) {
        clientHasActiveDeal.set(clientId, false);
      }

      // Track deal stage label (latest wins)
      if (stage && STAGE_LABELS[stage]) {
        clientDealStage.set(clientId, STAGE_LABELS[stage]);
      }

      // Track dates
      const startDateVal = props.start_date ? new Date(props.start_date) : null;
      const endDateVal = props.churn_date ? new Date(props.churn_date) : null;
      const existing = clientDates.get(clientId) || {};
      if (startDateVal && !isNaN(startDateVal.getTime())) {
        // Use earliest start date
        if (!existing.startDate || startDateVal < existing.startDate) {
          existing.startDate = startDateVal;
        }
      }
      if (endDateVal && !isNaN(endDateVal.getTime())) {
        // Use latest end date
        if (!existing.endDate || endDateVal > existing.endDate) {
          existing.endDate = endDateVal;
        }
      }
      clientDates.set(clientId, existing);

      // Track industry
      if (props.industry_type) {
        clientIndustry.set(clientId, props.industry_type);
      }

      // Determine end month: churn date if churned/churned-active, otherwise current month
      const isChurned = stage === CHURNED_STAGE || stage === CHURNED_ACTIVE_STAGE;
      const endMonth = isChurned && churnMonth ? churnMonth : now;

      // Generate monthly retainer records
      const months = monthsBetween(startMonth, endMonth);

      for (const month of months) {
        const category = `hubspot:${dealName}`;

        try {
          const existing = await db.financialRecord.findFirst({
            where: { clientId, month, type: "retainer", category },
          });

          if (existing) {
            await db.financialRecord.update({
              where: { id: existing.id },
              data: { amount: amountExGst, source: "hubspot", externalId: deal.id },
            });
            recordsUpdated++;
          } else {
            await db.financialRecord.create({
              data: {
                clientId,
                month,
                type: "retainer",
                category,
                amount: amountExGst,
                description: `${dealName}${isChurned ? " (churned)" : ""}`,
                source: "hubspot",
                externalId: deal.id,
              },
            });
            recordsCreated++;
          }
        } catch {
          // Unique constraint violation — skip
        }
      }
    }

    // -----------------------------------------------------------------------
    // Pass 2: Set final client status, dealStage, dates, industry
    // A client is "active" ONLY if they have a Closed Won deal with no past churn date.
    // All other HubSpot clients are "churned".
    // -----------------------------------------------------------------------
    console.log("\n📊 Updating client statuses from HubSpot deal stages...");

    // Get all HubSpot clients
    const hubspotClients = await db.client.findMany({
      where: { hubspotDealId: { not: null }, status: { not: "prospect" } },
      select: { id: true, name: true },
    });

    let activeCount = 0;
    let churnedCount = 0;

    for (const client of hubspotClients) {
      const isActive = clientHasActiveDeal.get(client.id) === true;
      const update: Record<string, unknown> = {
        status: isActive ? "active" : "churned",
      };

      const dealStage = clientDealStage.get(client.id);
      if (dealStage) update.dealStage = dealStage;

      const dates = clientDates.get(client.id);
      if (dates?.startDate) update.startDate = dates.startDate;
      if (dates?.endDate) update.endDate = dates.endDate;

      const industry = clientIndustry.get(client.id);
      if (industry) update.industry = industry;

      await db.client.update({ where: { id: client.id }, data: update });

      if (isActive) activeCount++;
      else churnedCount++;
    }

    console.log(`   Active: ${activeCount}, Churned: ${churnedCount}`);

    // Summary
    const totalRevenue = await db.financialRecord.aggregate({
      where: { source: "hubspot", type: "retainer" },
      _sum: { amount: true },
    });

    console.log(`\n🎉 Revenue sync complete!`);
    console.log(`   Records created: ${recordsCreated}`);
    console.log(`   Records updated: ${recordsUpdated}`);
    console.log(`   Unmatched deals: ${unmatched}`);
    console.log(`   Total HubSpot revenue (all time): $${(totalRevenue._sum.amount ?? 0).toLocaleString()}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
