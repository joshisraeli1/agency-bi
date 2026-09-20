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
}

export const DIVISION_VIEWS: DivisionView[] = [
  {
    key: "Client Success",
    label: "Client Success",
    baseDivision: "Content Delivery",
    clientManager: "Emily Heinhuis",
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
