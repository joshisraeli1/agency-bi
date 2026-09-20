import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";

export const DIVISION_GOALS_PROVIDER = "division_goals";

/**
 * What a tier's target is measured against.
 *
 * "cumulative" — division revenue added up across the period. Money banked:
 * it only ever rises, and a tier once reached stays reached.
 *
 * "final-month" — the division's monthly revenue where it LANDS at the end of
 * the period. A level, not a total: it can fall as well as rise, and nothing is
 * settled until the last month. Francesca's plan reads this way.
 */
export type BonusBasis = "cumulative" | "final-month";

export interface BonusTier {
  /** Ex-GST division revenue — a running total under "cumulative", a monthly
   *  rate under "final-month". */
  target: number;
  bonus: number;
  note?: string; // how the target was derived, shown on hover
}

export interface DivisionBonusPlan {
  /** First month of the measurement period, "YYYY-MM". */
  fyStart: string;
  /** Defaults to "cumulative" — an existing plan carries no basis and must keep
   *  behaving exactly as it did. */
  basis?: BonusBasis;
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
  /** Last month of the period — when a "final-month" plan settles. */
  endLabel: string;
  basis: BonusBasis;
  monthsElapsed: number;
  monthsInPeriod: number;
  cumulative: number;
  latestMonthly: number;
  projected: number;
  /** The figure the tiers are actually judged against: `cumulative` under a
   *  cumulative plan, `latestMonthly` under a final-month one. The card reads
   *  this rather than re-deciding which number applies. */
  measured: number;
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
  // Francesca's plan is written the other way round: a monthly revenue LEVEL,
  // settled on where the division lands at the end of the 12 months, not a
  // total accumulated along the way. Read as cumulative these targets would
  // clear in the first month.
  "Social Media Management": {
    fyStart: "2026-07",
    basis: "final-month",
    tiers: [
      { target: 100_000, bonus: 5_000, note: "Monthly revenue in the final month of the period" },
      { target: 120_000, bonus: 10_000, note: "Monthly revenue in the final month of the period" },
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

/** Last month of the period, "YYYY-MM" — `fyStart` plus eleven months. */
function periodEnd(fyStart: string): string {
  const [y, m] = fyStart.split("-").map(Number);
  const d = new Date(y, m - 1 + (MONTHS_IN_PERIOD - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Progress against a division's bonus tiers.
 *
 * `monthlyRevenue` is the division's month-by-month revenue, oldest first. The
 * projection extends the latest month across the rest of the period — a simple
 * run-rate, which is what the tiers were themselves derived from, rather than a
 * trend fit that would imply more precision than exists three months in.
 *
 * Which figure the tiers are judged against depends on the plan's basis. A
 * cumulative plan measures the running total; a final-month plan measures the
 * latest month's revenue, because that is the number the bonus settles on. Under
 * a final-month plan the run-rate projection IS the latest month, so `measured`
 * and `projected` coincide and `attained` means "currently above", not "banked".
 */
export function computeGoalProgress(
  plan: DivisionBonusPlan,
  monthlyRevenue: { month: string; revenue: number }[]
): DivisionGoalProgress {
  const inPeriod = monthlyRevenue
    .filter((m) => m.month >= plan.fyStart)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(0, MONTHS_IN_PERIOD);

  const basis: BonusBasis = plan.basis ?? "cumulative";
  const cumulative = inPeriod.reduce((s, m) => s + m.revenue, 0);
  const monthsElapsed = inPeriod.length;
  const latestMonthly = inPeriod[inPeriod.length - 1]?.revenue ?? 0;
  const projected =
    basis === "final-month"
      ? latestMonthly
      : cumulative + latestMonthly * Math.max(0, MONTHS_IN_PERIOD - monthsElapsed);
  const measured = basis === "final-month" ? latestMonthly : cumulative;

  const tiers: TierProgress[] = plan.tiers
    .slice()
    .sort((a, b) => a.target - b.target)
    .map((t) => ({
      ...t,
      attained: measured >= t.target,
      projectedToHit: projected >= t.target,
      percentOfTarget: t.target > 0 ? Number(((measured / t.target) * 100).toFixed(1)) : 0,
      shortfall: Math.max(0, t.target - projected),
    }));

  // Bonuses are tiers, not cumulative — the highest one reached is what pays.
  const highest = (pred: (t: TierProgress) => boolean) =>
    tiers.filter(pred).reduce((max, t) => Math.max(max, t.bonus), 0);

  return {
    fyStart: plan.fyStart,
    fyStartLabel: formatMonth(plan.fyStart),
    endLabel: formatMonth(periodEnd(plan.fyStart)),
    basis,
    monthsElapsed,
    monthsInPeriod: MONTHS_IN_PERIOD,
    cumulative,
    latestMonthly,
    projected,
    measured,
    tiers,
    currentBonus: highest((t) => t.attained),
    projectedBonus: highest((t) => t.projectedToHit),
  };
}
