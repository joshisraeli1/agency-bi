import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRevenueBudget, REVENUE_BUDGET_PROVIDER } from "@/lib/analytics/revenue-budget";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  return NextResponse.json(await getRevenueBudget());
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected { 'YYYY-MM': number }" }, { status: 400 });
  }

  // Keep only valid YYYY-MM keys with positive numeric values.
  const budget: Record<string, number> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    const n = Number(v);
    if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(n) && n > 0) budget[k] = Math.round(n);
  }
  if (Object.keys(budget).length === 0) {
    return NextResponse.json({ error: "No valid month values provided" }, { status: 400 });
  }

  await db.integrationConfig.upsert({
    where: { provider: REVENUE_BUDGET_PROVIDER },
    create: { provider: REVENUE_BUDGET_PROVIDER, enabled: true, configJson: JSON.stringify(budget) },
    update: { configJson: JSON.stringify(budget) },
  });

  return NextResponse.json(budget);
}
