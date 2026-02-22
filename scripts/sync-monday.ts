/**
 * Direct Monday.com Sync Script
 *
 * Usage:  npx tsx scripts/sync-monday.ts
 *
 * Pulls data from 3 Monday boards and writes to the database:
 *   1. Clients board  → Client records + ClientAssignment
 *   2. Creatives board → Deliverable records
 *   3. Campaigns board → FinancialRecord (project type) per campaign
 *
 * Reads MONDAY_API_TOKEN from .env.local (or set inline below).
 * Reads DATABASE_URL from .env.local for Prisma connection.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN ?? "";
const MONDAY_API_URL = "https://api.monday.com/v2";

const BOARD_IDS = {
  clients: "1909942413",
  creatives: "1909945576",
  campaigns: "1917594289",
};

// Client board column IDs
const CLIENT_COLS = {
  status: "status", // Satisfied, Some Concern, Extra Care, etc.
  tier: "color_mkt46t18", // Express, Premium, Base
  contractType: "status_1_mkn18w9g", // 3-month, 6-month, 12-month
  website: "link",
  service: "dropdown", // Growth, Content Delivery, etc.
  clientCode: "text6",
  northStar: "text68",
  kickOffDate: "date4",
  renewalDate: "date_mkn1hzxc",
  smRetainer: "numeric_mkswbrth",
  contentRetainer: "numeric_mkqrn1ds",
  growthRetainer: "numeric_mkswy9m6",
  productionRetainer: "numeric_mkvpxh2t",
  // People columns
  strategist: "dup__of_management_team",
  creativeLead: "multiple_person6",
  commsLead: "dup__of_account_manager_mkmck522",
  clientManager: "person",
  growthStrategist: "multiple_person_mkyr9gny",
  growthExecutor: "multiple_person",
  talentManager: "multiple_person_mks1t5e6",
  editors: "multiple_person_mkza3zjh",
};

// Creatives board column IDs
const CREATIVE_COLS = {
  editId: "text8",
  status: "status",
  dueDate: "date65",
  shippedDate: "date",
  deliverableType: "status_15",
  mediaType: "color_mkqxhpnj",
  revisions: "numbers_Mjj2CDH2",
  reviewer: "person",
  editor: "dup__of_strategist",
  strategist: "dup__of_editor",
  producer: "people",
  clientLink: "link_to_clients",
  priority: "priority",
};

// Campaigns board column IDs
const CAMPAIGN_COLS = {
  status: "status7",
  timeline: "timeline",
  clientLink: "connect_boards",
  strategist: "people48",
  creativeLead: "people4",
  accountManager: "people_1",
  wrappedDate: "date",
  targetDelivery: "date_mky0cbvq",
  monthOfCampaign: "numeric_mky9ey1f",
  timesBilled: "numeric_mkybn17j",
};

// ---------------------------------------------------------------------------
// Monday.com API helpers
// ---------------------------------------------------------------------------

interface MondayColumnValue {
  id: string;
  text: string;
  value: string | null;
}

interface MondayItem {
  id: string;
  name: string;
  group: { id: string; title: string };
  column_values: MondayColumnValue[];
}

async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Monday API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Monday GQL: ${json.errors.map((e: { message: string }) => e.message).join(", ")}`);
  return json.data as T;
}

async function fetchAllItems(boardId: string): Promise<MondayItem[]> {
  const items: MondayItem[] = [];

  // First page
  const first = await mondayQuery<{
    boards: Array<{ items_page: { cursor: string | null; items: MondayItem[] } }>;
  }>(
    `query($id:[ID!]!){boards(ids:$id){items_page(limit:100){cursor items{id name group{id title}column_values{id text value}}}}}`,
    { id: [boardId] }
  );

  if (!first.boards?.[0]) return items;
  items.push(...first.boards[0].items_page.items);
  let cursor = first.boards[0].items_page.cursor;

  // Paginate
  while (cursor) {
    const next = await mondayQuery<{
      next_items_page: { cursor: string | null; items: MondayItem[] };
    }>(
      `query($c:String!){next_items_page(cursor:$c,limit:100){cursor items{id name group{id title}column_values{id text value}}}}`,
      { c: cursor }
    );
    items.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
    if (next.next_items_page.items.length < 100) break;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Column value helpers
// ---------------------------------------------------------------------------

function col(item: MondayItem, colId: string): MondayColumnValue | undefined {
  return item.column_values.find((c) => c.id === colId);
}

function colText(item: MondayItem, colId: string): string {
  return col(item, colId)?.text?.trim() ?? "";
}

function colNum(item: MondayItem, colId: string): number | null {
  const raw = col(item, colId)?.text?.trim();
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function colUrl(item: MondayItem, colId: string): string | null {
  const v = col(item, colId)?.value;
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    return parsed.url ?? null;
  } catch {
    return col(item, colId)?.text || null;
  }
}

function colDate(item: MondayItem, colId: string): Date | null {
  const v = col(item, colId)?.value;
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    if (parsed.date) return new Date(parsed.date);
  } catch { /* ignore */ }
  const text = col(item, colId)?.text;
  if (text) {
    const d = new Date(text);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function colTimeline(item: MondayItem, colId: string): { from: string; to: string } | null {
  const v = col(item, colId)?.value;
  if (!v) return null;
  try {
    const parsed = JSON.parse(v);
    if (parsed.from && parsed.to) return { from: parsed.from, to: parsed.to };
  } catch { /* ignore */ }
  return null;
}

function colPeople(item: MondayItem, colId: string): string[] {
  const text = colText(item, colId);
  if (!text) return [];
  return text.split(",").map((n) => n.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Map Monday status → app status
// ---------------------------------------------------------------------------

function mapClientStatus(groupTitle: string, statusText: string): string {
  const g = groupTitle.toLowerCase();
  if (g.includes("churn") || g.includes("lost")) return "churned";
  if (g.includes("pause") || g.includes("hold")) return "paused";
  if (g.includes("prospect") || g.includes("pipeline")) return "prospect";
  // "Current" group = active, but check status column too
  if (statusText.toLowerCase().includes("churn")) return "churned";
  return "active";
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

  // SQLite fallback
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
// Monday people ID → name cache (for team member lookup)
// ---------------------------------------------------------------------------

async function fetchMondayUsers(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const data = await mondayQuery<{ users: Array<{ id: number; name: string; email: string }> }>(
    `query { users(limit: 200) { id name email } }`
  );
  for (const u of data.users) {
    map.set(u.id, u.name);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sync Clients
// ---------------------------------------------------------------------------

async function syncClients(db: PrismaClient, items: MondayItem[]) {
  console.log(`\n📋 Syncing ${items.length} clients...`);
  let created = 0;
  let updated = 0;

  for (const item of items) {
    const smRetainer = colNum(item, CLIENT_COLS.smRetainer) ?? 0;
    const contentRetainer = colNum(item, CLIENT_COLS.contentRetainer) ?? 0;
    const growthRetainer = colNum(item, CLIENT_COLS.growthRetainer) ?? 0;
    const productionRetainer = colNum(item, CLIENT_COLS.productionRetainer) ?? 0;
    const totalRetainer = smRetainer + contentRetainer + growthRetainer + productionRetainer;

    const status = mapClientStatus(item.group.title, colText(item, CLIENT_COLS.status));
    const tier = colText(item, CLIENT_COLS.tier);
    const contractType = colText(item, CLIENT_COLS.contractType);
    const service = colText(item, CLIENT_COLS.service);
    const website = colUrl(item, CLIENT_COLS.website);
    const clientCode = colText(item, CLIENT_COLS.clientCode);
    const northStar = colText(item, CLIENT_COLS.northStar);
    const kickOff = colDate(item, CLIENT_COLS.kickOffDate);
    const renewal = colDate(item, CLIENT_COLS.renewalDate);

    const notes = [
      tier && `Tier: ${tier}`,
      contractType && `Contract: ${contractType}`,
      service && `Services: ${service}`,
      clientCode && `Code: ${clientCode}`,
      northStar && `North Star: ${northStar}`,
      kickOff && `Kick Off: ${kickOff.toISOString().slice(0, 10)}`,
      renewal && `Renewal: ${renewal.toISOString().slice(0, 10)}`,
      `Retainers — SM: $${smRetainer}, Content: $${contentRetainer}, Growth: $${growthRetainer}, Production: $${productionRetainer}`,
    ]
      .filter(Boolean)
      .join("\n");

    // Try to find existing client by mondayItemId or name
    let existing = await db.client.findFirst({
      where: { mondayItemId: item.id },
    });
    if (!existing) {
      existing = await db.client.findFirst({
        where: { name: { equals: item.name, mode: "insensitive" } },
      });
    }

    if (existing) {
      await db.client.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          status,
          industry: service || existing.industry,
          website: website || existing.website,
          retainerValue: totalRetainer || existing.retainerValue,
          dealStage: tier || existing.dealStage,
          mondayItemId: item.id,
          source: "monday",
          notes,
        },
      });
      updated++;
    } else {
      await db.client.create({
        data: {
          name: item.name,
          status,
          industry: service || null,
          website,
          retainerValue: totalRetainer || null,
          dealStage: tier || null,
          mondayItemId: item.id,
          source: "monday",
          notes,
        },
      });
      created++;
    }
  }

  console.log(`   ✅ Created ${created}, updated ${updated} clients`);
}

// ---------------------------------------------------------------------------
// Sync Deliverables (Creatives board)
// ---------------------------------------------------------------------------

async function syncDeliverables(db: PrismaClient, items: MondayItem[]) {
  console.log(`\n🎨 Syncing ${items.length} creatives/deliverables...`);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Build a client name lookup for matching
  const clients = await db.client.findMany({ select: { id: true, name: true, mondayItemId: true } });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));

  for (const item of items) {
    const editId = colText(item, CREATIVE_COLS.editId);
    const status = colText(item, CREATIVE_COLS.status);
    const dueDate = colDate(item, CREATIVE_COLS.dueDate);
    const shippedDate = colDate(item, CREATIVE_COLS.shippedDate);
    const revisions = colNum(item, CREATIVE_COLS.revisions) ?? 0;
    const mediaType = colText(item, CREATIVE_COLS.mediaType);
    const deliverableType = colText(item, CREATIVE_COLS.deliverableType);

    // Try to match client from the item's group or board relation
    // The group often contains the client name in campaigns, but creatives group is "All Creatives"
    // We'll try to match from the first word(s) of the creative name
    let clientId: string | null = null;

    // Try matching from the creative name against client names
    const nameLower = item.name.toLowerCase();
    for (const [cName, cId] of clientByName) {
      if (nameLower.includes(cName) || cName.includes(nameLower.split(" ")[0]?.toLowerCase() ?? "")) {
        clientId = cId;
        break;
      }
    }

    const existing = await db.deliverable.findUnique({
      where: { mondayItemId: item.id },
    });

    const editCode = editId || null;
    const statusLabel = [deliverableType, mediaType, status].filter(Boolean).join(" | ");

    if (existing) {
      await db.deliverable.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          editCode,
          status: statusLabel || existing.status,
          dueDate: dueDate || existing.dueDate,
          completedDate: shippedDate || existing.completedDate,
          revisionCount: revisions,
          clientId: clientId || existing.clientId,
        },
      });
      updated++;
    } else {
      await db.deliverable.create({
        data: {
          name: item.name,
          editCode,
          status: statusLabel || null,
          dueDate,
          completedDate: shippedDate,
          revisionCount: revisions,
          mondayItemId: item.id,
          mondayBoardId: BOARD_IDS.creatives,
          clientId,
          source: "monday",
        },
      });
      created++;
    }
  }

  console.log(`   ✅ Created ${created}, updated ${updated}, skipped ${skipped} deliverables`);
}

// ---------------------------------------------------------------------------
// Sync Campaigns
// ---------------------------------------------------------------------------

async function syncCampaigns(db: PrismaClient, items: MondayItem[]) {
  console.log(`\n🚨 Syncing ${items.length} campaigns...`);
  let created = 0;
  let updated = 0;

  // Client name lookup
  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));

  for (const item of items) {
    const status = colText(item, CAMPAIGN_COLS.status);
    const timeline = colTimeline(item, CAMPAIGN_COLS.timeline);
    const timesBilled = colNum(item, CAMPAIGN_COLS.timesBilled);

    // Campaign names are like "AmazingCo Jan 26" or "Bizcover March Campaign"
    // Try to match client from campaign name
    let clientId: string | null = null;
    const nameLower = item.name.toLowerCase();
    for (const [cName, cId] of clientByName) {
      if (nameLower.includes(cName)) {
        clientId = cId;
        break;
      }
    }

    // If no match, try partial matching (first word)
    if (!clientId) {
      const firstWord = item.name.split(" ")[0]?.toLowerCase() ?? "";
      for (const [cName, cId] of clientByName) {
        if (cName.startsWith(firstWord) || firstWord.startsWith(cName.split(" ")[0] ?? "")) {
          clientId = cId;
          break;
        }
      }
    }

    if (!clientId) {
      console.log(`   ⚠️  No client match for campaign: ${item.name}`);
      continue;
    }

    // Derive month from timeline start or campaign name
    let month: string | null = null;
    if (timeline?.from) {
      month = timeline.from.slice(0, 7); // YYYY-MM
    } else {
      // Try to parse from name like "Jan 26" → 2026-01
      const monthMatch = item.name.match(
        /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{2,4})\b/i
      );
      if (monthMatch) {
        const monthNames: Record<string, string> = {
          jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
          jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
        };
        const m = monthNames[monthMatch[1].toLowerCase().slice(0, 3)] ?? "01";
        let y = monthMatch[2];
        if (y.length === 2) y = `20${y}`;
        month = `${y}-${m}`;
      }
    }

    if (!month) {
      console.log(`   ⚠️  No month derived for campaign: ${item.name}`);
      continue;
    }

    // Store as a FinancialRecord of type "project" (campaign)
    const category = `campaign:${item.name}`;
    const description = [
      `Campaign: ${item.name}`,
      status && `Status: ${status}`,
      timeline && `Timeline: ${timeline.from} to ${timeline.to}`,
      timesBilled && `Billed: ${timesBilled}x`,
    ]
      .filter(Boolean)
      .join(" | ");

    const existing = await db.financialRecord.findFirst({
      where: {
        clientId,
        month,
        type: "project",
        category,
      },
    });

    if (existing) {
      await db.financialRecord.update({
        where: { id: existing.id },
        data: { description, source: "monday", externalId: item.id },
      });
      updated++;
    } else {
      await db.financialRecord.create({
        data: {
          clientId,
          month,
          type: "project",
          category,
          amount: 0, // No dollar value from Monday — comes from Xero/Sheets
          description,
          source: "monday",
          externalId: item.id,
        },
      });
      created++;
    }
  }

  console.log(`   ✅ Created ${created}, updated ${updated} campaign records`);
}

// ---------------------------------------------------------------------------
// Sync Team Assignments from Client board people columns
// ---------------------------------------------------------------------------

async function syncClientAssignments(db: PrismaClient, clientItems: MondayItem[]) {
  console.log(`\n👥 Syncing client-team assignments...`);
  let created = 0;

  const clients = await db.client.findMany({ select: { id: true, mondayItemId: true } });
  const clientById = new Map(clients.map((c) => [c.mondayItemId, c.id]));

  const teamMembers = await db.teamMember.findMany({ select: { id: true, name: true } });
  const teamByName = new Map(teamMembers.map((t) => [t.name.toLowerCase(), t.id]));

  const roleMap: Record<string, string> = {
    [CLIENT_COLS.strategist]: "strategist",
    [CLIENT_COLS.creativeLead]: "creative_lead",
    [CLIENT_COLS.commsLead]: "comms_lead",
    [CLIENT_COLS.clientManager]: "account_manager",
    [CLIENT_COLS.growthStrategist]: "growth_strategist",
    [CLIENT_COLS.growthExecutor]: "growth_executor",
    [CLIENT_COLS.talentManager]: "talent_manager",
    [CLIENT_COLS.editors]: "editor",
  };

  for (const item of clientItems) {
    const clientId = clientById.get(item.id);
    if (!clientId) continue;

    for (const [colId, role] of Object.entries(roleMap)) {
      const names = colPeople(item, colId);
      for (const name of names) {
        const memberId = teamByName.get(name.toLowerCase());
        if (!memberId) continue;

        // Upsert
        try {
          await db.clientAssignment.upsert({
            where: {
              clientId_teamMemberId_role: { clientId, teamMemberId: memberId, role },
            },
            update: {},
            create: { clientId, teamMemberId: memberId, role, isPrimary: names.indexOf(name) === 0 },
          });
          created++;
        } catch {
          // Duplicate, skip
        }
      }
    }
  }

  console.log(`   ✅ ${created} client-team assignments synced`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!MONDAY_TOKEN) {
    console.error("❌ Set MONDAY_API_TOKEN in .env.local");
    process.exit(1);
  }

  console.log("🔗 Connecting to database...");
  const db = createDb();

  try {
    // Fetch all board data in parallel
    console.log("📡 Fetching Monday.com boards...");
    const [clientItems, creativeItems, campaignItems] = await Promise.all([
      fetchAllItems(BOARD_IDS.clients),
      fetchAllItems(BOARD_IDS.creatives),
      fetchAllItems(BOARD_IDS.campaigns),
    ]);

    console.log(`   Found: ${clientItems.length} clients, ${creativeItems.length} creatives, ${campaignItems.length} campaigns`);

    // Sync in order: clients first (others depend on client records)
    await syncClients(db, clientItems);
    await syncDeliverables(db, creativeItems);
    await syncCampaigns(db, campaignItems);
    await syncClientAssignments(db, clientItems);

    // Summary
    const totalClients = await db.client.count();
    const totalDeliverables = await db.deliverable.count();
    const totalCampaigns = await db.financialRecord.count({ where: { type: "project", source: "monday" } });

    console.log(`\n🎉 Sync complete!`);
    console.log(`   Total clients: ${totalClients}`);
    console.log(`   Total deliverables: ${totalDeliverables}`);
    console.log(`   Total campaign records: ${totalCampaigns}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
