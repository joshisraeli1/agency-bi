import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";

export const MICHAEL_OWNER_ID = "76570622";
export const MICHAEL_NAME = "Michael Shenfield";

export const MICHAEL_GOALS_PROVIDER = "michael_goals";

export interface PeriodGoal {
  monthly: number;
  quarterly: number;
  annual: number;
}

export interface MichaelGoals {
  recurringRevenue: number; // MRR target (point-in-time)
  newRevenue: PeriodGoal; // new revenue won per period
  dealsCreated: PeriodGoal; // deals created per period
}

// Defaults (editable in-app via the "michael_goals" config row)
export const DEFAULT_MICHAEL_GOALS: MichaelGoals = {
  recurringRevenue: 100_000,
  newRevenue: { monthly: 20_000, quarterly: 60_000, annual: 240_000 },
  dealsCreated: { monthly: 5, quarterly: 15, annual: 60 },
};

function posNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}
function mergePeriod(v: Record<string, unknown> | undefined, d: PeriodGoal): PeriodGoal {
  return {
    monthly: posNum(v?.monthly, d.monthly),
    quarterly: posNum(v?.quarterly, d.quarterly),
    annual: posNum(v?.annual, d.annual),
  };
}

export async function getMichaelGoals(): Promise<MichaelGoals> {
  const row = await db.integrationConfig.findUnique({ where: { provider: MICHAEL_GOALS_PROVIDER } });
  if (!row?.configJson || row.configJson === "{}") return DEFAULT_MICHAEL_GOALS;
  try {
    const g = JSON.parse(row.configJson);
    return {
      recurringRevenue: posNum(g.recurringRevenue, DEFAULT_MICHAEL_GOALS.recurringRevenue),
      newRevenue: mergePeriod(g.newRevenue, DEFAULT_MICHAEL_GOALS.newRevenue),
      dealsCreated: mergePeriod(g.dealsCreated, DEFAULT_MICHAEL_GOALS.dealsCreated),
    };
  } catch {
    return DEFAULT_MICHAEL_GOALS;
  }
}

export interface Progress {
  actual: number;
  goal: number;
}
export interface PeriodProgress {
  monthly: Progress;
  quarterly: Progress;
  annual: Progress;
}
export interface MichaelProgressData {
  recurringRevenue: Progress;
  newRevenue: PeriodProgress;
  dealsCreated: PeriodProgress;
}

export interface MonthlyValue {
  month: string; // YYYY-MM
  value: number;
}

export interface DealRef {
  name: string;
  amount: number;
}

export interface PipelineStage {
  stage: string;
  count: number;
  value: number;
  deals: DealRef[];
}

export interface CommissionMonth {
  month: string;
  meetingsBooked: number;
  meetingCommission: number;
  dealCommission: number;
  total: number;
  ownedDeals: { name: string; monthly: number; rate: number }[];
}

export interface MichaelCommission {
  months: CommissionMonth[];
  total: number;
  currentMonthTotal: number;
}

export interface MichaelSalesData {
  ownerName: string;
  goals: MichaelGoals;
  progress: MichaelProgressData;
  pipeline: PipelineStage[];
  commission: MichaelCommission;
  // Headline tiles (+ the deals behind each, for click-through)
  currentMrr: number;
  lifetimeRevenue: number;
  activeDealCount: number;
  dealsCreatedLast12mo: number;
  currentMrrDeals: DealRef[];
  lifetimeDeals: DealRef[];
  activeDeals: DealRef[];
  dealsCreated12moDeals: DealRef[];
  // Trend series (24 months)
  monthlyRevenue: MonthlyValue[];
  newRevenuePerMonth: MonthlyValue[];
  dealsCreatedPerMonth: MonthlyValue[];
  // Per-month deal detail for drill-down (keyed by YYYY-MM)
  mrrDealsByMonth: Record<string, DealRef[]>;
  createdDealsByMonth: Record<string, DealRef[]>;
  newRevenueDealsByMonth: Record<string, DealRef[]>;
}

function emptySeries(months: string[]): MonthlyValue[] {
  return months.map((m) => ({ month: m, value: 0 }));
}

function applyToSeries(series: MonthlyValue[], month: string, delta: number): void {
  const idx = series.findIndex((s) => s.month === month);
  if (idx >= 0) series[idx].value += delta;
}

function toMonthKey(d: Date | null | undefined): string | null {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getMichaelSalesData(): Promise<MichaelSalesData> {
  const months24 = getMonthRange(24);
  const currentMonth = months24[months24.length - 1];
  const twelveMonthsAgoKey = months24[months24.length - 12];
  const goals = await getMichaelGoals();

  // -----------------------------------------------------------------------
  // Deal-level data (HubspotDeal)
  // -----------------------------------------------------------------------
  const deals = await db.hubspotDeal.findMany({
    where: { ownerId: MICHAEL_OWNER_ID },
    select: {
      id: true,
      name: true,
      stage: true,
      stageLabel: true,
      amountExGst: true,
      amount: true,
      startDate: true,
      createDate: true,
      closeDate: true,
      churnDate: true,
      commissionType: true,
    },
  });

  // Pipeline snapshot: deal count + value per active stage, in progression order.
  const PIPELINE_STAGES = ["Interested", "Very Warm", "Contract out", "Closed Won"];
  const pipeline = PIPELINE_STAGES.map((stage) => {
    const ds = deals.filter((d) => d.stageLabel === stage);
    return {
      stage,
      count: ds.length,
      value: Math.round(ds.reduce((s, d) => s + (d.amountExGst ?? d.amount ?? 0), 0)),
      deals: ds
        .map((d) => ({ name: d.name, amount: Math.round(d.amountExGst ?? d.amount ?? 0) }))
        .sort((a, b) => b.amount - a.amount),
    };
  });

  // -----------------------------------------------------------------------
  // Commission
  //   - Meeting commission: a "meeting booked" = a deal Michael created.
  //     rate $185/deal, except 2026-06 = $175 (July+ back to $185).
  //   - Deal commission: deals tagged commission_type="Owned" pay 9% of the
  //     deal's monthly ex-GST value, every month for 6 months from its start.
  // -----------------------------------------------------------------------
  const meetingRate = (m: string) => (m === "2026-06" ? 175 : 185);
  const mIdx = (k: string) => { const [y, mo] = k.split("-").map(Number); return y * 12 + (mo - 1); };
  const mFromIdx = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

  const meetingsByMonth = new Map<string, number>();
  for (const d of deals) {
    const k = toMonthKey(d.createDate);
    if (k) meetingsByMonth.set(k, (meetingsByMonth.get(k) || 0) + 1);
  }

  // Deals on commission: Owned = 9%, Support = 1.75%, of the deal's monthly
  // ex-GST value, each month for 6 months from the deal's start.
  const commDeals = deals
    .filter((d) => d.commissionType === "Owned" || d.commissionType === "Support")
    .map((d) => {
      const startK = toMonthKey(d.startDate ?? d.closeDate);
      const monthlyEx = d.amountExGst ?? (d.amount != null ? d.amount / 1.1 : 0);
      const rate = d.commissionType === "Owned" ? 9 : 1.75;
      return { startK, name: d.name, rate, monthly: (rate / 100) * monthlyEx };
    })
    .filter((d): d is { startK: string; name: string; rate: number; monthly: number } => d.startK !== null);

  // Window: earliest commission-deal start (so 2025 "Owned" deals show) through
  // the later of the current month and the latest 6-month window end.
  const startIdx = commDeals.length
    ? Math.min(...commDeals.map((d) => mIdx(d.startK)))
    : mIdx(currentMonth) - 1;
  let endIdx = mIdx(currentMonth);
  for (const d of commDeals) endIdx = Math.max(endIdx, mIdx(d.startK) + 5);

  const commissionMonths: CommissionMonth[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const month = mFromIdx(i);
    const meetingsBooked = meetingsByMonth.get(month) || 0;
    const meetingCommission = Math.round(meetingsBooked * meetingRate(month));
    const ownedThis = commDeals.filter((d) => { const s = mIdx(d.startK); return i >= s && i <= s + 5; });
    const dealCommission = Math.round(ownedThis.reduce((s, d) => s + d.monthly, 0));
    commissionMonths.push({
      month,
      meetingsBooked,
      meetingCommission,
      dealCommission,
      total: meetingCommission + dealCommission,
      ownedDeals: ownedThis
        .map((d) => ({ name: d.name, monthly: Math.round(d.monthly), rate: d.rate }))
        .sort((a, b) => b.monthly - a.monthly),
    });
  }
  const commission: MichaelCommission = {
    months: commissionMonths,
    total: commissionMonths.reduce((s, m) => s + m.total, 0),
    currentMonthTotal: commissionMonths.find((m) => m.month === currentMonth)?.total ?? 0,
  };

  // Per-month deal detail for drill-down
  const mrrDealsByMonth: Record<string, DealRef[]> = {};
  const createdDealsByMonth: Record<string, DealRef[]> = {};
  const newRevenueDealsByMonth: Record<string, DealRef[]> = {};

  // Active deals = stage closed_won and not yet churned (or no churn date)
  const now = new Date();
  const activeDeals = deals
    .filter((d) => d.stage === "closed_won" && (!d.churnDate || d.churnDate > now))
    .map((d) => ({ name: d.name, amount: d.amountExGst ?? d.amount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const activeDealCount = activeDeals.length;

  // Deals created per month + total in last 12mo
  const dealsCreatedPerMonth = emptySeries(months24);
  let dealsCreatedLast12mo = 0;
  for (const d of deals) {
    const key = toMonthKey(d.createDate);
    if (!key) continue;
    applyToSeries(dealsCreatedPerMonth, key, 1);
    if (key >= twelveMonthsAgoKey) dealsCreatedLast12mo += 1;
    (createdDealsByMonth[key] ??= []).push({ name: d.name, amount: d.amountExGst ?? d.amount ?? 0 });
  }

  // New revenue per month = closed-won deals' ex-GST amount, bucketed by startDate
  // (fallback: closeDate). Counts the deal value once in the month it began.
  const newRevenuePerMonth = emptySeries(months24);
  for (const d of deals) {
    if (d.stage !== "closed_won") continue;
    const amt = d.amountExGst ?? d.amount ?? 0;
    if (!amt) continue;
    const startKey = toMonthKey(d.startDate ?? d.closeDate);
    if (!startKey) continue;
    applyToSeries(newRevenuePerMonth, startKey, amt);
    (newRevenueDealsByMonth[startKey] ??= []).push({ name: d.name, amount: amt });
  }

  // -----------------------------------------------------------------------
  // Monthly recurring revenue from deal active windows (closed_won / churned),
  // ex-GST. Avoids the stale/partial FinancialRecord store that made the
  // current month collapse.
  // -----------------------------------------------------------------------
  const monthlyRevenue = emptySeries(months24);
  const lifetimeDeals: DealRef[] = [];
  let lifetimeRevenue = 0;
  let currentMrr = 0;

  const monthIndex = (key: string): number => {
    const [y, m] = key.split("-").map(Number);
    return y * 12 + (m - 1);
  };
  const currentIdx = monthIndex(currentMonth);

  for (const d of deals) {
    if (d.stage !== "closed_won" && !d.churnDate) continue;
    const startKey = toMonthKey(d.startDate ?? d.closeDate);
    if (!startKey) continue;
    const churnKey = toMonthKey(d.churnDate);
    const amt = d.amountExGst ?? d.amount ?? 0;
    if (!amt) continue;

    // Monthly series within the visible 24-month window
    for (const m of months24) {
      if (m >= startKey && (!churnKey || m < churnKey)) {
        applyToSeries(monthlyRevenue, m, amt);
        (mrrDealsByMonth[m] ??= []).push({ name: d.name, amount: amt });
        if (m === currentMonth) currentMrr += amt;
      }
    }

    // Lifetime = amount × number of active months (start → churn, else → now)
    const endIdx = churnKey ? monthIndex(churnKey) - 1 : currentIdx;
    const activeMonths = Math.max(0, endIdx - monthIndex(startKey) + 1);
    const lifetimeAmt = amt * activeMonths;
    lifetimeRevenue += lifetimeAmt;
    if (lifetimeAmt > 0) lifetimeDeals.push({ name: d.name, amount: lifetimeAmt });
  }
  lifetimeDeals.sort((a, b) => b.amount - a.amount);
  const dealsCreated12moDeals = Object.entries(createdDealsByMonth)
    .filter(([k]) => k >= twelveMonthsAgoKey)
    .flatMap(([, v]) => v)
    .sort((a, b) => b.amount - a.amount);
  const currentMrrDeals = [...(mrrDealsByMonth[currentMonth] ?? [])].sort((a, b) => b.amount - a.amount);

  // -----------------------------------------------------------------------
  // Goal progress (current month / quarter / year actuals vs goals)
  // -----------------------------------------------------------------------
  const [cy, cmo] = currentMonth.split("-").map(Number);
  const cq = Math.ceil(cmo / 3);
  const inYear = (m: string) => Number(m.slice(0, 4)) === cy;
  const inQuarter = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    return y === cy && Math.ceil(mo / 3) === cq;
  };
  const sumSeries = (series: MonthlyValue[], pred: (m: string) => boolean) =>
    series.filter((s) => pred(s.month)).reduce((a, s) => a + s.value, 0);

  const progress: MichaelProgressData = {
    recurringRevenue: { actual: Math.round(currentMrr), goal: goals.recurringRevenue },
    newRevenue: {
      monthly: { actual: Math.round(sumSeries(newRevenuePerMonth, (m) => m === currentMonth)), goal: goals.newRevenue.monthly },
      quarterly: { actual: Math.round(sumSeries(newRevenuePerMonth, inQuarter)), goal: goals.newRevenue.quarterly },
      annual: { actual: Math.round(sumSeries(newRevenuePerMonth, inYear)), goal: goals.newRevenue.annual },
    },
    dealsCreated: {
      monthly: { actual: sumSeries(dealsCreatedPerMonth, (m) => m === currentMonth), goal: goals.dealsCreated.monthly },
      quarterly: { actual: sumSeries(dealsCreatedPerMonth, inQuarter), goal: goals.dealsCreated.quarterly },
      annual: { actual: sumSeries(dealsCreatedPerMonth, inYear), goal: goals.dealsCreated.annual },
    },
  };

  return {
    ownerName: MICHAEL_NAME,
    goals,
    progress,
    pipeline,
    commission,
    currentMrr,
    lifetimeRevenue,
    activeDealCount,
    dealsCreatedLast12mo,
    currentMrrDeals,
    lifetimeDeals,
    activeDeals,
    dealsCreated12moDeals,
    monthlyRevenue,
    newRevenuePerMonth,
    dealsCreatedPerMonth,
    mrrDealsByMonth,
    createdDealsByMonth,
    newRevenueDealsByMonth,
  };
}
