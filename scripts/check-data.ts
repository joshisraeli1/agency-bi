import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter });

  const totalFin = await db.financialRecord.count();
  const bySource = await db.financialRecord.groupBy({ by: ["source"], _count: true });
  const byType = await db.financialRecord.groupBy({ by: ["type"], _count: true });
  const months = await db.financialRecord.groupBy({ by: ["month"], _count: true, orderBy: { month: "desc" }, take: 6 });
  const clientCount = await db.client.count();
  const hubspotClients = await db.client.count({ where: { hubspotDealId: { not: null } } });
  const timeEntries = await db.timeEntry.count();

  console.log("Total financial records:", totalFin);
  console.log("By source:", JSON.stringify(bySource, null, 2));
  console.log("By type:", JSON.stringify(byType, null, 2));
  console.log("Recent months:", JSON.stringify(months, null, 2));
  console.log("Total clients:", clientCount);
  console.log("HubSpot-linked clients:", hubspotClients);
  console.log("Total time entries:", timeEntries);

  await db.$disconnect();
}

main().catch(console.error);
