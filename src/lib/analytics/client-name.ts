/**
 * Some HubSpot companies have uninformative names (e.g. "Gem" owns the deal
 * "Blue Light Card Ads Management"). When a client's name is short AND isn't
 * reflected in any of its deal names, we display the (cleaned) deal name instead
 * so the lists are readable. This is display-only and survives HubSpot re-syncs.
 */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Trailing service/division phrases stripped from a deal name (longest first).
const SERVICE_SUFFIX =
  /[\s\-–—:|]*\b(social and ads management|social media management|ads management|ad management|content creation|content delivery|recurring content|paid content|organic socials|social management|social media|google ads|ad creative|ads creative|content|ads|campaign|one[\s-]?off|upsell|round \d+|statics|photoshoot)\b\s*$/i;

export function cleanDealName(name: string): string {
  let out = name.trim();
  // Strip up to two stacked trailing service phrases ("… Content Ads" → "…").
  for (let i = 0; i < 2; i++) {
    const next = out.replace(SERVICE_SUFFIX, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Display name for a client given its closed-won deal names. */
export function clientDisplayName(name: string, dealNames: string[]): string {
  const clean = (name ?? "").trim();
  if (dealNames.length === 0) return clean;

  const nName = norm(clean);
  // "Reflected" = a deal name leads with the company (e.g. "OiOi - Recurring").
  // Use startsWith, not includes: "Gem" must NOT match "manaGEMent".
  const reflected = nName.length >= 2 && dealNames.some((d) => norm(d).startsWith(nName));
  const uninformative = nName.length <= 4; // "Gem", "Gen", "Her", "Up"
  if (reflected || !uninformative) return clean;

  const longest = [...dealNames].sort((a, b) => b.length - a.length)[0];
  const cleaned = cleanDealName(longest);
  return cleaned.length >= 2 ? cleaned : longest;
}
