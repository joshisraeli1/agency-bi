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

/**
 * A cut of one division, scoped to the clients a single manager owns.
 *
 * A view is deliberately NOT a division key. DIVISION_KEYS drives the divisional
 * totals on /divisions, and a view's revenue is already counted inside its base
 * division — adding one there would double-count the agency book and move the
 * baseline Vitor's bonus tiers were set against. A view changes who can see what,
 * never what anything sums to.
 */
export interface DivisionView {
  /** Carried on a session or a ?d= param, exactly as a division key is. */
  key: string;
  label: string;
  /** The division this cuts. Revenue stays counted there and only there. */
  baseDivision: DivisionKey;
  /** Matched against HubspotDeal.clientManager. */
  clientManager: string;
  /**
   * The clients this manager looks after, as listed on the Monday client board.
   * `clientManager` alone misses a lot: upsells and replacement deals are often
   * created without it, and some clients were signed under someone else's name.
   * Each entry matches deals whose normalised company name (or deal name) starts
   * with one of `match`, and every deal on that client counts, whatever its tag
   * or division. Deals tagged with the manager still count on top of this, which
   * keeps clients that have since left in the history.
   */
  roster?: { name: string; match: string[] }[];
}

export const DIVISION_VIEWS: DivisionView[] = [
  {
    key: "Client Success",
    label: "Client Success",
    baseDivision: "Content Delivery",
    clientManager: "Emily Heinhuis",
    // The "Current" group on Emily's Monday client board, 2026-11-25.
    roster: [
      { name: "Pilot", match: ["pilot", "hims"] },
      { name: "CitySwoon", match: ["cityswoon"] },
      { name: "Finder.com.au", match: ["finder"] },
      { name: "ATP Science", match: ["atpscience"] },
      { name: "Tropeaka", match: ["tropeaka"] },
      { name: "Step One", match: ["stepone"] },
      { name: "Youfoodz", match: ["youfoodz"] },
      { name: "Updoc", match: ["updoc"] },
      { name: "Chill Chair", match: ["chillchair"] },
      { name: "Mighty Munch", match: ["mightymunch"] },
      { name: "HelloFresh AU", match: ["hellofreshau"] },
      { name: "HelloFresh NZ", match: ["hellofreshnz"] },
      { name: "EveryPlate", match: ["everyplate"] },
      { name: "Blue Light Card", match: ["bluelightcard"] },
      { name: "Driva", match: ["driva"] },
      { name: "Elyos AI", match: ["elyosai"] },
      { name: "Linktree", match: ["linktree"] },
      { name: "Ecovacs", match: ["ecovacs"] },
      { name: "Pet Circle", match: ["petcircle"] },
      { name: "Wipertech", match: ["wipertech"] },
      { name: "Blossom App", match: ["blossom"] },
      { name: "Cygnett", match: ["cygnett"] },
      { name: "Amber", match: ["amberelectric"] },
      { name: "OneMRI", match: ["onemri"] },
      { name: "FX Trading", match: ["fxtrading"] },
      { name: "Blinq", match: ["blinq"] },
    ],
  },
];

export function findDivisionView(value: string | null | undefined): DivisionView | null {
  return DIVISION_VIEWS.find((v) => v.key === value) ?? null;
}

/** A division key or a view key — everything the division page can be scoped to. */
export function isScopeKey(value: string | null | undefined): boolean {
  return isDivisionKey(value) || !!findDivisionView(value);
}

export interface ResolvedScope {
  /** The division whose deals to read. A view resolves to its base. */
  division: DivisionKey;
  /** Present only for a view: restricts the deals to one manager's clients. */
  clientManager?: string;
  label: string;
  isView: boolean;
}

/**
 * What a scope key means. Returns null for anything unrecognised, so a caller
 * that fails closed stays failing closed.
 */
export function resolveScope(value: string | null | undefined): ResolvedScope | null {
  const view = findDivisionView(value);
  if (view) {
    return {
      division: view.baseDivision,
      clientManager: view.clientManager,
      label: view.label,
      isView: true,
    };
  }
  if (isDivisionKey(value)) {
    return { division: value, label: divisionDisplayName(value), isView: false };
  }
  return null;
}
