/**
 * The window the Sales page's headline counts cover. Snapshots (MRR, pipeline,
 * active deals) are "right now" and ignore it.
 *
 * Lives outside the "use client" view: a server page that imports a value from
 * a client module gets a client reference, not the array, so `RANGES.some`
 * throws in a production build (dev hides it).
 */
export const RANGES = [
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];
