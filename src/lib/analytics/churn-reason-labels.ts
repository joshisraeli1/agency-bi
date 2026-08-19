/**
 * Churn reason labels, kept free of any db import so client components can
 * value-import them. `churn-reasons.ts` reaches Prisma, so importing these
 * from there would pull the whole server stack into the client bundle.
 */

/** Rollup bucket for reasons outside the charted top N. Deliberately NOT
 * "Other" — HubSpot has a literal "Other" reason of its own. */
export const OTHER_REASON = "Less common reasons";

/** Bucket for a churned deal with no reason set. */
export const UNSPECIFIED_REASON = "Unspecified";

/**
 * "Peformance" is misspelled in HubSpot itself. Correct it for display only —
 * matching still runs on the raw value, so fixing it upstream needs no change
 * here.
 */
export const DISPLAY_LABELS: Record<string, string> = {
  Peformance: "Performance",
};
