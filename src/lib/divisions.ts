/**
 * The three delivery divisions, and what each is called where.
 *
 * The data layer uses the canonical key throughout ("Content Delivery"); Xero's
 * chart of accounts and the divisional leaders both call that one "Ad Creative".
 * Keep the key as the single source of truth and translate only for display, so
 * renaming a label never silently re-scopes anyone's access.
 */
export const DIVISION_KEYS = [
  "Content Delivery",
  "Social Media Management",
  "Ads Management",
] as const;

export type DivisionKey = (typeof DIVISION_KEYS)[number];

const DISPLAY_NAMES: Record<string, string> = {
  "Content Delivery": "Ad Creative",
  "Social Media Management": "Social Media Management",
  "Ads Management": "Ads Management",
};

export function divisionDisplayName(key: string): string {
  return DISPLAY_NAMES[key] ?? key;
}

export function isDivisionKey(value: string | null | undefined): value is DivisionKey {
  return !!value && (DIVISION_KEYS as readonly string[]).includes(value);
}
