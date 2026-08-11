import { formatMonth } from "@/lib/utils";
import { windowKeys, type DownsellResolution } from "./downsells";

export const DIVISIONS = ["Content Delivery", "Social Media Management", "Ads Management"] as const;
export type Division = (typeof DIVISIONS)[number];

/**
 * Split a deal's revenue across divisions by its contentPackageType.
 * "social and ads management" (full suite) splits 50/50 between SMM and Ads;
 * unrecognized types fall into Content Delivery. Matches divisionRevenueTrend.
 */
export function dealDivisionSplit(
  contentPackageType: string | null
): Array<{ division: Division; fraction: number }> {
  const pkg = (contentPackageType || "").toLowerCase().trim();
  if (pkg === "social media" || pkg === "social media management") {
    return [{ division: "Social Media Management", fraction: 1 }];
  }
  if (pkg === "social and ads management") {
    return [
      { division: "Social Media Management", fraction: 0.5 },
      { division: "Ads Management", fraction: 0.5 },
    ];
  }
  if (pkg === "meta ads" || pkg === "ads management") {
    return [{ division: "Ads Management", fraction: 1 }];
  }
  return [{ division: "Content Delivery", fraction: 1 }];
}

const monthKeyOf = (dt: Date | null | undefined): string | null =>
  dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` : null;

/** First month (yyyy-MM) of the AU financial year (Jul–Jun) containing `now`. */
export function financialYearStartMonth(now: Date): string {
  // getMonth() is 0-based; 6 = July.
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-07`;
}

/** Month keys from the FY start month through the month of `now`, inclusive. */
export function financialYearMonths(now: Date): string[] {
  const [sy, sm] = financialYearStartMonth(now).split("-").map(Number);
  const endKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months: string[] = [];
  let y = sy;
  let m = sm;
  for (let i = 0; i < 12; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push(key);
    if (key === endKey) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

export type DivisionDealInput = {
  /** Optional so existing pure-helper call sites/fixtures need not supply one;
   * required in practice once a `downsells` resolution is passed in, since
   * `windowKeys` looks pairs up by id. */
  id?: string;
  clientId: string | null;
  amountExGst: number | null;
  startDate: Date | null;
  closeDate: Date | null;
  churnDate: Date | null;
  contentPackageType: string | null;
};

/**
 * Recognized ex-GST division revenue for a single month (non-cumulative).
 *
 * When a `downsells` resolution is supplied, a held-out (unpaired) downsell is
 * excluded, and each deal's active window comes from `windowKeys` instead of
 * its raw dates — so a downsell pair's handover month overrides the raw
 * start/churn dates exactly as it does on every other fixed surface. Omitting
 * `downsells` (the existing test fixtures do) reproduces the prior raw-date
 * behaviour unchanged.
 */
export function divisionRevenueForMonth(
  deals: DivisionDealInput[],
  month: string,
  excludedIds: Set<string>,
  downsells?: DownsellResolution
): Record<Division, number> {
  const rev: Record<Division, number> = {
    "Content Delivery": 0,
    "Social Media Management": 0,
    "Ads Management": 0,
  };
  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    if (downsells?.heldOutIds.has(d.id ?? "")) continue;
    const { startKey, churnKey } = downsells
      ? windowKeys({ id: d.id ?? "", startDate: d.startDate, closeDate: d.closeDate, churnDate: d.churnDate }, downsells)
      : { startKey: monthKeyOf(d.startDate ?? d.closeDate), churnKey: monthKeyOf(d.churnDate) };
    if (!startKey) continue;
    if (!(month >= startKey && (!churnKey || month < churnKey))) continue;
    const amt = d.amountExGst ?? 0;
    if (!amt) continue;
    for (const { division, fraction } of dealDivisionSplit(d.contentPackageType)) {
      rev[division] += amt * fraction;
    }
  }
  return rev;
}

export interface CumulativeDivisionMonth {
  month: string; // display, e.g. "Jul 2026"
  rawMonth: string; // "2026-07"
  "Content Delivery": number;
  "Social Media Management": number;
  "Ads Management": number;
}

/** Running-sum the per-month division totals into cumulative FY-to-date values. */
export function cumulateDivisionMonths(
  months: string[],
  perMonth: Record<Division, number>[]
): CumulativeDivisionMonth[] {
  const running: Record<Division, number> = {
    "Content Delivery": 0,
    "Social Media Management": 0,
    "Ads Management": 0,
  };
  return months.map((month, i) => {
    for (const div of DIVISIONS) running[div] += perMonth[i][div];
    return {
      month: formatMonth(month),
      rawMonth: month,
      "Content Delivery": Math.round(running["Content Delivery"]),
      "Social Media Management": Math.round(running["Social Media Management"]),
      "Ads Management": Math.round(running["Ads Management"]),
    };
  });
}

/**
 * Cumulative recognized revenue per division across the current FY to date.
 * `db` and `getExcludedClientIds` are imported lazily so the pure helpers above
 * stay importable (e.g. from the tsx test) without triggering Prisma init.
 */
export async function getCumulativeDivisionRevenueFY(
  now: Date = new Date()
): Promise<CumulativeDivisionMonth[]> {
  const [{ db }, { getExcludedClientIds }, { getDownsellResolution }] = await Promise.all([
    import("@/lib/db"),
    import("./excluded-clients"),
    import("./downsells"),
  ]);
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: {
        id: true,
        clientId: true,
        amountExGst: true,
        startDate: true,
        closeDate: true,
        churnDate: true,
        contentPackageType: true,
      },
    }),
    getDownsellResolution(),
  ]);
  const months = financialYearMonths(now);
  const perMonth = months.map((m) => divisionRevenueForMonth(deals, m, excludedIds, downsells));
  return cumulateDivisionMonths(months, perMonth);
}
