/**
 * Import Xero Profit & Loss Excel into FinancialRecords.
 *
 * This P&L is agency-wide (not per-client), so we create a synthetic
 * "Agency (Xero P&L)" client to hold the records.  Revenue lines go
 * in as type "retainer" / source "xero", cost lines as type "cost" /
 * source "xero".
 *
 * Usage:  npx tsx scripts/import-xero-pnl.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FILE = "/Users/joshuaisraeli/Downloads/The_Urban_Swan_Pty_Ltd_-_Profit_and_Loss.xlsx";

function createDb(): PrismaClient {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

/** Parse "Feb 2026" → "2026-02", "Sept 2025" → "2025-09", etc. */
function headerToMonth(header: string): string | null {
  const monthNames: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
  };
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const m = monthNames[parts[0].toLowerCase()];
  const y = parts[1];
  if (!m || !y || y.length !== 4) return null;
  return `${y}-${m}`;
}

// Sections we care about
type Section = "income" | "cos" | "opex" | "other_income" | null;

function detectSection(label: string): Section | "skip" {
  const l = label.toLowerCase().trim();
  if (l === "trading income") return "income";
  if (l === "cost of sales") return "cos";
  if (l === "operating expenses") return "opex";
  if (l === "other income") return "other_income";
  if (l.startsWith("total ") || l === "gross profit" || l === "net profit") return "skip";
  return null; // not a section header
}

// Revenue accounts to exclude from import
const EXCLUDED_ACCOUNTS = [
  "Commission Revenue (Urban Swan)",
  "Expired Gift Card revenue",
];

async function main() {
  const db = createDb();

  try {
    // Read Excel
    const wb = XLSX.readFile(FILE);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find header row (row with "Account" in first cell)
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && String(rows[i][0]).toLowerCase().trim() === "account") {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) throw new Error("Could not find header row with 'Account'");

    const headers = rows[headerIdx] as string[];
    const months: string[] = [];
    for (let c = 1; c < headers.length; c++) {
      const m = headerToMonth(String(headers[c]));
      if (m) months.push(m);
      else break;
    }
    console.log(`Found ${months.length} months: ${months[months.length - 1]} → ${months[0]}`);

    // Find or create the synthetic agency client
    let agencyClient = await db.client.findFirst({
      where: { name: "Agency (Xero P&L)" },
    });
    if (!agencyClient) {
      agencyClient = await db.client.create({
        data: {
          name: "Agency (Xero P&L)",
          source: "xero",
          status: "active",
        },
      });
      console.log("Created synthetic client: Agency (Xero P&L)");
    }
    const clientId = agencyClient.id;

    // Parse data rows
    let currentSection: Section = null;
    let created = 0;
    let updated = 0;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row[0]) continue;

      const label = String(row[0]).trim();
      if (!label) continue;

      // Check if this is a section header
      const sec = detectSection(label);
      if (sec === "skip") continue;
      if (sec !== null) {
        currentSection = sec;
        continue;
      }

      if (!currentSection) continue;

      // Skip excluded revenue accounts
      if (EXCLUDED_ACCOUNTS.includes(label)) continue;

      // Determine record type
      const recordType = currentSection === "income" || currentSection === "other_income"
        ? "retainer"
        : "cost";

      // Process each month column
      for (let c = 0; c < months.length; c++) {
        const val = row[c + 1];
        const amount = typeof val === "number" ? val : parseFloat(String(val || "0"));
        if (isNaN(amount) || amount === 0) continue;

        const month = months[c];
        const category = `xero-pnl:${label}`;
        const absAmount = Math.abs(amount);

        try {
          const existing = await db.financialRecord.findFirst({
            where: { clientId, month, type: recordType, category },
          });

          if (existing) {
            await db.financialRecord.update({
              where: { id: existing.id },
              data: { amount: absAmount, source: "xero" },
            });
            updated++;
          } else {
            await db.financialRecord.create({
              data: {
                clientId,
                month,
                type: recordType,
                category,
                amount: absAmount,
                description: `${label} (Xero P&L)`,
                source: "xero",
              },
            });
            created++;
          }
        } catch {
          // constraint violation, skip
        }
      }
    }

    // Summary
    const totalXero = await db.financialRecord.aggregate({
      where: { source: "xero", type: "retainer" },
      _sum: { amount: true },
    });
    const totalXeroCost = await db.financialRecord.aggregate({
      where: { source: "xero", type: "cost" },
      _sum: { amount: true },
    });

    console.log(`\n✅ Xero P&L import complete!`);
    console.log(`   Records created: ${created}`);
    console.log(`   Records updated: ${updated}`);
    console.log(`   Total Xero revenue (all time): $${(totalXero._sum.amount ?? 0).toLocaleString()}`);
    console.log(`   Total Xero costs (all time): $${(totalXeroCost._sum.amount ?? 0).toLocaleString()}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Failed:", err);
  process.exit(1);
});
