/**
 * Monday.com Time Tracking Sync
 *
 * Pulls time entries from all individual strategist time tracker boards.
 * Each board has: Name (activity), Date, Time Tracker (duration), Person, Division, Category
 * Client is matched from the item name or group name.
 *
 * Usage:  npx tsx scripts/sync-monday.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN ?? "";
const MONDAY_API_URL = "https://api.monday.com/v2";

// All individual time tracker board IDs
const TIME_TRACKER_BOARDS = [
  "5027221355", "5027221328", "5026979444", "5026924942",
  "5026393417", "5026393266", "5026260327", "5026170719",
  "5025376353", "5025350973", "5025172647", "5024844372",
  "5024248165", "5023668384", "5023131349", "5023131083",
  "5022452326", "5018957815", "5010539226", "5010484760",
  "5006650961", "2075592066", "2056557467",
];

// ---------------------------------------------------------------------------
// Monday.com API
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
    headers: { "Content-Type": "application/json", Authorization: MONDAY_TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Monday API ${res.status}`);
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
// Helpers
// ---------------------------------------------------------------------------

function findCol(item: MondayItem, type: string): MondayColumnValue | undefined {
  return item.column_values.find(
    (cv) => cv.type === type || cv.type === type.replace("_", "-")
  );
}

function parseDuration(col: MondayColumnValue | undefined): number {
  if (!col?.value) return 0;
  try {
    const parsed = JSON.parse(col.value);
    if (parsed.duration) return parsed.duration / 3600; // seconds → hours
  } catch { /* ignore */ }
  // Try HH:MM:SS text format
  const match = col.text?.match(/^(\d+):(\d+):(\d+)$/);
  if (match) {
    return parseInt(match[1]) + parseInt(match[2]) / 60 + parseInt(match[3]) / 3600;
  }
  return 0;
}

function parseDate(item: MondayItem): Date | null {
  const col = findCol(item, "date");
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

function parsePerson(item: MondayItem): { id: string; name: string } | null {
  const col = findCol(item, "people") ?? findCol(item, "multiple_person");
  if (!col?.value) return null;
  try {
    const parsed = JSON.parse(col.value);
    const persons = parsed.personsAndTeams || [];
    const person = persons.find((p: { kind: string }) => p.kind === "person");
    if (person) return { id: String(person.id), name: col.text?.split(",")[0]?.trim() ?? "" };
  } catch { /* ignore */ }
  return null;
}

function getDivisionLabel(item: MondayItem): string | null {
  // Division is typically a status column with label like "Swan Studio", "Content Delivery", etc.
  for (const cv of item.column_values) {
    if (cv.type === "status" && cv.text) {
      const t = cv.text.toLowerCase();
      if (t.includes("swan") || t.includes("content") || t.includes("ads") || t.includes("social") || t.includes("growth") || t.includes("sales")) {
        return cv.text;
      }
    }
  }
  return null;
}

const OVERHEAD_LABELS = ["swan studio", "internal", "overhead", "swan"];

function createDb(): PrismaClient {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Main sync
// ---------------------------------------------------------------------------

async function main() {
  if (!MONDAY_TOKEN) { console.error("Set MONDAY_API_TOKEN in .env.local"); process.exit(1); }

  console.log("🔗 Connecting to database...");
  const db = createDb();

  try {
    // Build lookup maps
    const clients = await db.client.findMany({ select: { id: true, name: true } });
    const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));
    const aliases = await db.clientAlias.findMany({ select: { alias: true, clientId: true } });
    for (const a of aliases) clientByName.set(a.alias.toLowerCase(), a.clientId);

    const teamMembers = await db.teamMember.findMany({ select: { id: true, name: true, mondayUserId: true } });
    const teamByMondayId = new Map(teamMembers.filter((t) => t.mondayUserId).map((t) => [t.mondayUserId!, t.id]));
    const teamByName = new Map(teamMembers.map((t) => [t.name.toLowerCase(), t.id]));

    // Clear old Monday time entries
    const deleted = await db.timeEntry.deleteMany({ where: { source: "monday" } });
    console.log(`🗑  Cleared ${deleted.count} existing Monday time entries`);

    let totalSynced = 0;
    let totalSkipped = 0;

    console.log(`\n📡 Fetching from ${TIME_TRACKER_BOARDS.length} time tracker boards...`);

    for (const boardId of TIME_TRACKER_BOARDS) {
      const items = await fetchAllItems(boardId);
      if (items.length === 0) continue;

      // Get board name from first item's context
      const boardName = items[0]?.group?.title ? `Board ${boardId}` : `Board ${boardId}`;

      const batch: {
        mondayItemId: string;
        clientId: string | null;
        teamMemberId: string | null;
        date: Date;
        hours: number;
        description: string | null;
        isOverhead: boolean;
        source: string;
      }[] = [];

      for (const item of items) {
        const ttCol = findCol(item, "time_tracking") ?? findCol(item, "time-tracking");
        const hours = parseDuration(ttCol);
        if (hours <= 0) { totalSkipped++; continue; }

        const date = parseDate(item);
        if (!date) { totalSkipped++; continue; }

        // Get person
        const person = parsePerson(item);
        let teamMemberId: string | null = null;
        if (person) {
          teamMemberId = teamByMondayId.get(person.id) ?? null;
          if (!teamMemberId) {
            // Try matching by name
            const firstName = person.name.split(" ")[0]?.toLowerCase();
            for (const [tName, tId] of teamByName) {
              if (tName.startsWith(firstName) || firstName.startsWith(tName.split(" ")[0])) {
                teamMemberId = tId;
                break;
              }
            }
          }
        }

        // Determine if overhead
        const divLabel = getDivisionLabel(item);
        const isOverhead = divLabel ? OVERHEAD_LABELS.includes(divLabel.toLowerCase()) : false;

        // Match client from item name
        let clientId: string | null = null;
        if (!isOverhead) {
          const nameLower = item.name.toLowerCase();
          // Try direct match first
          for (const [cName, cId] of clientByName) {
            if (nameLower.includes(cName) || cName.includes(nameLower.split(" - ")[0]?.toLowerCase() ?? "")) {
              clientId = cId;
              break;
            }
          }
        }

        batch.push({
          mondayItemId: item.id,
          clientId,
          teamMemberId,
          date,
          hours: Number(hours.toFixed(2)),
          description: item.name,
          isOverhead,
          source: "monday",
        });
      }

      if (batch.length > 0) {
        const result = await db.timeEntry.createMany({ data: batch, skipDuplicates: true });
        totalSynced += result.count;
      }

      process.stdout.write(`\r   Processed board ${boardId}: ${items.length} items, ${batch.length} with hours`);
    }

    const totalEntries = await db.timeEntry.count({ where: { source: "monday" } });
    const withClient = await db.timeEntry.count({ where: { source: "monday", clientId: { not: null } } });
    const withMember = await db.timeEntry.count({ where: { source: "monday", teamMemberId: { not: null } } });

    console.log(`\n\n🎉 Sync complete!`);
    console.log(`   Total entries: ${totalEntries}`);
    console.log(`   With client: ${withClient}`);
    console.log(`   With team member: ${withMember}`);
    console.log(`   Skipped (no hours/date): ${totalSkipped}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => { console.error("❌ Failed:", err); process.exit(1); });
