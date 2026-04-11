import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  // 1. Fix trailing whitespace on client names
  const allClients = await db.client.findMany({ select: { id: true, name: true } });
  const whitespaceClients = allClients.filter((c) => c.name !== c.name.trim());

  console.log(`\n=== Fixing ${whitespaceClients.length} client names with trailing whitespace ===\n`);
  for (const c of whitespaceClients) {
    const trimmed = c.name.trim();
    await db.client.update({ where: { id: c.id }, data: { name: trimmed } });
    console.log(`  Fixed: "${c.name}" → "${trimmed}"`);
  }

  // 2. Create Monday aliases for name mismatches
  const aliases: { hubspotName: string; mondayName: string }[] = [
    { hubspotName: "Smartpay", mondayName: "Shift4" },
    { hubspotName: "Smartpay Ads Mgmt", mondayName: "Shift4" },
    { hubspotName: "Bettayou Content", mondayName: "Bettayou" },
    { hubspotName: "Bettayou Ads", mondayName: "Bettayou" },
    { hubspotName: "Continual-G", mondayName: "Continual G" },
    { hubspotName: "LuvLink Extension 4", mondayName: "LuvLink" },
    { hubspotName: "Aquilla", mondayName: "Aquila" },
    { hubspotName: "Sortd Paid Media", mondayName: "Sortd" },
  ];

  console.log(`\n=== Creating ${aliases.length} Monday client aliases ===\n`);
  const clients = await db.client.findMany({ select: { id: true, name: true } });
  const clientByName = new Map(clients.map((c) => [c.name.trim(), c.id]));

  for (const { hubspotName, mondayName } of aliases) {
    const clientId = clientByName.get(hubspotName) || clientByName.get(hubspotName.trim());
    if (!clientId) {
      console.log(`  SKIP: No client found for "${hubspotName}"`);
      continue;
    }

    await db.clientAlias.upsert({
      where: { alias_source: { alias: mondayName, source: "monday" } },
      create: { clientId, alias: mondayName, source: "monday" },
      update: { clientId },
    });
    console.log(`  Created: "${mondayName}" → "${hubspotName}" (${clientId})`);
  }

  // 3. Summary — re-check zero-hour clients
  const timeEntries = await db.timeEntry.groupBy({
    by: ["clientId"],
    _sum: { hours: true },
  });
  const hoursByClient = new Map(timeEntries.map((t) => [t.clientId, t._sum.hours ?? 0]));

  const activeClients = await db.client.findMany({
    where: { status: "active", hubspotDealId: { not: null } },
    select: { id: true, name: true },
  });

  const stillZero = activeClients
    .filter((c) => !hoursByClient.has(c.id) || hoursByClient.get(c.id) === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`\n=== Still 0 hours after fixes (${stillZero.length}) ===`);
  console.log(`(These will resolve after the next Monday sync re-matches entries)\n`);
  for (const c of stillZero) {
    console.log(`  - ${c.name}`);
  }

  await db.$disconnect();
}

main().catch(console.error);
