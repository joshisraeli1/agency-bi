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
