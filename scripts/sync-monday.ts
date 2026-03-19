/**
 * Direct Monday.com Time Tracking Sync Script
 *
 * Usage:  npx tsx scripts/sync-monday.ts
 *
 * Pulls time tracking data from Monday.com boards and writes to the database.
 * Reads MONDAY_API_TOKEN from .env.local.
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

// Time tracking board IDs — update these to match your workspace
const TIME_TRACKING_BOARD_IDS = [
  "1909945576", // Main time tracking board
];

// ---------------------------------------------------------------------------
// Monday.com API helpers
// ---------------------------------------------------------------------------

interface MondayColumnValue {
  id: string;
  type: string;
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

  const first = await mondayQuery<{
    boards: Array<{ items_page: { cursor: string | null; items: MondayItem[] } }>;
  }>(
    `query($id:[ID!]!){boards(ids:$id){items_page(limit:100){cursor items{id name group{id title}column_values{id type text value}}}}}`,
    { id: [boardId] }
  );

  if (!first.boards?.[0]) return items;
  items.push(...first.boards[0].items_page.items);
  let cursor = first.boards[0].items_page.cursor;

  while (cursor) {
    const next = await mondayQuery<{
      next_items_page: { cursor: string | null; items: MondayItem[] };
    }>(
      `query($c:String!){next_items_page(cursor:$c,limit:100){cursor items{id name group{id title}column_values{id type text value}}}}`,
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

function findColumnByType(item: MondayItem, type: string): MondayColumnValue | undefined {
  return item.column_values.find(
    (cv) => cv.type === type || cv.type === type.replace("_", "-")
  );
}

function parseTimeTracking(value: string | null): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    if (parsed.duration) return parsed.duration / 3600; // seconds to hours
    if (parsed.additional_value) {
      const secs = JSON.parse(parsed.additional_value);
      if (typeof secs === "number") return secs / 3600;
    }
  } catch { /* ignore */ }
  // Try parsing as "Xh Ym" text
  const match = value.match(/(\d+)h\s*(\d+)?m?/);
  if (match) {
    return parseInt(match[1]) + (parseInt(match[2] || "0") / 60);
  }
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

function parsePeople(item: MondayItem): string[] {
  const col = item.column_values.find(
    (cv) => cv.type === "people" || cv.type === "multiple-person"
  );
  if (!col?.value) return [];
  try {
    const parsed = JSON.parse(col.value);
    if (parsed.personsAndTeams) {
      return parsed.personsAndTeams
        .filter((p: { kind: string }) => p.kind === "person")
        .map((p: { id: number }) => String(p.id));
    }
  } catch { /* ignore */ }
  return [];
}

function parseDate(item: MondayItem): Date | null {
  const col = findColumnByType(item, "date");
  if (!col?.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    if (parsed.date) return new Date(parsed.date);
  } catch { /* ignore */ }
  if (col.text) {
    const d = new Date(col.text);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const OVERHEAD_NAMES = ["swan studio", "swan", "internal", "overhead"];

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
// Sync Time Tracking
// ---------------------------------------------------------------------------

async function syncTimeTracking(db: PrismaClient, items: MondayItem[]) {
  console.log(`\n⏱️  Syncing ${items.length} time tracking items...`);
  let synced = 0;
  let skipped = 0;

  // Build lookup maps
  const teamMembers = await db.teamMember.findMany({ select: { id: true, mondayUserId: true } });
  const teamByMondayId = new Map(teamMembers.filter(t => t.mondayUserId).map(t => [t.mondayUserId!, t.id]));

  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map(c => [c.name.toLowerCase(), c.id]));

  // Also check aliases
  const aliases = await db.clientAlias.findMany({ select: { alias: true, clientId: true } });
  const clientByAlias = new Map(aliases.map(a => [a.alias.toLowerCase(), a.clientId]));

  for (const item of items) {
    const ttCol = findColumnByType(item, "time_tracking") ?? findColumnByType(item, "time-tracking");
    const hours = ttCol ? parseTimeTracking(ttCol.value ?? ttCol.text) : 0;

    if (hours === 0) {
      skipped++;
      continue;
    }

    const groupName = item.group?.title ?? "";
    const isOverhead = OVERHEAD_NAMES.includes(groupName.toLowerCase().trim());

    // Find client
    let clientId: string | null = null;
    if (!isOverhead && groupName) {
      clientId = clientByName.get(groupName.toLowerCase()) ??
        clientByAlias.get(groupName.toLowerCase()) ??
        null;
    }

    const entryDate = parseDate(item) ?? new Date();
    const personIds = parsePeople(item);

    if (personIds.length === 0) {
      await db.timeEntry.upsert({
        where: {
          mondayItemId_teamMemberId_date: {
            mondayItemId: item.id,
            teamMemberId: "",
            date: entryDate,
          },
        },
        create: {
          mondayItemId: item.id,
          clientId,
          teamMemberId: null,
          date: entryDate,
          hours,
          description: item.name,
          isOverhead,
          source: "monday",
        },
        update: { hours, description: item.name, isOverhead, clientId },
      });
      synced++;
    } else {
      for (const mondayUserId of personIds) {
        const teamMemberId = teamByMondayId.get(mondayUserId) ?? null;

        await db.timeEntry.upsert({
          where: {
            mondayItemId_teamMemberId_date: {
              mondayItemId: item.id,
              teamMemberId: teamMemberId ?? "",
              date: entryDate,
            },
          },
          create: {
            mondayItemId: item.id,
            clientId,
            teamMemberId,
            date: entryDate,
            hours,
            description: item.name,
            isOverhead,
            source: "monday",
          },
          update: { hours, description: item.name, isOverhead, clientId },
        });
        synced++;
      }
    }
  }

  console.log(`   ✅ Synced ${synced} time entries, skipped ${skipped} (no hours)`);
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
    console.log("📡 Fetching Monday.com time tracking boards...");
    let allItems: MondayItem[] = [];
    for (const boardId of TIME_TRACKING_BOARD_IDS) {
      const items = await fetchAllItems(boardId);
      console.log(`   Board ${boardId}: ${items.length} items`);
      allItems = allItems.concat(items);
    }

    console.log(`   Total items: ${allItems.length}`);

    await syncTimeTracking(db, allItems);

    const totalEntries = await db.timeEntry.count({ where: { source: "monday" } });
    console.log(`\n🎉 Sync complete! Total Monday time entries: ${totalEntries}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});
