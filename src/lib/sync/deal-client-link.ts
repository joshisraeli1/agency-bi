/**
 * Resolving which client a HubSpot deal belongs to.
 *
 * HubSpot's company *associations* are not the source of truth in this account —
 * most Content Machine deals have none, and there is often no company object at
 * all (e.g. "Blue Light Card" exists only as a deal-level value). The team fills
 * in the deal's "Company name" (`company_name`) property instead, and that is
 * what groups a client's base deal with its upsells and downsells.
 *
 * So `company_name` is the primary key here. The legacy link — Client.hubspotDealId,
 * which is @unique and therefore can only ever name ONE deal per client — stays as
 * the fallback for deals whose company_name is blank.
 */

export const normalizeName = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ClientRef {
  id: string;
  name: string;
}

export interface AliasRef {
  clientId: string;
  alias: string;
}

/**
 * Index of normalized client name (and alias) -> client id. Real client names win
 * over aliases, so an alias can never shadow a client that is actually named that.
 */
export function buildClientIndex(clients: ClientRef[], aliases: AliasRef[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const a of aliases) {
    const key = normalizeName(a.alias);
    if (key && !index.has(key)) index.set(key, a.clientId);
  }
  for (const c of clients) {
    const key = normalizeName(c.name);
    if (key) index.set(key, c.id);
  }
  return index;
}

/**
 * Only settled deals are re-linked by company_name. Live pipeline stages keep the
 * legacy link so an in-flight deal can't be re-parented mid-negotiation.
 */
export function isLinkableStage(stage: string | null | undefined): boolean {
  return stage === "closed_won" || stage === "churned";
}

export interface ResolveArgs {
  dealId: string;
  companyName: string | null | undefined;
  index: Map<string, string>;
  /** Legacy Client.hubspotDealId -> clientId map, used only when company_name can't resolve. */
  fallbackByDealId: Map<string, string>;
}

export type LinkSource = "company_name" | "legacy_deal_id" | "unlinked";

export interface LinkResult {
  clientId: string | null;
  source: LinkSource;
}

export function resolveDealClient({ dealId, companyName, index, fallbackByDealId }: ResolveArgs): LinkResult {
  const key = normalizeName((companyName ?? "").trim());
  if (key) {
    const viaCompany = index.get(key);
    if (viaCompany) return { clientId: viaCompany, source: "company_name" };
  }
  const legacy = fallbackByDealId.get(dealId);
  if (legacy) return { clientId: legacy, source: "legacy_deal_id" };
  return { clientId: null, source: "unlinked" };
}
