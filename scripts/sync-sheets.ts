/**
 * Google Sheets Sync — imports team members, client data, costs, time tracking
 * from the "Efficiency Report" spreadsheet.
 *
 * Usage:  npx tsx scripts/sync-sheets.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { google } from "googleapis";
import fs from "fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON ??
  "/Users/joshuaisraeli/Downloads/agency-business-intelligence-a47ea9288d02.json";
const SPREADSHEET_ID = "1RSM8sUpQOmzGlMNu6TY0o8VWbdo2jbz3rZdR-FqdEOs";

// ---------------------------------------------------------------------------
// Google Sheets helpers
// ---------------------------------------------------------------------------

async function getSheetsClient() {
  const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client as any });
}

async function readTab(sheets: any, tab: string, range = "A1:Z"): Promise<string[][]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!${range}`,
  });
  return res.data.values || [];
}

function parseCurrency(val: string | undefined | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseFloat_(val: string | undefined | null): number | null {
  if (!val) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
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
// 1. Team Match — build name mapping across systems
// ---------------------------------------------------------------------------

interface TeamNameMap {
  salary: string;   // Name in salary tab
  time: string;     // Name in time tracking
  client: string;   // Name in client data (executor)
}

async function loadTeamMatch(sheets: any): Promise<TeamNameMap[]> {
  const rows = await readTab(sheets, "5.3 Team Match");
  // Headers: Salary, Time, Client
  const maps: TeamNameMap[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    maps.push({
      salary: row[0]?.trim() ?? "",
      time: row[1]?.trim() ?? "",
      client: row[2]?.trim() ?? "",
    });
  }
  return maps;
}

// ---------------------------------------------------------------------------
// 2. Client Match — build client name mapping
// ---------------------------------------------------------------------------

interface ClientNameMap {
  timeName: string;
  clientName: string;
}

async function loadClientMatch(sheets: any): Promise<ClientNameMap[]> {
  const rows = await readTab(sheets, "5.3 Client Match");
  // Headers: Time, Client
  const maps: ClientNameMap[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    maps.push({
      timeName: row[0]?.trim() ?? "",
      clientName: row[1]?.trim() ?? row[0]?.trim() ?? "",
    });
  }
  return maps;
}

// ---------------------------------------------------------------------------
// 3. Sync Salary Data → TeamMember
// ---------------------------------------------------------------------------

async function syncSalary(db: PrismaClient, sheets: any, teamMatch: TeamNameMap[]) {
  console.log("\n👥 Syncing salary data → Team Members...");
  const rows = await readTab(sheets, "4.3 Salary Data");
  // Headers: Employee Costs, Division, Role, Base Salary, Annual All Up, Monthly All Up, Location, VISA Status, Employment Status, COS or Opex

  const teamMatchBySalary = new Map(teamMatch.map((t) => [t.salary.toLowerCase(), t]));
  let synced = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[0]?.trim();
    if (!name || name === "New Hires" || name === "Casuals" || name === "Phillipines" || name === "Total") {
      continue; // Skip section headers
    }

    const division = row[1]?.trim() || null;
    const role = row[2]?.trim() || null;
    const baseSalary = parseCurrency(row[3]);
    const annualAllUp = parseCurrency(row[4]);
    const monthlyAllUp = parseCurrency(row[5]);
    const location = row[6]?.trim() || null;
    const visaStatus = row[7]?.trim() || null;
    const employmentStatus = row[8]?.trim() || null;
    const costCategory = row[9]?.trim() || null;

    // Skip zero-cost casuals with no salary
    if (!annualAllUp && !baseSalary && name !== "Editors") {
      skipped++;
      continue;
    }

    // Find canonical name from team match
    const match = teamMatchBySalary.get(name.toLowerCase());

    try {
      const existing = await db.teamMember.findFirst({
        where: {
          OR: [
            { name: { equals: name } },
            ...(match ? [{ name: { equals: match.time } }] : []),
          ],
        },
      });

      const data = {
        name: match?.time || name,
        role,
        division: division === "N/A" ? null : division,
        location,
        employmentType: employmentStatus?.toLowerCase() ?? null,
        costType: "salary" as const,
        annualSalary: annualAllUp ?? baseSalary,
        weeklyHours: employmentStatus === "Full-Time" ? 38 : employmentStatus === "Part-Time" ? 19 : null,
        source: "sheets",
        active: true,
      };

      if (existing) {
        await db.teamMember.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await db.teamMember.create({ data });
      }
      synced++;
    } catch (err) {
      console.warn(`   ⚠ Skipped ${name}: ${err instanceof Error ? err.message : err}`);
      skipped++;
    }
  }

  console.log(`   ✅ ${synced} team members synced, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// 4. Sync Client Data → Client enrichment + executor assignments
// ---------------------------------------------------------------------------

async function syncClientData(db: PrismaClient, sheets: any, teamMatch: TeamNameMap[]) {
  console.log("\n📋 Syncing client data (retainers, executors, packages)...");
  const rows = await readTab(sheets, "4.2 Client Data", "A1:S1000");
  // Headers: Deal ID, Client, MonthlyRetainer, KickOffMonth, Video Assets, Static Assets,
  //   Recut Assets, SetDate, FormattedKickOffMonth, DealStage, FormattedStage,
  //   Creator Incl., BDM, FormattedBDM, BDM Comission, Package Type, Churn Date,
  //   FormattedChurnDate, Executor

  const teamMatchByClient = new Map(teamMatch.map((t) => [t.client.toLowerCase(), t]));

  // Load existing clients
  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));

  // Load existing team members
  const teamMembers = await db.teamMember.findMany({ select: { id: true, name: true } });
  const memberByName = new Map(teamMembers.map((m) => [m.name.toLowerCase(), m]));

  let enriched = 0;
  let executorAssigned = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const clientName = row[1]?.trim();
    if (!clientName) continue;

    const retainer = parseCurrency(row[2]);
    const packageType = row[15]?.trim() || null;
    const executorName = row[18]?.trim() || null;

    // Find client in DB
    let client = clientByName.get(clientName.toLowerCase());
    if (!client) {
      // Fuzzy match
      for (const [cName, c] of clientByName) {
        if (clientName.toLowerCase().includes(cName) || cName.includes(clientName.toLowerCase())) {
          client = c;
          break;
        }
      }
    }

    if (!client) {
      skipped++;
      continue;
    }

    // Enrich client with package type
    if (packageType) {
      try {
        await db.client.update({
          where: { id: client.id },
          data: {
            notes: packageType ? `Package: ${packageType}` : undefined,
          },
        });
        enriched++;
      } catch {
        // ignore
      }
    }

    // Assign executor as team member
    if (executorName) {
      // Resolve executor name via team match
      const match = teamMatchByClient.get(executorName.toLowerCase());
      const resolvedName = match?.time || executorName;

      let member = memberByName.get(resolvedName.toLowerCase());
      if (!member) {
        // Try original name
        member = memberByName.get(executorName.toLowerCase());
      }

      if (member) {
        try {
          await db.clientAssignment.upsert({
            where: {
              clientId_teamMemberId_role: {
                clientId: client.id,
                teamMemberId: member.id,
                role: "executor",
              },
            },
            create: {
              clientId: client.id,
              teamMemberId: member.id,
              role: "executor",
              isPrimary: true,
            },
            update: { isPrimary: true },
          });
          executorAssigned++;
        } catch {
          // ignore duplicate
        }
      }
    }
  }

  console.log(`   ✅ ${enriched} clients enriched, ${executorAssigned} executor assignments, ${skipped} unmatched`);
}

// ---------------------------------------------------------------------------
// 5. Sync Segmented Cost Data → FinancialRecord type=cost
// ---------------------------------------------------------------------------

async function syncCosts(db: PrismaClient, sheets: any, clientMatch: ClientNameMap[]) {
  console.log("\n💸 Syncing segmented cost data...");
  const rows = await readTab(sheets, "4.4 Segmented Cost Data");
  // Headers: Client, Month, Hours, Cost

  const clientNameMap = new Map(clientMatch.map((c) => [c.timeName.toLowerCase(), c.clientName]));

  // Load clients
  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));

  let synced = 0;
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    let clientName = row[0]?.trim();
    const month = row[1]?.trim();
    const hours = parseFloat_(row[2]);
    const cost = parseCurrency(row[3]);

    if (!clientName || !month || cost === null) continue;

    // Resolve client name via match table
    const resolved = clientNameMap.get(clientName.toLowerCase());
    if (resolved) clientName = resolved;

    let client = clientByName.get(clientName.toLowerCase());
    if (!client) {
      for (const [cName, c] of clientByName) {
        if (clientName.toLowerCase().includes(cName) || cName.includes(clientName.toLowerCase())) {
          client = c;
          break;
        }
      }
    }

    if (!client) {
      skipped++;
      continue;
    }

    try {
      await db.financialRecord.upsert({
        where: {
          clientId_month_type_category: {
            clientId: client.id,
            month,
            type: "cost",
            category: "labor",
          },
        },
        create: {
          clientId: client.id,
          month,
          type: "cost",
          category: "labor",
          amount: cost,
          hours,
          source: "sheets",
          description: "Segmented labor cost from Efficiency Report",
        },
        update: {
          amount: cost,
          hours,
          source: "sheets",
        },
      });
      synced++;
    } catch {
      skipped++;
    }
  }

  console.log(`   ✅ ${synced} cost records synced, ${skipped} skipped`);
}

// ---------------------------------------------------------------------------
// 6. Sync Time Tracking Data → TimeEntry
// ---------------------------------------------------------------------------

async function syncTimeTracking(db: PrismaClient, sheets: any, teamMatch: TeamNameMap[], clientMatch: ClientNameMap[]) {
  console.log("\n⏱ Syncing time tracking data (batch mode)...");

  const teamMatchByTime = new Map(teamMatch.map((t) => [t.time.toLowerCase(), t]));
  const clientNameMap = new Map(clientMatch.map((c) => [c.timeName.toLowerCase(), c.clientName]));

  // Load all clients and team members
  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));
  const teamMembers = await db.teamMember.findMany({ select: { id: true, name: true } });
  const memberByName = new Map(teamMembers.map((m) => [m.name.toLowerCase(), m]));

  // Read in chunks from Sheets API
  const READ_CHUNK = 10000;
  let startRow = 2;
  let totalSynced = 0;
  let totalSkipped = 0;

  const countRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "4.1 Time Tracking Data!A:A",
  });
  const totalRows = (countRes.data.values || []).length - 1;
  console.log(`   Total rows to process: ${totalRows}`);

  while (startRow <= totalRows + 1) {
    const endRow = startRow + READ_CHUNK - 1;
    const rows = await readTab(sheets, "4.1 Time Tracking Data", `A${startRow}:T${endRow}`);
    if (rows.length === 0) break;

    // Build batch of records
    const batch: {
      clientId: string | null;
      teamMemberId: string | null;
      date: Date;
      hours: number;
      description: string | null;
      isOverhead: boolean;
      source: string;
    }[] = [];

    for (const row of rows) {
      let clientName = row[1]?.trim();
      const executorName = row[2]?.trim();
      const dateStr = row[3]?.trim();
      const category = row[6]?.trim() || null;
      const hours = parseFloat_(row[7]);

      if (!clientName || !executorName || !hours || !dateStr) {
        totalSkipped++;
        continue;
      }

      const dateParts = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!dateParts) {
        totalSkipped++;
        continue;
      }
      const date = new Date(
        parseInt(dateParts[3]),
        parseInt(dateParts[2]) - 1,
        parseInt(dateParts[1])
      );

      const resolvedClient = clientNameMap.get(clientName.toLowerCase());
      if (resolvedClient) clientName = resolvedClient;

      let client = clientByName.get(clientName.toLowerCase());
      if (!client) {
        for (const [cName, c] of clientByName) {
          if (clientName.toLowerCase().includes(cName) || cName.includes(clientName.toLowerCase())) {
            client = c;
            break;
          }
        }
      }

      const teamMatch_ = teamMatchByTime.get(executorName.toLowerCase());
      const resolvedMember = teamMatch_?.time || executorName;
      let member = memberByName.get(resolvedMember.toLowerCase());
      if (!member) member = memberByName.get(executorName.toLowerCase());

      batch.push({
        clientId: client?.id ?? null,
        teamMemberId: member?.id ?? null,
        date,
        hours,
        description: category || null,
        isOverhead: !client,
        source: "sheets",
      });
    }

    // Batch insert using createMany
    if (batch.length > 0) {
      const result = await db.timeEntry.createMany({
        data: batch,
        skipDuplicates: true,
      });
      totalSynced += result.count;
    }

    process.stdout.write(`\r   Processed ${Math.min(startRow + READ_CHUNK - 2, totalRows)} / ${totalRows} (synced: ${totalSynced})`);
    startRow += READ_CHUNK;
  }

  console.log(`\n   ✅ ${totalSynced} time entries synced, ${totalSkipped} skipped`);
}

// ---------------------------------------------------------------------------
// 7. Sync Client Aliases
// ---------------------------------------------------------------------------

async function syncClientAliases(db: PrismaClient, clientMatch: ClientNameMap[]) {
  console.log("\n🔗 Syncing client name aliases...");
  let synced = 0;

  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map((c) => [c.name.toLowerCase(), c]));

  for (const { timeName, clientName } of clientMatch) {
    if (timeName.toLowerCase() === clientName.toLowerCase()) continue;

    const client = clientByName.get(clientName.toLowerCase());
    if (!client) continue;

    try {
      await db.clientAlias.upsert({
        where: { alias_source: { alias: timeName, source: "sheets" } },
        create: { clientId: client.id, alias: timeName, source: "sheets" },
        update: { clientId: client.id },
      });
      synced++;
    } catch {
      // ignore
    }
  }

  console.log(`   ✅ ${synced} client aliases synced`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("📊 Google Sheets Sync — Efficiency Report");
  console.log("=========================================\n");

  const sheets = await getSheetsClient();
  const db = createDb();

  try {
    // Load name mappings first
    console.log("📖 Loading name mappings...");
    const teamMatch = await loadTeamMatch(sheets);
    const clientMatch = await loadClientMatch(sheets);
    console.log(`   Team match: ${teamMatch.length} entries`);
    console.log(`   Client match: ${clientMatch.length} entries`);

    // 1. Team members (salary data)
    await syncSalary(db, sheets, teamMatch);

    // 2. Client data enrichment + executor assignments
    await syncClientData(db, sheets, teamMatch);

    // 3. Client aliases
    await syncClientAliases(db, clientMatch);

    // 4. Segmented cost data
    await syncCosts(db, sheets, clientMatch);

    // 5. Time tracking (largest — do last, uses batch createMany)
    // Clear existing sheets time entries first to avoid duplicates
    console.log("\n🗑 Clearing existing sheets time entries...");
    const deleted = await db.timeEntry.deleteMany({ where: { source: "sheets" } });
    console.log(`   Cleared ${deleted.count} existing sheets time entries`);
    await syncTimeTracking(db, sheets, teamMatch, clientMatch);

    // Summary
    const teamCount = await db.teamMember.count();
    const costRecords = await db.financialRecord.count({ where: { type: "cost", source: "sheets" } });
    const timeEntries = await db.timeEntry.count({ where: { source: "sheets" } });
    const totalCost = await db.financialRecord.aggregate({
      where: { type: "cost", source: "sheets" },
      _sum: { amount: true },
    });

    console.log("\n🎉 Google Sheets sync complete!");
    console.log(`   Team members: ${teamCount}`);
    console.log(`   Cost records: ${costRecords}`);
    console.log(`   Time entries: ${timeEntries}`);
    console.log(`   Total labor cost: $${(totalCost._sum.amount ?? 0).toLocaleString()}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
