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
  // "Package Description" can carry multiple ;-separated values (e.g.
  // "Upsell;Combo"), so treat it as a tag set rather than an exact match.
  const tags = (d.packageDescription ?? "").toLowerCase().split(/[;,/]/).map((s) => s.trim());
  if (tags.includes("upsell")) return true;
  // Fallback: a closed-won deal named "… Upsell …" that wasn't tagged in
  // HubSpot (e.g. "BowWowMeow Creative Upsell"). Only ever folds when a base
  // deal for the same company exists; otherwise it stays standalone.
  return /\bupsells?\b/i.test(d.name ?? "");
}

/**
 * One-off deals are tagged with "Package Description" = "one-off" — non-recurring
 * revenue (e.g. a single photoshoot or project fee). They count toward revenue
 * but are EXCLUDED from LTV and average-deal-size, which model the recurring book.
 */
export function isOneOff(d: FoldableDeal): boolean {
  return (d.packageDescription ?? "").toLowerCase().replace(/[^a-z]/g, "") === "oneoff";
}

/**
 * Package types that name no division. HubSpot's "Other" covers one-off pieces
 * of work — a website build, a shoot — which belong to whichever division already
 * serves that client, not to Content Delivery just because it is the catch-all.
 */
const UNSPECIFIED_PACKAGE_TYPES = new Set(["other", ""]);

export interface DivisionResolvable {
  id: string;
  clientId?: string | null;
  companyName?: string | null;
  contentPackageType?: string | null;
}

/**
 * What ties a company's deals together. clientId is preferred, but plenty of
 * companies have no Client record at all (Ipanema is one), and for those the
 * HubSpot "Company name" is the only thing linking their deals.
 */
const companyKeyOf = (d: DivisionResolvable): string | null =>
  d.clientId ?? (d.companyName ? `name:${normalize(d.companyName)}` : null);

/**
 * Division per deal, resolving unspecified package types by the client they
 * belong to.
 *
 * dealDivision() alone maps "Other" to Content Delivery via its catch-all, which
 * silently credited Ipanema's website build to Ad Creative even though Ipanema is
 * an Ads Management client. Here an unspecified deal takes the division of the
 * client's highest-value specified deal, falling back to dealDivision() when the
 * client has nothing else to go on.
 */
export function resolveDealDivisions<T extends DivisionResolvable & { amountExGst?: number | null }>(
  deals: T[]
): Map<string, string> {
  // Strongest signal per company: the division of their largest specified deal.
  const byCompany = new Map<string, { division: string; amount: number }>();
  for (const d of deals) {
    const pkg = (d.contentPackageType ?? "").toLowerCase().trim();
    if (UNSPECIFIED_PACKAGE_TYPES.has(pkg)) continue;
    const key = companyKeyOf(d);
    if (!key) continue;
    const amount = d.amountExGst ?? 0;
    const best = byCompany.get(key);
    if (!best || amount > best.amount) {
      byCompany.set(key, { division: dealDivision(d.contentPackageType), amount });
    }
  }

  const out = new Map<string, string>();
  for (const d of deals) {
    const pkg = (d.contentPackageType ?? "").toLowerCase().trim();
    const key = companyKeyOf(d);
    const inherited = UNSPECIFIED_PACKAGE_TYPES.has(pkg) && key ? byCompany.get(key) : undefined;
    out.set(d.id, inherited ? inherited.division : dealDivision(d.contentPackageType));
  }
  return out;
}

/** Canonical 3-way division for matching an upsell to a same-division base. */
export function dealDivision(pkg: string | null | undefined): string {
  const p = (pkg ?? "").toLowerCase().trim();
  if (p === "social media" || p === "social media management") return "Social Media Management";
  if (p === "meta ads" || p === "ads management" || p === "social and ads management") return "Ads Management";
  return "Content Delivery";
}

export const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
// Remove "Upsell"/"Upsells" wherever it appears (not just trailing), so
// "BowWowMeow Upsell Ads" / "Blue Light Card Upsell Content" reduce to the
// company + qualifier, e.g. "BowWowMeow Ads" / "Blue Light Card Content".
const stripUpsell = (name: string): string => name.replace(/upsells?/gi, " ").replace(/\s+/g, " ").trim();

// Service-line qualifier words that follow the company name (e.g. "Ads",
// "Media", "Content Management"). Stripping trailing qualifiers yields the bare
// company root, so an upsell can match ALL of a company's base deals — then the
// same-division one wins. Without this, "Blue Light Card Media Upsell" matched
// only "Blue Light Card" and skipped "Blue Light Card Ads Management".
const QUALIFIER_WORDS = new Set([
  "ads", "ad", "media", "content", "management", "mgmt", "mgt", "social",
  "paid", "buying", "creative", "combo", "suite", "full", "package", "retainer",
]);
export const companyRoot = (name: string): string => {
  let words = stripUpsell(name).split(/\s+/).filter(Boolean);
  while (words.length > 1 && QUALIFIER_WORDS.has(words[words.length - 1].toLowerCase().replace(/[^a-z]/g, ""))) {
    words = words.slice(0, -1);
  }
  return words.join(" ");
};

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
    // Company key = the upsell name with "Upsell" and trailing service-line
    // qualifiers removed, leaving the bare company root ("Blue Light Card Media
    // Upsell" → "bluelightcard"). Candidates are all of that company's base
    // deals; the same-division one is chosen below.
    const companyKey = normalize(companyRoot(u.name));
    const candidates = companyKey.length >= 3
      ? base.filter((b) => {
          const bn = normalize(companyRoot(b.name));
          if (b.stage !== "closed_won" || bn.length < 3) return false;
          // Bidirectional prefix on the company root, so "Blue Light Card"
          // matches both "Blue Light Card" and "Blue Light Card Ads Management".
          return companyKey.startsWith(bn) || bn.startsWith(companyKey);
        })
      : [];
    if (candidates.length === 0) {
      unmatched.push(u);
      base.push({ ...u }); // keep standalone — never silently drop revenue
      continue;
    }
    const sameDiv = candidates.filter((b) => dealDivision(b.contentPackageType) === dealDivision(u.contentPackageType));
    const pool = sameDiv.length ? sameDiv : candidates;
    // Most specific (longest) base name first, then largest deal.
    pool.sort(
      (a, b) =>
        normalize(b.name).length - normalize(a.name).length ||
        (b.amountExGst ?? b.amount ?? 0) - (a.amountExGst ?? a.amount ?? 0)
    );
    const target = pool[0];
    target.amount = (target.amount ?? 0) + (u.amount ?? 0);
    target.amountExGst = (target.amountExGst ?? 0) + (u.amountExGst ?? 0);
    folded.push({ name: u.name, baseName: target.name, amountExGst: u.amountExGst ?? u.amount ?? 0 });
  }

  return { deals: base, folded, unmatched };
}
