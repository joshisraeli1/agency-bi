import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getMichaelGoals, MICHAEL_GOALS_PROVIDER, type MichaelGoals } from "@/lib/analytics/michael-sales";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  return NextResponse.json(await getMichaelGoals());
}

function period(v: unknown): { monthly: number; quarterly: number; annual: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const m = Number(o.monthly), q = Number(o.quarterly), a = Number(o.annual);
  if (![m, q, a].every((n) => Number.isFinite(n) && n >= 0)) return null;
  return { monthly: m, quarterly: q, annual: a };
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const recurringRevenue = Number(body?.recurringRevenue);
  const newRevenue = period(body?.newRevenue);
  const dealsCreated = period(body?.dealsCreated);
  if (!Number.isFinite(recurringRevenue) || recurringRevenue < 0 || !newRevenue || !dealsCreated) {
    return NextResponse.json({ error: "Invalid goals payload" }, { status: 400 });
  }

  const goals: MichaelGoals = { recurringRevenue, newRevenue, dealsCreated };
  await db.integrationConfig.upsert({
    where: { provider: MICHAEL_GOALS_PROVIDER },
    create: { provider: MICHAEL_GOALS_PROVIDER, enabled: true, configJson: JSON.stringify(goals) },
    update: { configJson: JSON.stringify(goals) },
  });

  return NextResponse.json(goals);
}
