import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { DIVISIONS, mapAccountToDivisions } from "./cost-allocation";
import { getExcludedClientIds } from "./excluded-clients";
import { foldUpsells } from "./upsells";
import { dealDivision } from "./upsells";
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";
import type { DivisionProfitabilityRow } from "./types";

export interface DivisionSummaryMonth {
  month: string; // YYYY-MM
  label: string; // "Aug 2026"
  rows: DivisionProfitabilityRow[];
}

export interface DivisionSummary {
  months: DivisionSummaryMonth[];
  /** Latest month with booked costs — the sensible default to open on. */
  defaultMonth: string | null;
}

/**
 * Division revenue and cost straight from the Xero P&L, one entry per month.
 *
 * Both sides come from the accounts so the margins reconcile to the P&L rather
 * than comparing contracted MRR against actual spend. Average deal size is the
 * one HubSpot figure — Xero has no concept of a deal — and is computed from the
 * deals live in THAT month, so it moves with the month selector instead of
 * showing today's book against a historical P&L.
 */
export async function getDivisionSummaryByMonth(monthCount = 12): Promise<DivisionSummary> {
  const [incomeLines, costRecords, allocRow, excludedIds, deals, downsells] = await Promise.all([
    db.xeroPnlIncomeLine.findMany({ select: { month: true, account: true, amount: true } }),
    db.financialRecord.findMany({
      where: { source: "xero", type: "cost" },
      select: { month: true, category: true, amount: true },
    }),
    db.integrationConfig.findUnique({ where: { provider: "cost_allocation" } }),
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: DOWNSELL_DEAL_SELECT,
    }),
    getDownsellResolution(),
  ]);

  // Manual overrides from Settings → Cost Allocation win over the auto-map.
  let overrides: Record<string, string> = {};
  if (allocRow?.configJson && allocRow.configJson !== "{}") {
    try {
      overrides = JSON.parse(allocRow.configJson);
    } catch {
      overrides = {};
    }
  }

  const allocate = (account: string): { division: string; weight: number }[] => {
    const override = overrides[account];
    if (override) return [{ division: override, weight: 1 }];
    return mapAccountToDivisions(account);
  };

  const revenueBy = new Map<string, Map<string, number>>();
  const costBy = new Map<string, Map<string, number>>();
  const bump = (outer: Map<string, Map<string, number>>, month: string, division: string, amount: number) => {
    const inner = outer.get(month) ?? new Map<string, number>();
    inner.set(division, (inner.get(division) ?? 0) + amount);
    outer.set(month, inner);
  };

  for (const line of incomeLines) {
    for (const { division, weight } of allocate(line.account)) {
      bump(revenueBy, line.month, division, line.amount * weight);
    }
  }
  for (const rec of costRecords) {
    const account = rec.category ?? "";
    if (!account) continue;
    for (const { division, weight } of allocate(account)) {
      bump(costBy, rec.month, division, rec.amount * weight);
    }
  }

  // Deals live in a given month, folded so an upsell isn't counted as its own
  // deal — the same basis the avg-deal-size comparison uses.
  const dealStatsFor = (month: string) => {
    const active = deals.filter((d) => {
      if (d.clientId && excludedIds.has(d.clientId)) return false;
      if (downsells.heldOutIds.has(d.id)) return false;
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (!startKey) return false;
      return month >= startKey && (!churnKey || month < churnKey);
    });
    const { deals: folded } = foldUpsells(active);
    const sum = new Map<string, number>();
    const count = new Map<string, number>();
    for (const d of folded) {
      const ex = d.amountExGst ?? d.amount ?? 0;
      if (ex <= 0) continue;
      const div = dealDivision(d.contentPackageType);
      sum.set(div, (sum.get(div) ?? 0) + ex);
      count.set(div, (count.get(div) ?? 0) + 1);
    }
    return { sum, count };
  };

  // Only months that actually have P&L data, newest last.
  const monthKeys = [...new Set([...revenueBy.keys(), ...costBy.keys()])].sort().slice(-monthCount);

  const months: DivisionSummaryMonth[] = monthKeys.map((month) => {
    const rev = revenueBy.get(month) ?? new Map<string, number>();
    const cost = costBy.get(month) ?? new Map<string, number>();
    const { sum, count } = dealStatsFor(month);

    const rows: DivisionProfitabilityRow[] = DIVISIONS.map((division) => {
      const r = rev.get(division) ?? 0;
      const c = cost.get(division) ?? 0;
      // dealDivision() calls the paid-content bucket "Content Delivery" too.
      const n = count.get(division) ?? 0;
      return {
        division,
        revenue: Math.round(r),
        cost: Math.round(c),
        ratio: c > 0 ? Number((r / c).toFixed(1)) : 0,
        marginPercent: r > 0 ? Number((((r - c) / r) * 100).toFixed(0)) : 0,
        clientCount: n,
        avgDealSize: n > 0 ? Math.round((sum.get(division) ?? 0) / n) : 0,
      };
    })
      .filter((d) => d.revenue > 0 || d.cost > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return { month, label: formatMonth(month), rows };
  });

  // The current calendar month's costs aren't booked yet, so opening on it
  // would show inflated margins. Default to the last complete month.
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const complete = months.filter((m) => m.month < currentKey);
  const defaultMonth = (complete[complete.length - 1] ?? months[months.length - 1])?.month ?? null;

  return { months, defaultMonth };
}
