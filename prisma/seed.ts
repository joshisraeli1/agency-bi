import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");

  const dbPath = path.resolve(__dirname, "..", "dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  const prisma = new PrismaClient({ adapter });

  try {
    const passwordHash = await bcrypt.hash("admin123", 12);
    await prisma.user.upsert({
      where: { email: "admin@swanstudio.com.au" },
      update: {},
      create: {
        email: "admin@swanstudio.com.au",
        name: "Admin",
        passwordHash,
        role: "admin",
      },
    });

    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        agencyName: "Swan Studio",
        currency: "AUD",
        productiveHours: 6.5,
        marginWarning: 20.0,
        marginDanger: 10.0,
        fiscalYearStart: 7,
      },
    });

    const providers = ["monday", "hubspot", "sheets", "xero", "slack", "gmail", "calendar"];
    for (const provider of providers) {
      await prisma.integrationConfig.upsert({
        where: { provider },
        update: {},
        create: { provider, enabled: false, configJson: "{}" },
      });
    }

    console.log("Seed completed successfully");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
