/**
 * Maps a Xero P&L expense account name to a division. The division-named wage
 * lines (e.g. "Wages - Content Delivery", "Superannuation - Social Media
 * Management", "COS - Content Delivery (Paid)") auto-map cleanly; everything
 * else falls to "Shared/Overhead" until assigned via the cost-allocation
 * config (settings).
 */
export type Division =
  | "Content Delivery"
  | "Social Media Management"
  | "Ads Management"
  | "Shared/Overhead";

export const DIVISIONS: Division[] = [
  "Content Delivery",
  "Social Media Management",
  "Ads Management",
  "Shared/Overhead",
];

export function autoMapAccountToDivision(account: string): Division {
  const a = account.toLowerCase();
  if (a.includes("social media") || a.includes(" smm") || a.endsWith("smm")) return "Social Media Management";
  if (a.includes("ads management") || a.includes("- ads") || a.includes("meta ads")) return "Ads Management";
  if (a.includes("content delivery") || a.includes("content")) return "Content Delivery";
  return "Shared/Overhead";
}

/**
 * Resolve an account's division: an explicit override (from the config table)
 * wins, otherwise fall back to the auto-map.
 */
export function resolveDivision(
  account: string,
  overrides: Record<string, string>
): string {
  return overrides[account] ?? autoMapAccountToDivision(account);
}

export interface DivisionAllocation {
  division: Division;
  weight: number;
}

/**
 * Map a Xero cost account to one or more divisions, per the P&L-restructure doc.
 * Handles shared costs that split across divisions (video editors, freelancers,
 * talent/creators → 50/50 Content + SMM) and reclassifies generic buckets
 * (Contractor - Data Support → Ads, Stripe/Urban Swan → Shared, etc.).
 * Works on both the current account names and the proposed "Ad Creative" ones.
 */
export function mapAccountToDivisions(account: string): DivisionAllocation[] {
  const a = account.toLowerCase().trim();
  const one = (d: Division): DivisionAllocation[] => [{ division: d, weight: 1 }];
  const split = (d1: Division, d2: Division): DivisionAllocation[] => [
    { division: d1, weight: 0.5 },
    { division: d2, weight: 0.5 },
  ];

  // Shared across Content (Ad Creative) + SMM: video editors, freelancers, talent/creators.
  if (a.includes("video editor") || a.includes("freelancer") || a.includes("talent") || a.includes("content creator")) {
    return split("Content Delivery", "Social Media Management");
  }
  // Urban Swan (gift-card / commission business) — not an agency division here → Shared.
  if (a.includes("urban swan") || a.includes("stripe")) return one("Shared/Overhead");
  // Division-tagged direct costs.
  if (a.includes("social media") || /\bsmm\b/.test(a)) return one("Social Media Management");
  if (a.includes("ads management") || a.includes("ads mgmt") || a.includes("- ads") || a.includes("meta ads") || a.includes("data support")) {
    return one("Ads Management");
  }
  if (
    a.includes("content delivery") || a.includes("ad creative") ||
    a.includes("subscriptions - production") || a.includes("processing fee") || a.includes("studio equipment") ||
    (a.includes("offshore") && (a.includes("creative") || a.includes("graphic") || a.includes("post production")))
  ) {
    return one("Content Delivery");
  }
  // Overheads + everything genuinely non-divisional → Shared.
  return one("Shared/Overhead");
}
