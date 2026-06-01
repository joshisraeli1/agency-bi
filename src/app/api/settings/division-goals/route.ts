import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDivisionGoals, DEFAULT_DIVISION_GOALS, DIVISION_GOALS_PROVIDER } from "@/lib/analytics/active-revenue";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  return NextResponse.json(await getDivisionGoals());
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected { <division>: number }" }, { status: 400 });
  }
  const goals: Record<string, number> = {};
  for (const k of Object.keys(DEFAULT_DIVISION_GOALS)) {
    const n = Number((body as Record<string, unknown>)[k]);
    goals[k] = Number.isFinite(n) && n > 0 ? n : DEFAULT_DIVISION_GOALS[k];
  }

  await db.integrationConfig.upsert({
    where: { provider: DIVISION_GOALS_PROVIDER },
    create: { provider: DIVISION_GOALS_PROVIDER, enabled: true, configJson: JSON.stringify(goals) },
    update: { configJson: JSON.stringify(goals) },
  });

  return NextResponse.json(goals);
}
