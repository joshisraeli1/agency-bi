import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMichaelGoals, MICHAEL_GOALS_PROVIDER } from "@/lib/analytics/michael-sales";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  return NextResponse.json(await getMichaelGoals());
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const mrrGoal = Number(body?.mrrGoal);
  const dealsGoal = Number(body?.dealsGoal);
  if (!Number.isFinite(mrrGoal) || mrrGoal <= 0 || !Number.isFinite(dealsGoal) || dealsGoal <= 0) {
    return NextResponse.json({ error: "mrrGoal and dealsGoal must be positive numbers" }, { status: 400 });
  }

  await db.integrationConfig.upsert({
    where: { provider: MICHAEL_GOALS_PROVIDER },
    create: { provider: MICHAEL_GOALS_PROVIDER, enabled: true, configJson: JSON.stringify({ mrrGoal, dealsGoal }) },
    update: { configJson: JSON.stringify({ mrrGoal, dealsGoal }) },
  });

  return NextResponse.json({ mrrGoal, dealsGoal });
}
