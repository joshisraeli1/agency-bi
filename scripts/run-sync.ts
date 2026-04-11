import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

// Must set up path aliases for @/ imports
import { register } from "tsx/esm/api";
import { pathToFileURL } from "url";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decryptJson, encryptJson } from "../src/lib/encryption";

const url = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString: url });
const db = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const runHubspot = args.includes("--hubspot") || args.includes("--all");
  const runMonday = args.includes("--monday") || args.includes("--all");
  const updateBoards = args.includes("--update-boards");

  if (updateBoards) {
    // Fetch all boards with time_tracking columns from Monday
    const integration = await db.integrationConfig.findUnique({ where: { provider: "monday" } });
    if (!integration?.configJson) {
      console.log("Monday integration not configured");
      return;
    }
    const config = decryptJson<any>(integration.configJson);

    const query = `{ boards(limit: 200) { id name columns { type } } }`;
    const res = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: config.apiToken },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    const boards = data?.data?.boards ?? [];
    const ttBoards = boards.filter((b: any) =>
      b.columns?.some((c: any) => c.type === "time_tracking")
    );
    const boardIds = ttBoards.map((b: any) => b.id);

    console.log(`Found ${boardIds.length} boards with time tracking:`);
    for (const b of ttBoards) {
      console.log(`  - ${b.name} (${b.id})`);
    }

    // Update config with board IDs
    config.boardIds = { timeTracking: boardIds };
    const encrypted = encryptJson(config);
    await db.integrationConfig.update({
      where: { provider: "monday" },
      data: { configJson: encrypted },
    });
    console.log(`\nUpdated Monday config with ${boardIds.length} board IDs\n`);
  }

  if (!runHubspot && !runMonday) {
    console.log("Usage: npx tsx scripts/run-sync.ts [--hubspot] [--monday] [--all] [--update-boards]");
    await db.$disconnect();
    return;
  }

  // We can't easily run the sync engine outside Next.js due to path aliases,
  // so just print instructions
  console.log("\n=== Sync ready ===");
  console.log("Board IDs are now configured. Start your dev server and trigger syncs:");
  console.log("  1. Run: npm run dev");
  console.log("  2. Go to /integrations in the browser");
  console.log("  3. Trigger HubSpot deals sync and Monday sync from the UI");

  await db.$disconnect();
}

main().catch(console.error);
