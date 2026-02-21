import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/xero/counts
 *
 * Returns counts of Xero-sourced financial records.
 */
export async function GET() {
  const invoices = await db.financialRecord.count({
    where: { source: "xero", type: { in: ["retainer", "project"] } },
  });

  const expenses = await db.financialRecord.count({
    where: { source: "xero", type: "cost" },
  });

  return NextResponse.json({
    invoices,
    expenses,
    total: invoices + expenses,
  });
}
