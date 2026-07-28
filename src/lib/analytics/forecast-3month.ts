import { formatMonth } from "@/lib/utils";

export const STAGE_PROBABILITY: Record<string, number> = {
  "Very Warm": 0.7,
  "Contract out": 0.9,
};

const GST = 1.1;
export const dealExGst = (d: { amountExGst: number | null; amount: number | null }): number =>
  d.amountExGst ?? (d.amount != null ? d.amount / GST : 0);

const monthKeyOf = (dt: Date | null | undefined): string | null =>
  dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` : null;

/** The next `n` calendar months after the month of `now` (excludes current). */
export function forecastMonths(now: Date, n = 3): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Median whole-day lag from createDate to startDate over deals that have both. Defaults to 30. */
export function medianCreateToStartLagDays(
  deals: { createDate: Date | null; startDate: Date | null }[]
): number {
  const lags = deals
    .filter((d) => d.createDate && d.startDate)
    .map((d) => Math.round((d.startDate!.getTime() - d.createDate!.getTime()) / 86_400_000))
    .filter((x) => x >= 0)
    .sort((a, b) => a - b);
  if (!lags.length) return 30;
  const mid = Math.floor(lags.length / 2);
  return lags.length % 2 ? lags[mid] : Math.round((lags[mid - 1] + lags[mid]) / 2);
}

export type PipelineDealInput = {
  name: string;
  stageLabel: string | null;
  amountExGst: number | null;
  amount: number | null;
  startDate: Date | null;
  createDate: Date | null;
};

/**
 * Expected start month (yyyy-MM) for an open pipeline deal within the horizon,
 * or null if it falls beyond it. Start date wins; otherwise createDate + median
 * lag. A computed month at/before the current month clamps to the first
 * forecast month (an overdue-but-open deal is expected imminently).
 */
export function expectedStartMonth(
  d: PipelineDealInput,
  medianLagDays: number,
  months: string[],
  now: Date
): string | null {
  void now;
  let key: string | null;
  if (d.startDate) {
    key = monthKeyOf(d.startDate);
  } else if (d.createDate) {
    key = monthKeyOf(new Date(d.createDate.getTime() + medianLagDays * 86_400_000));
  } else {
    key = months[0];
  }
  if (!key) key = months[0];
  const first = months[0];
  const last = months[months.length - 1];
  if (key < first) return first;
  if (key > last) return null;
  return key;
}

export interface ForecastDealRef {
  name: string;
  amount: number;
}

export interface ForecastMonth {
  month: string;
  rawMonth: string;
  starting: number;
  pipelineAdded: number;
  pipelineAssumed: boolean; // true when the run-rate floor exceeded the visible pipeline
  knownChurn: number;
  baselineChurn: number;
  projected: number;
  pipelineDeals: ForecastDealRef[];
  churnDeals: ForecastDealRef[];
}

export interface ThreeMonthForecast {
  currentMrr: number;
  months: ForecastMonth[];
  assumptions: {
    pipelineRunRate: number; // assumed new business/mo for months with thin visible pipeline
    churnRatePct: number;
    medianLagDays: number;
    stageProbabilities: { stage: string; probability: number }[];
  };
}

interface BuildForecastArgs {
  currentMrr: number;
  months: string[];
  pipeline: { name: string; expected: number; month: string }[];
  churn: { name: string; amount: number; month: string }[];
  pipelineRunRate: number;
  churnRate: number;
}

/**
 * Roll the running MRR balance forward across the forecast months.
 *
 * Expected new business each month = max(visible probability-weighted pipeline,
 * pipelineRunRate). The run-rate floor is the "pipeline we'll build" assumption:
 * later months (Sep/Oct) have little visible pipeline only because those deals
 * aren't in the CRM yet, so we assume they land at the recent run-rate rather
 * than zero. When the floor is used, the drill-down still lists whatever visible
 * deals exist and the month is flagged `pipelineAssumed`.
 */
export function buildForecast(args: BuildForecastArgs): ForecastMonth[] {
  const { currentMrr, months, pipeline, churn, pipelineRunRate, churnRate } = args;
  const out: ForecastMonth[] = [];
  let starting = currentMrr;
  for (const m of months) {
    const pDeals = pipeline.filter((p) => p.month === m);
    const visiblePipeline = pDeals.reduce((s, p) => s + p.expected, 0);
    const pipelineAdded = Math.max(visiblePipeline, pipelineRunRate);
    const pipelineAssumed = pipelineRunRate > visiblePipeline;
    const cDeals = churn.filter((c) => c.month === m);
    const knownChurn = cDeals.reduce((s, c) => s + c.amount, 0);
    const baselineChurn = churnRate * Math.max(0, starting - knownChurn);
    const projected = starting + pipelineAdded - knownChurn - baselineChurn;
    out.push({
      month: formatMonth(m),
      rawMonth: m,
      starting: Math.round(starting),
      pipelineAdded: Math.round(pipelineAdded),
      pipelineAssumed,
      knownChurn: Math.round(knownChurn),
      baselineChurn: Math.round(baselineChurn),
      projected: Math.round(projected),
      pipelineDeals: pDeals
        .map((p) => ({ name: p.name, amount: Math.round(p.expected) }))
        .sort((a, b) => b.amount - a.amount),
      churnDeals: cDeals
        .map((c) => ({ name: c.name, amount: Math.round(c.amount) }))
        .sort((a, b) => b.amount - a.amount),
    });
    starting = projected;
  }
  return out;
}

/** Three-month MRR forecast for the Overview page. `db`/`getExcludedClientIds` imported lazily. */
export async function getThreeMonthForecast(now: Date = new Date()): Promise<ThreeMonthForecast> {
  const [{ db }, { getExcludedClientIds }] = await Promise.all([
    import("@/lib/db"),
    import("./excluded-clients"),
  ]);
  const excludedIds = await getExcludedClientIds();
  const deals = await db.hubspotDeal.findMany({
    where: {
      OR: [
        { stageLabel: { in: ["Very Warm", "Contract out", "Closed Won"] } },
        { churnDate: { not: null } },
      ],
    },
    select: {
      name: true,
      clientId: true,
      stageLabel: true,
      amount: true,
      amountExGst: true,
      startDate: true,
      closeDate: true,
      createDate: true,
      churnDate: true,
    },
  });
  const kept = deals.filter((d) => !(d.clientId && excludedIds.has(d.clientId)));
  const months = forecastMonths(now, 3);

  const closedWon = kept.filter((d) => d.stageLabel === "Closed Won");
  const currentMrr = closedWon.reduce((s, d) => s + dealExGst(d), 0);

  // Trailing-N-month month keys (excluding the current month).
  const trailingMonths = (n: number): string[] => {
    const out: string[] = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  };
  const last12 = trailingMonths(12);
  const last3 = trailingMonths(3);

  // Pipeline run-rate = the RECENT (trailing-3mo) monthly new-business rate.
  // Later forecast months have little visible pipeline only because those deals
  // aren't in the CRM yet; we assume they land at this recent run-rate. Using a
  // recent window (not 12mo) reflects the current growth trajectory.
  let recentNewSum = 0;
  for (const d of closedWon) {
    const m = monthKeyOf(d.startDate ?? d.closeDate);
    if (m && last3.includes(m)) recentNewSum += dealExGst(d);
  }
  const pipelineRunRate = recentNewSum / 3;

  // Churn rate stays on the trailing-12mo basis (steady baseline).
  let churnSum = 0;
  for (const d of kept) {
    const m = monthKeyOf(d.churnDate);
    if (m && last12.includes(m)) churnSum += dealExGst(d);
  }
  const churnRate = currentMrr > 0 ? churnSum / 12 / currentMrr : 0;

  const medianLagDays = medianCreateToStartLagDays(closedWon);

  const pipeline: { name: string; expected: number; month: string }[] = [];
  for (const d of kept) {
    if (d.stageLabel !== "Very Warm" && d.stageLabel !== "Contract out") continue;
    const expected = dealExGst(d) * (STAGE_PROBABILITY[d.stageLabel] ?? 0);
    if (expected <= 0) continue;
    const m = expectedStartMonth(d, medianLagDays, months, now);
    if (!m) continue;
    pipeline.push({ name: d.name, expected, month: m });
  }

  // known churn: Closed Won base deals whose churn date lands in the horizon
  const churn: { name: string; amount: number; month: string }[] = [];
  for (const d of closedWon) {
    const m = monthKeyOf(d.churnDate);
    if (m && months.includes(m)) churn.push({ name: d.name, amount: dealExGst(d), month: m });
  }

  const monthsOut = buildForecast({ currentMrr, months, pipeline, churn, pipelineRunRate, churnRate });
  return {
    currentMrr: Math.round(currentMrr),
    months: monthsOut,
    assumptions: {
      pipelineRunRate: Math.round(pipelineRunRate),
      churnRatePct: Math.round(churnRate * 1000) / 10,
      medianLagDays,
      stageProbabilities: Object.entries(STAGE_PROBABILITY).map(([stage, probability]) => ({ stage, probability })),
    },
  };
}
