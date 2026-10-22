import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { isOneOff } from "./upsells";
import {
  COMMISSION_MONTHS,
  COMMISSION_YEAR_END,
  COMMISSION_YEAR_START,
  INITIAL_PERIOD_END,
  PROBATION_END,
  QUALIFIED_MEETING_FEE,
  SIGNING_TARGET,
  rateForClientNumber,
  type Salesperson,
} from "./salespeople";

export interface SignedClient {
  id: string;
  name: string;
  /** Monthly retainer, ex-GST. */
  monthly: number;
  signedAt: Date;
  /** 1-based position in the commission year — this is what sets the rate. */
  clientNumber: number;
  rate: number;
  commission: number;
}

export interface CommissionMonth {
  month: string;
  label: string;
  signings: number;
  /** Deals he created that month. A created deal IS a qualified meeting. */
  qualifiedMeetings: number;
  meetingFees: number;
  commission: number;
  /** Where the running total should be to finish the year on target. */
  targetToDate: number;
  signingsToDate: number;
}

export interface CommissionMilestone {
  label: string;
  due: Date;
  detail: string;
  /** null while the date is still ahead and the measure has no verdict yet. */
  met: boolean | null;
  progress: string;
}

export interface CommissionSales {
  ownerName: string;
  /** True before the commission year opens — the board shows a countdown
   *  rather than a month-0 full of empty charts. */
  notStarted: boolean;
  yearStart: Date;
  yearEnd: Date;
  monthsElapsed: number;
  /** Clients signed in the commission year. */
  signed: number;
  target: number;
  /** Signings needed per remaining month to still reach the target. */
  neededPerMonth: number;
  onPace: boolean;
  nextTierAt: number | null;
  currentRate: number;
  commissionEarned: number;
  qualifiedMeetings: number;
  meetingFees: number;
  totalEarned: number;
  pipelineValue: number;
  pipelineCount: number;
  months: CommissionMonth[];
  clients: SignedClient[];
  milestones: CommissionMilestone[];
}

const monthKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * A salesperson paid per client signed, not per dollar booked.
 *
 * Everything is bounded by the commission year rather than a calendar or fiscal
 * one, because the tiers reset on its anniversary. Commission is applied PER
 * SIGNING in the order they were signed — client 37 earns the higher rate while
 * the 36 before it stay at the lower one, so a single blended rate over the
 * total would overpay the moment a tier is crossed.
 *
 * A qualified meeting is a deal he created: Josh's rule, and it means the
 * measure needs no field that does not already exist.
 */
export async function getCommissionSales(person: Salesperson): Promise<CommissionSales> {
  const now = new Date();
  const [deals, created] = await Promise.all([
    db.hubspotDeal.findMany({
      where: { ownerId: person.ownerId },
      select: {
        id: true, name: true, stage: true, amountExGst: true, amount: true,
        startDate: true, closeDate: true, createDate: true, churnDate: true,
        packageDescription: true,
        contractTerms: true,
      },
    }),
    db.hubspotDeal.count({
      where: {
        ownerId: person.ownerId,
        createDate: { gte: COMMISSION_YEAR_START, lt: COMMISSION_YEAR_END },
      },
    }),
  ]);

  const inYear = (d: Date | null | undefined) =>
    !!d && d >= COMMISSION_YEAR_START && d < COMMISSION_YEAR_END;

  // Signed = closed-won inside the commission year. One-off project work is
  // excluded: commission is a share of retainer fees, and a one-off has no
  // retainer to take six months of.
  const signedDeals = deals
    .filter((d) => d.stage === "closed_won" && !isOneOff(d))
    .map((d) => ({ ...d, signedAt: d.startDate ?? d.closeDate }))
    .filter((d) => inYear(d.signedAt))
    .sort((a, b) => a.signedAt!.getTime() - b.signedAt!.getTime());

  const clients: SignedClient[] = signedDeals.map((d, i) => {
    const monthly = Math.round(d.amountExGst ?? 0);
    const clientNumber = i + 1;
    const rate = rateForClientNumber(clientNumber);
    return {
      id: d.id,
      name: d.name.trim(),
      monthly,
      signedAt: d.signedAt!,
      clientNumber,
      rate,
      commission: Math.round(monthly * COMMISSION_MONTHS * rate),
    };
  });

  const commissionEarned = clients.reduce((s, c) => s + c.commission, 0);
  const qualifiedMeetings = created;
  const meetingFees = qualifiedMeetings * QUALIFIED_MEETING_FEE;

  // Open pipeline — anything not won and not lost.
  const open = deals.filter(
    (d) => d.stage !== "closed_won" && d.stage !== "churned" && !d.churnDate
  );
  const pipelineValue = Math.round(open.reduce((s, d) => s + (d.amountExGst ?? 0), 0));

  // Months of the commission year up to now, so the chart does not run ahead
  // into empty future months.
  const months: CommissionMonth[] = [];
  const cursor = new Date(COMMISSION_YEAR_START);
  let elapsed = 0;
  while (cursor < COMMISSION_YEAR_END && cursor <= now) {
    const key = monthKeyOf(cursor);
    elapsed++;
    const signingsThisMonth = clients.filter((c) => monthKeyOf(c.signedAt) === key);
    const meetingsThisMonth = deals.filter(
      (d) => d.createDate && inYear(d.createDate) && monthKeyOf(d.createDate) === key
    ).length;
    months.push({
      month: key,
      label: formatMonth(key),
      signings: signingsThisMonth.length,
      qualifiedMeetings: meetingsThisMonth,
      meetingFees: meetingsThisMonth * QUALIFIED_MEETING_FEE,
      commission: signingsThisMonth.reduce((s, c) => s + c.commission, 0),
      targetToDate: Math.round((SIGNING_TARGET / 12) * elapsed),
      signingsToDate: 0, // filled below
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  let running = 0;
  for (const m of months) {
    running += m.signings;
    m.signingsToDate = running;
  }

  const monthsRemaining = Math.max(0, 12 - elapsed);
  const shortfall = Math.max(0, SIGNING_TARGET - clients.length);
  const latest = months[months.length - 1];

  const milestone = (
    label: string,
    due: Date,
    detail: string,
    met: boolean,
    progress: string
  ): CommissionMilestone => ({
    label,
    due,
    detail,
    // No verdict before the date falls — a target not yet due is not a target missed.
    met: now < due ? null : met,
    progress,
  });

  const milestones: CommissionMilestone[] = [
    milestone(
      "Initial Period",
      INITIAL_PERIOD_END,
      "First clients signed in Nov–Dec 2026, so the first commission lands with January pay.",
      clients.some((c) => ["2026-11", "2026-12"].includes(monthKeyOf(c.signedAt))),
      `${clients.filter((c) => ["2026-11", "2026-12"].includes(monthKeyOf(c.signedAt))).length} signed in Nov–Dec`
    ),
    milestone(
      "Probation · 6 months",
      PROBATION_END,
      "Tracking at or above 18 commissionable clients signed.",
      clients.length >= 18,
      `${clients.length} of 18`
    ),
    milestone(
      "Commission year",
      COMMISSION_YEAR_END,
      "36 clients signed, with the higher tiers beyond.",
      clients.length >= SIGNING_TARGET,
      `${clients.length} of ${SIGNING_TARGET}`
    ),
  ];

  return {
    ownerName: person.name,
    notStarted: now < COMMISSION_YEAR_START,
    yearStart: COMMISSION_YEAR_START,
    yearEnd: COMMISSION_YEAR_END,
    monthsElapsed: elapsed,
    signed: clients.length,
    target: SIGNING_TARGET,
    neededPerMonth: monthsRemaining > 0 ? Number((shortfall / monthsRemaining).toFixed(1)) : shortfall,
    onPace: clients.length >= (latest?.targetToDate ?? 0),
    nextTierAt: clients.length < 36 ? 37 : clients.length < 45 ? 46 : null,
    currentRate: rateForClientNumber(clients.length + 1),
    commissionEarned,
    qualifiedMeetings,
    meetingFees,
    totalEarned: commissionEarned + meetingFees,
    pipelineValue,
    pipelineCount: open.length,
    months,
    clients: clients.slice().reverse(),
    milestones,
  };
}
