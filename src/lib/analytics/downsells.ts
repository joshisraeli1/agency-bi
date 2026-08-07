/**
 * Downsell pairing.
 *
 * A downsell is a package downgrade recorded in HubSpot as TWO deals: the
 * superseded deal is churned (Churn Date = handover, Reasons for Churn =
 * "Downsell") and a replacement deal is created at the lower amount with
 * Package Description = "Downsell" and Start Date = the same handover.
 *
 * Left alone, every surface reads that as a churned client plus a new client.
 * This module pairs the two and treats them as ONE continuous deal: only the
 * net contraction books as churn, nothing books as new revenue, the deal count
 * stays flat, and the client's tenure runs unbroken from the original start.
 *
 * "Package Description = Downsell" is the signal; the deal NAME is only used
 * afterwards to work out which company the deal belongs to. A name fallback
 * exists for untagged deals, mirroring `isUpsell`.
 *
 * This is the single source of truth — every analytics surface that enumerates
 * deals consults the resolution rather than re-deriving the rule.
 * Reconciliation does NOT (it matches individual deals to Xero invoices).
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { companyRoot, normalize, dealDivision } from "./upsells";

export interface PairableDeal {
  id: string;
  name: string;
  clientId?: string | null;
  stage?: string | null;
  amount?: number | null;
  amountExGst?: number | null;
  startDate?: Date | null;
  closeDate?: Date | null;
  churnDate?: Date | null;
  churnReason?: string | null;
  contentPackageType?: string | null;
  packageDescription?: string | null;
}

export interface DownsellPair {
  predecessorId: string;
  predecessorName: string;
  successorId: string;
  successorName: string;
  clientId: string | null;
  handoverMonth: string; // yyyy-MM
  predecessorExGst: number;
  successorExGst: number;
  /** predecessor − successor. Positive = contraction, negative = expansion. */
  contractionExGst: number;
}

export interface HeldOutDownsell {
  id: string;
  name: string;
  amountExGst: number;
  reason: string;
}

export interface DownsellResolution {
  pairs: DownsellPair[];
  successorIds: Set<string>;
  predecessorIds: Set<string>;
  /** Unpaired downsells — excluded from every revenue, count and pipeline surface. */
  heldOutIds: Set<string>;
  heldOut: HeldOutDownsell[];
  /**
   * Downsells not yet won (no closed-won stage, no churn date). A scheduled
   * reduction, not incoming revenue: excluded from pipeline and forecast, but
   * NOT held out and NOT flagged — the predecessor simply keeps running at its
   * full amount until the replacement is won.
   */
  pendingIds: Set<string>;
  /** successorId → handover month, used as its effective start. */
  handoverStart: Map<string, string>;
  /** predecessorId → handover month, used as its effective churn. */
  handoverChurn: Map<string, string>;
  /** successorId → the clientId it inherits from its predecessor. */
  inheritedClientId: Map<string, string>;
  /** any pair member → the earliest start in its chain. */
  lifecycleStartByDeal: Map<string, Date>;
  contractionsByMonth: Map<string, DownsellPair[]>;
}

const monthKey = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

const monthIdx = (k: string): number => {
  const [y, m] = k.split("-").map(Number);
  return y * 12 + (m - 1);
};

export const dealExGst = (d: PairableDeal): number =>
  d.amountExGst ?? (d.amount != null ? d.amount / 1.1 : 0);

/**
 * Identify a downsell. The Package Description tag is the signal; the name is
 * a fallback for deals that were never tagged (including the "Dowsell" typo).
 */
export function isDownsell(d: PairableDeal): boolean {
  const tags = (d.packageDescription ?? "").toLowerCase().split(/[;,/]/).map((s) => s.trim());
  if (tags.includes("downsell")) return true;
  return /\b(down-?sells?|dowsells?)\b/i.test(d.name ?? "");
}

/** Strip the downsell token so `companyRoot` sees just the company + qualifiers. */
const stripDownsell = (name: string): string =>
  name.replace(/down-?sells?|dowsells?/gi, " ").replace(/\s+/g, " ").trim();

const rootOf = (name: string, isDown: boolean): string =>
  normalize(companyRoot(isDown ? stripDownsell(name) : name));

/**
 * Pair each downsell with the deal it replaces.
 *
 * Required: a company-root name match against a deal that is closed-won or
 * churned and started in an EARLIER month (which also prevents self-matching
 * and cycles in a downsell-of-a-downsell chain).
 *
 * Confirming, at least one: the candidate's churn reason is "Downsell", or its
 * churn month is within one month of the downsell's start month. Requiring the
 * name match but only ONE confirming signal means pairing works on dates alone
 * today and tightens by itself as churn reasons get populated.
 *
 * Ranking: churn-reason match, then closest churn date, then same division,
 * then largest amount. A predecessor can only be claimed once.
 */
export function pairDownsells(deals: PairableDeal[]): DownsellResolution {
  const pairs: DownsellPair[] = [];
  const heldOut: HeldOutDownsell[] = [];
  const pendingIds = new Set<string>();
  const claimed = new Set<string>();

  // A deal counts as won if it is closed-won, or has since churned (it was won
  // once and later ended — which is how the middle link of a chain looks).
  const isWon = (d: PairableDeal) => d.stage === "closed_won" || d.churnDate != null;

  // Earliest-starting downsells resolve first, so a chain links up in order.
  const downsells = deals
    .filter(isDownsell)
    .sort((a, b) => (monthKey(a.startDate ?? a.closeDate) ?? "").localeCompare(monthKey(b.startDate ?? b.closeDate) ?? ""));

  for (const s of downsells) {
    // Not won yet: the predecessor keeps running at full amount and this deal
    // is neither pipeline nor revenue. Nothing to pair, nothing to flag.
    if (!isWon(s)) { pendingIds.add(s.id); continue; }

    const startKey = monthKey(s.startDate ?? s.closeDate);
    const hold = (reason: string) =>
      heldOut.push({ id: s.id, name: s.name, amountExGst: Math.round(dealExGst(s)), reason });

    if (!startKey) { hold("no start date on the downsell deal"); continue; }

    const root = rootOf(s.name, true);
    if (root.length < 3) { hold("deal name too short to identify the company"); continue; }

    const candidates = deals.filter((c) => {
      if (c.id === s.id || claimed.has(c.id)) return false;
      if (c.stage !== "closed_won" && !c.churnDate) return false;
      const cStart = monthKey(c.startDate ?? c.closeDate);
      if (!cStart || cStart >= startKey) return false; // must precede the downsell
      const cRoot = rootOf(c.name, isDownsell(c));
      if (cRoot.length < 3) return false;
      return root.startsWith(cRoot) || cRoot.startsWith(root);
    });

    if (candidates.length === 0) { hold("no predecessor deal found for this company"); continue; }

    const scored = candidates
      .map((c) => {
        const reasonMatch = (c.churnReason ?? "").toLowerCase().includes("downsell");
        const cChurn = monthKey(c.churnDate);
        const distance = cChurn ? Math.abs(monthIdx(cChurn) - monthIdx(startKey)) : Infinity;
        const cRoot = rootOf(c.name, isDownsell(c));
        return {
          c,
          reasonMatch,
          distance,
          exactRoot: cRoot === root,
          sameDivision: dealDivision(c.contentPackageType) === dealDivision(s.contentPackageType),
        };
      })
      .filter((x) => x.reasonMatch || x.distance <= 1);

    if (scored.length === 0) {
      hold("predecessor found, but it has no churn reason of \"Downsell\" and no churn date within a month of this deal's start");
      continue;
    }

    scored.sort(
      (a, b) =>
        Number(b.exactRoot) - Number(a.exactRoot) ||
        Number(b.reasonMatch) - Number(a.reasonMatch) ||
        a.distance - b.distance ||
        Number(b.sameDivision) - Number(a.sameDivision) ||
        dealExGst(b.c) - dealExGst(a.c)
    );

    const p = scored[0].c;
    claimed.add(p.id);
    const predecessorExGst = dealExGst(p);
    const successorExGst = dealExGst(s);
    pairs.push({
      predecessorId: p.id,
      predecessorName: p.name,
      successorId: s.id,
      successorName: s.name,
      clientId: p.clientId ?? null,
      handoverMonth: startKey,
      predecessorExGst: Math.round(predecessorExGst),
      successorExGst: Math.round(successorExGst),
      contractionExGst: Math.round(predecessorExGst - successorExGst),
    });
  }

  const successorIds = new Set(pairs.map((p) => p.successorId));
  const predecessorIds = new Set(pairs.map((p) => p.predecessorId));
  const heldOutIds = new Set(heldOut.map((h) => h.id));
  const byId = new Map(deals.map((d) => [d.id, d]));
  const handoverStart = new Map(pairs.map((p) => [p.successorId, p.handoverMonth]));

  // A predecessor's churn window is the EARLIER of its real churn month and
  // the handover month. Pairing can succeed on a churn-reason match alone
  // with no date confirmation (deliberate — the user may set the reason
  // without tidy dates), so the real churn date can sit well before the
  // handover; using it when it's earlier preserves that gap instead of
  // pretending the client paid full price right up to the handover. A close
  // churn date still collapses to the handover month, same as before.
  const handoverChurn = new Map<string, string>();
  for (const p of pairs) {
    const realChurn = monthKey(byId.get(p.predecessorId)?.churnDate);
    handoverChurn.set(
      p.predecessorId,
      realChurn && monthIdx(realChurn) < monthIdx(p.handoverMonth) ? realChurn : p.handoverMonth
    );
  }

  // Walk each chain back to its origin for clientId and lifecycle start.
  const predecessorOf = new Map(pairs.map((p) => [p.successorId, p.predecessorId]));
  const inheritedClientId = new Map<string, string>();
  const lifecycleStartByDeal = new Map<string, Date>();
  const originOf = (id: string): PairableDeal | undefined => {
    let cur = id;
    const seen = new Set<string>([cur]);
    let prev = predecessorOf.get(cur);
    while (prev && !seen.has(prev)) { cur = prev; seen.add(cur); prev = predecessorOf.get(cur); }
    return byId.get(cur);
  };
  for (const p of pairs) {
    for (const id of [p.successorId, p.predecessorId]) {
      const origin = originOf(id);
      if (!origin) continue;
      const cid = origin.clientId;
      if (cid) inheritedClientId.set(id, cid);
      const start = origin.startDate ?? origin.closeDate;
      if (start) lifecycleStartByDeal.set(id, start);
    }
  }

  // clientId must resolve from the chain origin, not the immediate
  // predecessor — otherwise the second and later links of a downsell chain
  // silently lose client identity.
  for (const p of pairs) {
    p.clientId = inheritedClientId.get(p.successorId) ?? p.clientId;
  }

  const contractionsByMonth = new Map<string, DownsellPair[]>();
  for (const p of pairs) {
    const list = contractionsByMonth.get(p.handoverMonth) ?? [];
    list.push(p);
    contractionsByMonth.set(p.handoverMonth, list);
  }

  return {
    pairs, successorIds, predecessorIds, heldOutIds, heldOut, pendingIds,
    handoverStart, handoverChurn, inheritedClientId, lifecycleStartByDeal, contractionsByMonth,
  };
}

/**
 * Effective active-window month keys for a deal, with the pair's handover
 * month overriding the raw dates.
 *
 * The successor's start is always the handover month — a few days' mismatch
 * between the predecessor's churn date and the successor's start date can
 * never open a revenue gap or double-count a month.
 *
 * The predecessor's churn is the EARLIER of its real churn month and the
 * handover month. Pairing itself can succeed on a churn-reason match alone,
 * with no date confirmation (a deliberate choice — the user may set the
 * reason without tidy dates), so the real churn date can sit well before the
 * handover; a close churn date still collapses to the handover month, but a
 * genuinely stale one is preserved — the client genuinely was not paying
 * during that gap.
 */
export function windowKeys(
  d: { id: string; startDate?: Date | null; closeDate?: Date | null; churnDate?: Date | null },
  res: DownsellResolution
): { startKey: string | null; churnKey: string | null } {
  return {
    startKey: res.handoverStart.get(d.id) ?? monthKey(d.startDate ?? d.closeDate),
    churnKey: res.handoverChurn.get(d.id) ?? monthKey(d.churnDate),
  };
}

/** Fields every consumer's Prisma select must include for pairing to work. */
export const DOWNSELL_DEAL_SELECT = {
  id: true, clientId: true, name: true, stage: true, amount: true, amountExGst: true,
  startDate: true, closeDate: true, churnDate: true, churnReason: true,
  contentPackageType: true, packageDescription: true,
} as const;

/** Uncached loader — call this from scripts, where React `cache` has no request scope. */
export async function loadDownsellResolution(): Promise<DownsellResolution> {
  const deals = await db.hubspotDeal.findMany({
    where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
    select: DOWNSELL_DEAL_SELECT,
  });
  return pairDownsells(deals);
}

/** Request-scoped: every surface in one render shares a single query + resolution. */
export const getDownsellResolution = cache(loadDownsellResolution);
