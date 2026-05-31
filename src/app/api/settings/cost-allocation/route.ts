import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { autoMapAccountToDivision, DIVISIONS } from "@/lib/analytics/cost-allocation";

const PROVIDER = "cost_allocation";

async function readOverrides(): Promise<Record<string, string>> {
  const row = await db.integrationConfig.findUnique({ where: { provider: PROVIDER } });
  if (!row?.configJson || row.configJson === "{}") return {};
  try {
    return JSON.parse(row.configJson) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  // Distinct Xero cost accounts with their latest-month amount.
  const records = await db.financialRecord.findMany({
    where: { source: "xero", type: "cost" },
    select: { category: true, amount: true, month: true },
  });
  const months = [...new Set(records.map((r) => r.month))].sort();
  const latest = months[months.length - 1];
  const latestByAccount = new Map<string, number>();
  for (const r of records) {
    if (r.month !== latest) continue;
    const acct = r.category || "";
    latestByAccount.set(acct, (latestByAccount.get(acct) || 0) + r.amount);
  }

  const overrides = await readOverrides();
  const accounts = [...latestByAccount.entries()]
    .map(([account, monthlyAmount]) => ({
      account,
      monthlyAmount: Math.round(monthlyAmount),
      autoDivision: autoMapAccountToDivision(account),
      division: overrides[account] ?? autoMapAccountToDivision(account),
    }))
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);

  return NextResponse.json({ accounts, divisions: DIVISIONS, month: latest ?? null });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const overrides = body?.overrides;
  if (!overrides || typeof overrides !== "object") {
    return NextResponse.json({ error: "Expected { overrides: { account: division } }" }, { status: 400 });
  }
  // Keep only entries that differ from the auto-map (store overrides only).
  const cleaned: Record<string, string> = {};
  for (const [account, division] of Object.entries(overrides as Record<string, string>)) {
    if (DIVISIONS.includes(division as never) && division !== autoMapAccountToDivision(account)) {
      cleaned[account] = division;
    }
  }

  await db.integrationConfig.upsert({
    where: { provider: PROVIDER },
    create: { provider: PROVIDER, enabled: true, configJson: JSON.stringify(cleaned) },
    update: { configJson: JSON.stringify(cleaned) },
  });

  return NextResponse.json({ saved: Object.keys(cleaned).length });
}
