/**
 * Upsell folding.
 *
 * In HubSpot, an upsell is a closed-won deal tagged with the "Package Description"
 * property = "Upsell" (e.g. "EatClub Upsell"). It is additional revenue for an
 * EXISTING company, not a new deal — so it must NOT count as its own deal in
 * deal-counts, division averages, or per-deal/per-client lists. Instead its value
 * is folded onto the company's matching base deal.
 *
 * Identification is by `packageDescription === "Upsell"` (NOT the name — many
 * backburner/proposal deals are named "… Upsell" without the tag). The deal NAME
 * is used only to find the base company: strip a trailing "Upsell" and match a
 * closed-won base deal in the same division.
 *
 * This is the single source of truth — every analytics surface that enumerates
 * deals runs `foldUpsells` first so the numbers stay consistent. Reconciliation
 * does NOT fold (it matches individual deals to Xero invoices).
 */

export interface FoldableDeal {
  name: string;
  stage?: string | null;
  contentPackageType?: string | null;
  packageDescription?: string | null;
  amount?: number | null;
  amountExGst?: number | null;
}

export function isUpsell(d: FoldableDeal): boolean {
  return (d.packageDescription ?? "").trim().toLowerCase() === "upsell";
}

/**
 * One-off deals are tagged with "Package Description" = "one-off" — non-recurring
 * revenue (e.g. a single photoshoot or project fee). They count toward revenue
 * but are EXCLUDED from LTV and average-deal-size, which model the recurring book.
 */
export function isOneOff(d: FoldableDeal): boolean {
  return (d.packageDescription ?? "").toLowerCase().replace(/[^a-z]/g, "") === "oneoff";
}

/** Canonical 3-way division for matching an upsell to a same-division base. */
export function dealDivision(pkg: string | null | undefined): string {
  const p = (pkg ?? "").toLowerCase().trim();
  if (p === "social media" || p === "social media management") return "Social Media Management";
  if (p === "meta ads" || p === "ads management" || p === "social and ads management") return "Ads Management";
  return "Content Delivery";
}

const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const stripUpsellSuffix = (name: string): string => name.replace(/[\s\-–—:]*upsells?\s*$/i, "").trim();

export interface FoldResult<T> {
  /** Base deals with upsell amounts folded in; folded upsells removed; unmatched upsells kept standalone. */
  deals: T[];
  /** Successfully folded upsells, with the base deal name they landed on. */
  folded: { name: string; baseName: string; amountExGst: number }[];
  /** Upsells with no matching closed-won base — kept standalone so revenue isn't lost. */
  unmatched: T[];
}

/**
 * Fold "Upsell"-tagged deals onto their matching base deal.
 * - Base candidates: closed-won, non-upsell deals whose normalized name starts
 *   with the upsell's company name (upsell name minus the "Upsell" suffix).
 * - Prefer a candidate in the same division; tiebreak by largest ex-GST amount.
 * - No match → the upsell stays standalone and is reported in `unmatched`.
 * Input objects are not mutated (base deals are cloned).
 */
export function foldUpsells<T extends FoldableDeal>(deals: T[]): FoldResult<T> {
  const base: T[] = [];
  const upsells: T[] = [];
  for (const d of deals) {
    if (isUpsell(d)) upsells.push(d);
    else base.push({ ...d });
  }

  const folded: FoldResult<T>["folded"] = [];
  const unmatched: T[] = [];

  for (const u of upsells) {
    const companyKey = normalize(stripUpsellSuffix(u.name));
    const candidates = companyKey
      ? base.filter((b) => b.stage === "closed_won" && normalize(b.name).startsWith(companyKey))
      : [];
    if (candidates.length === 0) {
      unmatched.push(u);
      base.push({ ...u }); // keep standalone — never silently drop revenue
      continue;
    }
    const sameDiv = candidates.filter((b) => dealDivision(b.contentPackageType) === dealDivision(u.contentPackageType));
    const pool = sameDiv.length ? sameDiv : candidates;
    pool.sort((a, b) => (b.amountExGst ?? b.amount ?? 0) - (a.amountExGst ?? a.amount ?? 0));
    const target = pool[0];
    target.amount = (target.amount ?? 0) + (u.amount ?? 0);
    target.amountExGst = (target.amountExGst ?? 0) + (u.amountExGst ?? 0);
    folded.push({ name: u.name, baseName: target.name, amountExGst: u.amountExGst ?? u.amount ?? 0 });
  }

  return { deals: base, folded, unmatched };
}
