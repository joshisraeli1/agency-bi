import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const url = process.env.DATABASE_URL || "file:./dev.db";

  if (url.startsWith("postgresql:") || url.startsWith("postgres:")) {
    // PostgreSQL: use @prisma/adapter-pg (dynamic import to avoid loading native sqlite on Vercel)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  }

  // SQLite (default): use better-sqlite3 adapter (dynamic import - native binary)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  const dbPath = url.startsWith("file:")
    ? path.resolve(process.cwd(), url.replace("file:", "").replace("./", ""))
    : path.resolve(process.cwd(), "dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
