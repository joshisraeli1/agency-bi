import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptJson } from "../src/lib/encryption";

const url = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: url });
const db = new PrismaClient({ adapter });

interface MondayConfig {
  apiToken: string;
  boardIds: {
    timeTracking: string[];
  };
}


async function main() {
  // 1. All active HubSpot clients
  const clients = await db.client.findMany({
    where: { status: "active", hubspotDealId: { not: null } },
    select: { id: true, name: true },
  });

  // 2. Time entries grouped by clientId
  const timeEntries = await db.timeEntry.groupBy({
    by: ["clientId"],
    _sum: { hours: true },
  });
  const hoursByClient = new Map(
    timeEntries.map((t) => [t.clientId, t._sum.hours ?? 0])
  );

  // 3. Clients with 0 hours
  const zeroHourClients = clients
    .filter((c) => !hoursByClient.has(c.id) || hoursByClient.get(c.id) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n=== Active HubSpot clients with 0 time entries (${zeroHourClients.length}) ===\n`);
  for (const c of zeroHourClients) {
    console.log(`  - ${c.name}`);
  }

  // 4. Client names that DO have time entries (for reference)
  const matchedClients = clients
    .filter((c) => hoursByClient.has(c.id) && hoursByClient.get(c.id)! > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // 5. Get Monday board groups
  const integration = await db.integrationConfig.findUnique({
    where: { provider: "monday" },
  });

  if (integration?.configJson && integration.configJson !== "{}") {
    const config = decryptJson<MondayConfig>(integration.configJson);

    // Fetch all boards from Monday and get their groups
    const allBoardsQuery = `{ boards(limit: 50) { id name groups { title } } }`;
    const allBoardsRes = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: config.apiToken },
      body: JSON.stringify({ query: allBoardsQuery }),
    });
    const allBoardsData = await allBoardsRes.json();
    const allBoards = allBoardsData?.data?.boards ?? [];

    // Collect all unique group names across all boards
    const allGroups = new Set<string>();
    for (const board of allBoards) {
      for (const g of board.groups ?? []) {
        allGroups.add(g.title);
      }
    }
    const mondayGroups = [...allGroups].sort();
    const boardIds = allBoards.map((b: { id: string }) => b.id);
    console.log(`\nFetched ${mondayGroups.length} unique groups from ${boardIds.length} boards\n`);

    const clientNames = new Set(clients.map((c) => c.name.toLowerCase()));

    // Groups that don't match any HubSpot client
    const OVERHEAD = ["swan studio", "swan", "internal", "overhead"];
    const unmatchedGroups = mondayGroups.filter(
      (g: string) => !clientNames.has(g.toLowerCase()) && !OVERHEAD.includes(g.toLowerCase())
    );

    console.log(`=== Monday board groups NOT matching any client (${unmatchedGroups.length}) ===\n`);
    for (const g of unmatchedGroups) {
      console.log(`  - ${g}`);
    }

    console.log(`\n=== Monday board groups matching a client (${mondayGroups.length - unmatchedGroups.length - mondayGroups.filter(g => OVERHEAD.includes(g.toLowerCase())).length}) ===\n`);
    for (const g of mondayGroups) {
      if (!unmatchedGroups.includes(g) && !OVERHEAD.includes(g.toLowerCase())) {
        console.log(`  - ${g}`);
      }
    }
  }

  await db.$disconnect();
}

main().catch(console.error);
