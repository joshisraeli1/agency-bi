import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";

export const DIVISION_GOALS_PROVIDER = "division_goals";

export interface BonusTier {
  target: number; // cumulative division revenue, ex-GST
  bonus: number;
  note?: string; // how the target was derived, shown on hover
}

export interface DivisionBonusPlan {
  /** First month of the measurement period, "YYYY-MM". */
  fyStart: string;
  tiers: BonusTier[];
}

export interface TierProgress extends BonusTier {
  attained: boolean;
  projectedToHit: boolean;
  percentOfTarget: number;
  shortfall: number; // against the projection, 0 once projected to hit
}

export interface DivisionGoalProgress {
  fyStart: string;
  fyStartLabel: string;
  monthsElapsed: number;
  monthsInPeriod: number;
  cumulative: number;
  latestMonthly: number;
  projected: number;
  /** Cumulative revenue needed by now to be on track for the top tier reached. */
  tiers: TierProgress[];
  currentBonus: number; // earned if the period ended today
  projectedBonus: number;
}

const MONTHS_IN_PERIOD = 12;

/**
 * Bonus plans per division. Defaults live in code so the feature works before
 * anything is configured; the "division_goals" config row overrides them, which
 * is how a plan gets changed without a deploy.
 *
 * Vitor's tiers were set against the Apr–Jun 2026 monthly average annualised,
 * and are measured as CUMULATIVE ex-GST division revenue from 1 July.
 */
export const DEFAULT_DIVISION_GOALS: Record<string, DivisionBonusPlan> = {
  "Content Delivery": {
    fyStart: "2026-07",
    tiers: [
      { target: 4_840_000, bonus: 15_000, note: "25% above the Apr–Jun average (~10% above June's run rate)" },
      { target: 5_030_000, bonus: 25_000, note: "30% above the Apr–Jun average (~14% above June's run rate)" },
      { target: 5_220_000, bonus: 30_000, note: "35% above the Apr–Jun average (~19% above June's run rate)" },
      { target: 5_800_000, bonus: 35_000, note: "50% above the Apr–Jun average (~32% above June's run rate)" },
    ],
  },
};

export async function getDivisionBonusPlan(division: string): Promise<DivisionBonusPlan | null> {
  const row = await db.integrationConfig.findUnique({ where: { provider: DIVISION_GOALS_PROVIDER } });
  if (row?.configJson && row.configJson !== "{}") {
    try {
      const parsed = JSON.parse(row.configJson) as Record<string, DivisionBonusPlan>;
      const plan = parsed[division];
      if (plan?.fyStart && Array.isArray(plan.tiers) && plan.tiers.length > 0) return plan;
    } catch {
      // Fall through to the defaults rather than hiding the card on bad JSON.
    }
  }
  return DEFAULT_DIVISION_GOALS[division] ?? null;
}

/**
 * Progress against a division's bonus tiers.
 *
 * `monthlyRevenue` is the division's month-by-month revenue, oldest first. The
 * projection extends the latest month across the rest of the period — a simple
 * run-rate, which is what the tiers were themselves derived from, rather than a
 * trend fit that would imply more precision than exists three months in.
 */
export function computeGoalProgress(
  plan: DivisionBonusPlan,
  monthlyRevenue: { month: string; revenue: number }[]
): DivisionGoalProgress {
  const inPeriod = monthlyRevenue
    .filter((m) => m.month >= plan.fyStart)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(0, MONTHS_IN_PERIOD);

  const cumulative = inPeriod.reduce((s, m) => s + m.revenue, 0);
  const monthsElapsed = inPeriod.length;
  const latestMonthly = inPeriod[inPeriod.length - 1]?.revenue ?? 0;
  const projected = cumulative + latestMonthly * Math.max(0, MONTHS_IN_PERIOD - monthsElapsed);

  const tiers: TierProgress[] = plan.tiers
    .slice()
    .sort((a, b) => a.target - b.target)
    .map((t) => ({
      ...t,
      attained: cumulative >= t.target,
      projectedToHit: projected >= t.target,
      percentOfTarget: t.target > 0 ? Number(((cumulative / t.target) * 100).toFixed(1)) : 0,
      shortfall: Math.max(0, t.target - projected),
    }));

  // Bonuses are tiers, not cumulative — the highest one reached is what pays.
  const highest = (pred: (t: TierProgress) => boolean) =>
    tiers.filter(pred).reduce((max, t) => Math.max(max, t.bonus), 0);

  return {
    fyStart: plan.fyStart,
    fyStartLabel: formatMonth(plan.fyStart),
    monthsElapsed,
    monthsInPeriod: MONTHS_IN_PERIOD,
    cumulative,
    latestMonthly,
    projected,
    tiers,
    currentBonus: highest((t) => t.attained),
    projectedBonus: highest((t) => t.projectedToHit),
  };
}
