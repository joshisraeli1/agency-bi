import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  COST_REALLOCATION_PROVIDER,
  monthlyCostOf,
  readReallocationEntries,
  type ReallocationEntry,
} from "@/lib/analytics/cost-reallocation";

/**
 * Who is paid out of which account, for the divisional margin view.
 *
 * Reporting only — nothing here writes to Xero. The P&L keeps saying what it
 * says; this records that a person's pay sitting in a shared salary line
 * belongs to their division when divisional cost is totalled.
 */
export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const [members, entries, costRows] = await Promise.all([
    db.teamMember.findMany({
      where: { active: true },
      select: {
        id: true, name: true, role: true, division: true,
        annualSalary: true, hourlyRate: true, weeklyHours: true,
      },
      orderBy: [{ division: "asc" }, { name: "asc" }],
    }),
    readReallocationEntries(),
    db.financialRecord.findMany({
      where: { source: "xero", type: "cost" },
      select: { category: true, month: true },
    }),
  ]);

  const months = [...new Set(costRows.map((r) => r.month))].sort();
  const latest = months[months.length - 1] ?? null;
  const accounts = [
    ...new Set(costRows.filter((r) => r.month === latest).map((r) => r.category ?? "")),
  ]
    .filter(Boolean)
    .sort();

  const byMember = new Map(entries.map((e) => [e.teamMemberId, e.fromAccount]));

  return NextResponse.json({
    month: latest,
    accounts,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      division: m.division,
      monthlyCost: Math.round(monthlyCostOf(m)),
      fromAccount: byMember.get(m.id) ?? null,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const incoming = body?.entries;
  if (!Array.isArray(incoming)) {
    return NextResponse.json(
      { error: "Expected { entries: [{ teamMemberId, fromAccount }] }" },
      { status: 400 }
    );
  }

  // Only keep entries naming a real active member and a real cost account, so a
  // stale id can never move money to nowhere.
  const [members, accounts] = await Promise.all([
    db.teamMember.findMany({ where: { active: true }, select: { id: true, division: true } }),
    db.financialRecord.findMany({
      where: { source: "xero", type: "cost" },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);
  const memberIds = new Map(members.map((m) => [m.id, m.division]));
  const accountNames = new Set(accounts.map((a) => a.category ?? "").filter(Boolean));

  const cleaned: ReallocationEntry[] = [];
  for (const e of incoming as ReallocationEntry[]) {
    if (!e?.teamMemberId || !e?.fromAccount) continue;
    const division = memberIds.get(e.teamMemberId);
    // A member with no division has nowhere to send the cost; a member already
    // in Shared/Overhead would be a no-op.
    if (!division || division === "Shared/Overhead") continue;
    if (!accountNames.has(e.fromAccount)) continue;
    cleaned.push({ teamMemberId: e.teamMemberId, fromAccount: e.fromAccount });
  }

  await db.integrationConfig.upsert({
    where: { provider: COST_REALLOCATION_PROVIDER },
    create: {
      provider: COST_REALLOCATION_PROVIDER,
      enabled: true,
      configJson: JSON.stringify({ entries: cleaned }),
    },
    update: { configJson: JSON.stringify({ entries: cleaned }) },
  });

  return NextResponse.json({ saved: cleaned.length });
}
