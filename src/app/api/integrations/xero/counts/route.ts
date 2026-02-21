import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/xero/counts
 *
 * Returns counts of Xero-sourced financial records.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
