/**
 * The sales team, and what each person is measured on.
 *
 * Michael and Xavier are paid and reviewed on different things — Michael on
 * recurring and new revenue, Xavier on the number of clients he signs within a
 * commission year — so they share the activity and pipeline views but not the
 * goal model. Forcing one shape over both would have meant inventing revenue
 * targets Xavier does not have, or a signing count Michael is not measured on.
 */
export type GoalModel = "revenue" | "commission";

export interface Salesperson {
  /** HubSpot owner id — the key every deal and activity is attributed by. */
  ownerId: string;
  name: string;
  email: string;
  /** URL segment: /sales/<slug> */
  slug: string;
  goalModel: GoalModel;
}

export const SALESPEOPLE: Salesperson[] = [
  {
    ownerId: "76570622",
    name: "Michael Shenfield",
    email: "michael@swan.studio",
    slug: "michael",
    goalModel: "revenue",
  },
  {
    ownerId: "101247029",
    name: "Xavier Levins",
    email: "xavier@swan.studio",
    slug: "xavier",
    goalModel: "commission",
  },
];

export const SALES_OWNER_IDS = SALESPEOPLE.map((p) => p.ownerId);

export function salespersonBySlug(slug: string | null | undefined): Salesperson | null {
  return SALESPEOPLE.find((p) => p.slug === slug) ?? null;
}

export function salespersonByEmail(email: string | null | undefined): Salesperson | null {
  const e = (email ?? "").trim().toLowerCase();
  return SALESPEOPLE.find((p) => p.email.toLowerCase() === e) ?? null;
}

export function salespersonByOwnerId(ownerId: string | null | undefined): Salesperson | null {
  return SALESPEOPLE.find((p) => p.ownerId === ownerId) ?? null;
}

/**
 * Xavier's commission year: 19 Oct 2026 to 18 Oct 2027.
 *
 * Deliberately not the calendar or fiscal year — commission tiers reset on the
 * anniversary of his start date, so every count on his board is bounded by
 * these dates rather than by a month or quarter boundary.
 */
// Stored as plain UTC midnights rather than with an AEST offset: the server
// renders in UTC, and an offset pushed every one of these back a day on screen
// (19 Oct displaying as 18 Oct). A signing is dated to the day, not the hour.
export const COMMISSION_YEAR_START = new Date("2026-10-19T00:00:00Z");
export const COMMISSION_YEAR_END = new Date("2027-10-19T00:00:00Z");

/** The 4-month Initial Period, to 18 Feb 2027. */
export const INITIAL_PERIOD_END = new Date("2027-02-19T00:00:00Z");
/** Probation / 6-month review, to 18 Apr 2027. */
export const PROBATION_END = new Date("2027-04-19T00:00:00Z");

/** Paid per qualified meeting, uncapped. A new deal he creates IS the signal. */
export const QUALIFIED_MEETING_FEE = 185;

/**
 * Commission on the first six months of a client's retainer, by how many
 * clients have been signed in the year so far.
 *
 * The rate is NOT retrospective: client 37 earns 5.25% while clients 1-36 stay
 * at 3%, which is why this is applied per signing in order rather than as one
 * rate over the total.
 */
export const COMMISSION_TIERS = [
  { fromClient: 1, rate: 0.03 },
  { fromClient: 37, rate: 0.0525 },
  { fromClient: 46, rate: 0.06 },
] as const;

/** Commission months of retainer counted per signed client. */
export const COMMISSION_MONTHS = 6;

/** The target that defines "on pace": 36 clients across the year, 3 a month. */
export const SIGNING_TARGET = 36;

export function rateForClientNumber(n: number): number {
  let rate: number = COMMISSION_TIERS[0].rate;
  for (const t of COMMISSION_TIERS) if (n >= t.fromClient) rate = t.rate;
  return rate;
}
