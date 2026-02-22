import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/integrations/xero/counts
 *
 * Returns counts of Xero-sourced financial records.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

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
