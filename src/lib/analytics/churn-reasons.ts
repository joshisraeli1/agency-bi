/**
 * Churn reason breakdown.
 *
 * HubSpot's "Reasons for Churn" is a MULTI-SELECT, stored in
 * `HubspotDeal.churnReason` as a semicolon-delimited string ("Peformance;
 * Account Management"). Every reason on a deal is counted, so the mention
 * total exceeds the deal count — both surfaces state that explicitly rather
 * than presenting the donut as a share of churned clients.
 *
 * Scoping matches the other churn surfaces: excluded clients are dropped, and
 * so are downsell predecessors, since the app already treats a downsell as a
 * contraction rather than a lost client.
 */
import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";
import { getDownsellResolution } from "./downsells";
import { getMonthRange, toMonthKey } from "@/lib/utils";
import { DISPLAY_LABELS, OTHER_REASON, UNSPECIFIED_REASON } from "./churn-reason-labels";

export interface ChurnReasonTotal {
  reason: string;
  count: number;
}

export interface ChurnReasonMonthRow {
  month: string; // yyyy-MM
  /** Top-6 reasons plus "Other" — the charted series only. */
  counts: Record<string, number>;
  /** reason → deal names, for the click-a-month drill-down. */
  deals: Record<string, string[]>;
}

export interface ChurnReasonsData {
  /** Every reason in range, descending by count. */
  totals: ChurnReasonTotal[];
  /** The reasons charted as their own stack series. */
  topReasons: string[];
  byMonth: ChurnReasonMonthRow[];
  churnedDeals: number;
  /** ≥ churnedDeals, because a deal can cite several reasons. */
  reasonMentions: number;
  unspecified: number;
}

/** How many reasons get their own colour in the stacked chart. */
const TOP_N = 6;

/**
 * Split the multi-select into individual reasons. A "Downsell" token is
 * dropped: the deal it sits on is a contraction, not a lost client.
 */
function splitReasons(raw: string | null): string[] {
  const parts = (raw ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== "downsell")
    .map((s) => DISPLAY_LABELS[s] ?? s);
  return parts.length > 0 ? [...new Set(parts)] : [UNSPECIFIED_REASON];
}

export async function getChurnReasons(months: number): Promise<ChurnReasonsData> {
  const monthRange = getMonthRange(months);
  const inRange = new Set(monthRange);

  const [excludedIds, downsells, deals] = await Promise.all([
    getExcludedClientIds(),
    getDownsellResolution(),
    db.hubspotDeal.findMany({
      where: { churnDate: { not: null } },
      select: { id: true, clientId: true, name: true, churnDate: true, churnReason: true },
    }),
  ]);

  // Plain churnDate rather than `windowKeys`: a handover-shifted churn month
  // only ever belongs to a downsell predecessor, and those are filtered out.
  const visible = deals.filter(
    (d) =>
      !(d.clientId && excludedIds.has(d.clientId)) &&
      !downsells.predecessorIds.has(d.id) &&
      d.churnDate != null &&
      inRange.has(toMonthKey(d.churnDate))
  );

  const totalsMap = new Map<string, number>();
  let reasonMentions = 0;
  let unspecified = 0;
  const perMonth = new Map<string, Map<string, string[]>>();

  for (const d of visible) {
    const month = toMonthKey(d.churnDate!);
    const reasons = splitReasons(d.churnReason);
    if (reasons[0] === UNSPECIFIED_REASON) unspecified++;

    let monthBucket = perMonth.get(month);
    if (!monthBucket) {
      monthBucket = new Map();
      perMonth.set(month, monthBucket);
    }

    for (const reason of reasons) {
      totalsMap.set(reason, (totalsMap.get(reason) ?? 0) + 1);
      reasonMentions++;
      const names = monthBucket.get(reason);
      if (names) names.push(d.name);
      else monthBucket.set(reason, [d.name]);
    }
  }

  const totals = [...totalsMap]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const topReasons = totals.slice(0, TOP_N).map((t) => t.reason);
  const isTop = new Set(topReasons);

  const byMonth = monthRange.map((month) => {
    const bucket = perMonth.get(month);
    const counts: Record<string, number> = {};
    const dealNames: Record<string, string[]> = {};
    for (const key of [...topReasons, OTHER_REASON]) counts[key] = 0;

    for (const [reason, names] of bucket ?? []) {
      const series = isTop.has(reason) ? reason : OTHER_REASON;
      counts[series] += names.length;
      // Keep the real reason in the drill-down — collapsing to "Other reasons"
      // in the rollup shouldn't hide which reason a deal actually cited.
      dealNames[reason] = [...(dealNames[reason] ?? []), ...names];
    }

    return { month, counts, deals: dealNames };
  });

  return {
    totals,
    topReasons,
    byMonth,
    churnedDeals: visible.length,
    reasonMentions,
    unspecified,
  };
}
