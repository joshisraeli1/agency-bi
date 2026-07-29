import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";
import { formatMonth } from "@/lib/utils";

export const REVENUE_BUDGET_PROVIDER = "revenue_budget";

/**
 * Monthly Total Revenue budget (ex-GST), keyed "YYYY-MM". These are the H1 2026
 * plan figures from the financial model's income statement; editable in-app and
 * persisted on the `revenue_budget` IntegrationConfig row.
 */
export const DEFAULT_REVENUE_BUDGET: Record<string, number> = {
  "2026-01": 328042,
  "2026-02": 346021,
  "2026-03": 363308,
  "2026-04": 380010,
  "2026-05": 396214,
  "2026-06": 411994,
};

/** Stored budget merged over defaults (any positive stored month wins). */
export async function getRevenueBudget(): Promise<Record<string, number>> {
  const row = await db.integrationConfig.findUnique({ where: { provider: REVENUE_BUDGET_PROVIDER } });
  const budget: Record<string, number> = { ...DEFAULT_REVENUE_BUDGET };
  if (row?.configJson && row.configJson !== "{}") {
    try {
      const stored = JSON.parse(row.configJson) as Record<string, unknown>;
      for (const k of Object.keys(stored)) {
        const n = Number(stored[k]);
        if (/^\d{4}-\d{2}$/.test(k) && Number.isFinite(n) && n > 0) budget[k] = n;
      }
    } catch {
      // fall back to defaults
    }
  }
  return budget;
}

export interface BudgetVsActualRow {
  month: string; // "2026-01"
  label: string; // "Jan 2026"
  budget: number; // ex-GST plan
  actual: number; // ex-GST HubSpot MRR (deal active windows)
  variance: number; // actual - budget
}

const monthKey = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

/**
 * Budget vs actual revenue, one row per budgeted month. "Actual" is HubSpot
 * ex-GST monthly recurring revenue computed from closed-won deal active windows
 * (start..churn) — the same basis as the Overview Monthly Revenue (HubSpot,
 * ex-GST) chart, so the two agree. Excluded clients are dropped.
 */
export async function getBudgetVsActual(): Promise<BudgetVsActualRow[]> {
  const budget = await getRevenueBudget();
  // Show every budgeted month, extended forward to the current month so a
  // recently-completed month (e.g. July, before its budget is entered) still
  // appears with its actual revenue. Months without a defined budget show 0
  // until entered via "Edit budget".
  const budgetMonths = Object.keys(budget).sort();
  const months = [...budgetMonths];
  if (budgetMonths.length) {
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let last = budgetMonths[budgetMonths.length - 1];
    while (last < curKey) {
      const [y, mo] = last.split("-").map(Number);
      const next = new Date(y, mo, 1); // mo is 1-based → this is the following month
      last = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
      if (!months.includes(last)) months.push(last);
    }
    months.sort();
  }

  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { clientId: true, amountExGst: true, startDate: true, closeDate: true, churnDate: true },
    }),
  ]);

  const actualByMonth: Record<string, number> = {};
  for (const m of months) actualByMonth[m] = 0;
  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const startKey = monthKey(d.startDate ?? d.closeDate);
    if (!startKey) continue;
    const churnKey = monthKey(d.churnDate);
    const ex = d.amountExGst ?? 0;
    for (const m of months) {
      if (m >= startKey && (!churnKey || m < churnKey)) actualByMonth[m] += ex;
    }
  }

  return months.map((m) => {
    const actual = Math.round(actualByMonth[m]);
    const b = Math.round(budget[m] ?? 0);
    return { month: m, label: formatMonth(m), budget: b, actual, variance: actual - b };
  });
}
