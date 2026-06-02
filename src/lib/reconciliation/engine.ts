import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { getReconciliationAliases } from "@/lib/reconciliation/aliases";
import { getFxRates } from "@/lib/reconciliation/fx";

export type ReconciliationStatus =
  | "aligned"
  | "missing_in_xero"
  | "amount_mismatch"
  | "multiple_matches";

export type MatchMethod = "xero_contact_id" | "name_exact" | "alias" | "name_fuzzy";

const AMOUNT_TOLERANCE = 0.05; // 5%

// Convert any Xero schedule to a per-month figure so amounts compare apples-to-apples.
// HubSpot retainers are stored as monthly (amountExGst).
function monthlyAmount(subTotal: number, unit: string | null, interval: number | null): number {
  const i = interval ?? 1;
  switch (unit) {
    case "WEEKLY":
      // weekly amount × (52/12) months
      return (subTotal / i) * (52 / 12);
    case "MONTHLY":
      return subTotal / i;
    case "YEARLY":
      return subTotal / (12 * i);
    default:
      return subTotal;
  }
}

function normalizeName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/\b(pty|ltd|inc|llc|co|limited|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export interface ReconciliationRunResult {
  totalDeals: number;
  aligned: number;
  missing: number;
  amountMismatch: number;
  multipleMatches: number;
  unchanged: number;
}

export async function runReconciliation(): Promise<ReconciliationRunResult> {
  // 0. Refresh Xero repeating invoices from the live account first, so the
  //    reconciliation always matches against current data (the table isn't
  //    populated by anything else). Non-fatal if Xero isn't reachable.
  try {
    const { syncXeroRepeatingInvoices } = await import("@/lib/sync/refresh-syncs");
    await syncXeroRepeatingInvoices();
  } catch {
    // Xero not connected / fetch failed — fall back to whatever's stored.
  }

  // 1. Pull active closed-won HubSpot deals (one row per deal)
  const now = new Date();
  const deals = await db.hubspotDeal.findMany({
    where: {
      stage: "closed_won",
      OR: [{ churnDate: null }, { churnDate: { gt: now } }],
    },
    select: {
      id: true,
      name: true,
      amountExGst: true,
      amount: true,
      clientId: true,
      client: {
        select: { id: true, name: true, xeroContactId: true },
      },
    },
  });

  // 2. Pull repeating invoices. AUTHORISED ACCREC templates are the matchable
  //    set; the rest (drafts, deleted, ACCPAY) are kept so we can explain *why*
  //    a deal looks missing (e.g. "an invoice exists but it's a draft").
  const allRepeating = await db.xeroRepeatingInvoice.findMany({
    select: {
      id: true,
      xeroContactId: true,
      xeroContactName: true,
      subTotal: true,
      scheduleUnit: true,
      scheduleInterval: true,
      status: true,
      type: true,
      currencyCode: true,
    },
  });
  const repeating = allRepeating.filter(
    (r) => r.status === "AUTHORISED" && r.type === "ACCREC",
  );
  const inactive = allRepeating.filter(
    (r) => !(r.status === "AUTHORISED" && r.type === "ACCREC"),
  );

  type Repeating = (typeof allRepeating)[number];

  // Build lookup indexes (active = matchable, inactive = for diagnosis only)
  function buildIndexes(list: Repeating[]) {
    const byContactId = new Map<string, Repeating[]>();
    const byNormName = new Map<string, Repeating[]>();
    for (const r of list) {
      if (r.xeroContactId) {
        const arr = byContactId.get(r.xeroContactId) ?? [];
        arr.push(r);
        byContactId.set(r.xeroContactId, arr);
      }
      if (r.xeroContactName) {
        const key = normalizeName(r.xeroContactName);
        const arr = byNormName.get(key) ?? [];
        arr.push(r);
        byNormName.set(key, arr);
      }
    }
    return { byContactId, byNormName };
  }

  const { byContactId, byNormName } = buildIndexes(repeating);
  const { byContactId: inactiveById, byNormName: inactiveByName } =
    buildIndexes(inactive);

  // Find any inactive (draft/deleted/ACCPAY) invoice for this deal's client.
  function findInactiveMatch(
    contactId: string | null | undefined,
    names: string[],
  ): Repeating | null {
    if (contactId) {
      const m = inactiveById.get(contactId);
      if (m?.length) return m[0];
    }
    for (const n of names) {
      const m = inactiveByName.get(normalizeName(n));
      if (m?.length) return m[0];
    }
    return null;
  }

  const result: ReconciliationRunResult = {
    totalDeals: deals.length,
    aligned: 0,
    missing: 0,
    amountMismatch: 0,
    multipleMatches: 0,
    unchanged: 0,
  };

  // Name aliases: declare that a Xero contact name and a HubSpot client/deal
  // name are the SAME client (e.g. "HC Operating" = "Everlab"). Applied below
  // as explicit union links, so they fix name differences AND bridge a client
  // whose deals + invoices are split across two business names. Stored in the
  // DB so the correction sticks across re-runs.
  const aliases = await getReconciliationAliases();

  // FX: HubSpot deals are in AUD. Convert any non-AUD Xero invoice to AUD
  // before comparing (e.g. Superpower is billed in USD). Rates are editable.
  const fxRates = await getFxRates();
  const monthlyAud = (c: Repeating): number => {
    const monthly = monthlyAmount(c.subTotal ?? 0, c.scheduleUnit, c.scheduleInterval);
    if (!c.currencyCode || c.currencyCode === "AUD") return monthly;
    return monthly * (fxRates[c.currencyCode] ?? 1);
  };

  // 3. For a single deal, find its matching active invoices + how they matched.
  function matchInvoices(deal: (typeof deals)[number]): {
    invoices: Repeating[];
    method: MatchMethod | null;
  } {
    const contactId = deal.client?.xeroContactId;
    if (contactId) {
      const m = byContactId.get(contactId);
      if (m?.length) return { invoices: m, method: "xero_contact_id" };
    }
    const names = [deal.client?.name, deal.name].filter(Boolean) as string[];
    // (b) exact normalized name (client name OR deal name)
    for (const n of names) {
      const m = byNormName.get(normalizeName(n));
      if (m?.length) return { invoices: m, method: "name_exact" };
    }
    // (c) fuzzy: substring containment either direction, on BOTH the client
    //     name and the deal name (so "Blue Light Card Ads Management" matches
    //     the "Blue Light Card" invoice). Require >= 5 chars on both sides to
    //     avoid short-token false merges (e.g. a 3-letter client like "Gem").
    const fuzzyCands = names.map(normalizeName).filter((n) => n.length >= 5);
    for (const dealNorm of fuzzyCands) {
      for (const [k, arr] of byNormName) {
        if (k.length >= 5 && (k.includes(dealNorm) || dealNorm.includes(k))) {
          return { invoices: arr, method: "name_fuzzy" };
        }
      }
    }
    return { invoices: [], method: null };
  }

  // 4. Match each deal to its invoices, then union deals + invoices that share
  //    a match into connected components. A component reconciles on TOTALS,
  //    which groups e.g. Elyos AI's two deals ($7,850 + $7,000) onto their
  //    single $14,850 invoice, and BizCover / Credabl's "Ads Mgmt" deals onto
  //    the same client's invoices — even when the HubSpot deals aren't linked
  //    to a single client record.
  interface Group {
    clientId: string | null;
    clientName: string;
    contactId: string | null;
    names: string[];
    deals: { id: string; name: string; amt: number }[];
    invoices: Map<string, Repeating>;
    method: MatchMethod | null;
  }
  const methodRank: Record<MatchMethod, number> = {
    xero_contact_id: 4,
    name_exact: 3,
    alias: 2,
    name_fuzzy: 1,
  };

  // Union-Find over node keys `D:<dealId>` and `I:<invoiceId>`.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (p === undefined || p === x) {
      parent.set(x, x);
      return x;
    }
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const matchedDeals: { deal: (typeof deals)[number]; amt: number; method: MatchMethod | null }[] = [];
  const invById = new Map<string, Repeating>();
  for (const deal of deals) {
    const dKey = `D:${deal.id}`;
    find(dKey); // register the deal even if it matches nothing
    const { invoices, method } = matchInvoices(deal);
    matchedDeals.push({ deal, amt: deal.amountExGst ?? deal.amount ?? 0, method });
    for (const inv of invoices) {
      invById.set(inv.id, inv);
      union(dKey, `I:${inv.id}`);
    }
  }

  // 4b. Apply name aliases as explicit "same client" links: union every deal
  //     under the HubSpot name with every invoice under the Xero name. This
  //     fixes pure name differences (HC Operating = Everlab) and bridges a
  //     client split across two business names so it reconciles on the
  //     combined total — e.g. Field to Fork = Naked Biltong: deals $3,000 +
  //     $5,400 vs invoices $6,000 + $2,400.
  if (aliases.length) {
    const dealsByNorm = new Map<string, string[]>();
    for (const { deal } of matchedDeals) {
      for (const n of [deal.client?.name, deal.name]) {
        if (!n) continue;
        const arr = dealsByNorm.get(normalizeName(n)) ?? [];
        arr.push(`D:${deal.id}`);
        dealsByNorm.set(normalizeName(n), arr);
      }
    }
    const aliasDealKeys = new Set<string>();
    for (const a of aliases) {
      const dealKeys = dealsByNorm.get(normalizeName(a.clientName)) ?? [];
      const invs = byNormName.get(normalizeName(a.xeroName)) ?? [];
      if (!dealKeys.length || !invs.length) continue;
      const anchor = dealKeys[0];
      for (const dk of dealKeys) {
        union(anchor, dk);
        aliasDealKeys.add(dk);
      }
      for (const inv of invs) {
        invById.set(inv.id, inv);
        union(anchor, `I:${inv.id}`);
      }
    }
    // Surface "alias" as the match method for deals that matched nothing on
    // their own and were linked purely by an alias.
    for (const md of matchedDeals) {
      if (md.method == null && aliasDealKeys.has(`D:${md.deal.id}`)) md.method = "alias";
    }
  }

  // Assemble one Group per connected component.
  const groups = new Map<string, Group>();
  const ensureGroup = (root: string): Group => {
    let g = groups.get(root);
    if (!g) {
      g = {
        clientId: null,
        clientName: "",
        contactId: null,
        names: [],
        deals: [],
        invoices: new Map(),
        method: null,
      };
      groups.set(root, g);
    }
    return g;
  };
  for (const { deal, amt, method } of matchedDeals) {
    const g = ensureGroup(find(`D:${deal.id}`));
    g.deals.push({ id: deal.id, name: deal.name, amt });
    for (const n of [deal.client?.name, deal.name]) if (n) g.names.push(n);
    if (!g.clientName) g.clientName = deal.client?.name ?? deal.name;
    if (!g.clientId && deal.clientId) g.clientId = deal.clientId;
    if (!g.contactId && deal.client?.xeroContactId) g.contactId = deal.client.xeroContactId;
    if (method && (!g.method || methodRank[method] > methodRank[g.method])) g.method = method;
  }
  for (const inv of invById.values()) {
    ensureGroup(find(`I:${inv.id}`)).invoices.set(inv.id, inv);
  }

  // 5. Reconcile each client group on totals, then write one row per deal
  //    carrying the client-level verdict. Each row stores the deal's
  //    proportional share of the Xero total so the page's column totals stay
  //    correct when several deals map to one client.
  for (const g of groups.values()) {
    const hubspotTotal = g.deals.reduce((s, d) => s + d.amt, 0);
    const invs = [...g.invoices.values()];
    const xeroTotal = invs.reduce((s, c) => s + monthlyAud(c), 0);
    const matchedId = invs[0]?.id ?? null;
    const method = g.method;
    const fuzzyNote =
      method === "name_fuzzy"
        ? " (matched on an approximate name — add a name mapping to lock it in)"
        : "";
    // Note any non-AUD invoices that were converted, so the reason is honest
    // about the comparison.
    const fxCurrencies = [
      ...new Set(invs.map((c) => c.currencyCode).filter((cc) => cc && cc !== "AUD")),
    ];
    const fxNote = fxCurrencies.length
      ? ` (Xero ${fxCurrencies.join("/")} converted to AUD${fxCurrencies.some((cc) => !(cc! in fxRates)) ? " — no FX rate set, add one" : ""})`
      : "";
    const nD = g.deals.length;
    const nI = invs.length;
    // Describe the multi-deal / multi-invoice shape once, reused in reasons.
    const shape =
      nD > 1 || nI > 1
        ? `${g.clientName}: ${nD} HubSpot deal${nD > 1 ? "s" : ""} totalling ${formatCurrency(hubspotTotal)} vs ${nI} Xero invoice${nI > 1 ? "s" : ""} totalling ${formatCurrency(xeroTotal)}. `
        : "";

    let status: ReconciliationStatus;
    let reason: string | null = null;

    if (nI === 0) {
      status = "missing_in_xero";
      const stale = findInactiveMatch(g.contactId, g.names);
      if (stale) {
        const kind = stale.type === "ACCPAY" ? "bill (ACCPAY)" : "invoice";
        reason = `Xero has a ${stale.status} repeating ${kind} for this client, but it isn't an active AUTHORISED sales invoice — re-authorise or activate it in Xero.`;
      } else if (!g.clientId) {
        reason = "This deal isn't linked to a client record, so it can't be matched to a Xero contact.";
      } else if (!g.contactId) {
        reason = "Client isn't linked to a Xero contact and no invoice name-matches — either there's no Xero retainer set up, or the business name differs between HubSpot and Xero. Add a name mapping if so.";
      } else {
        reason = "Client is linked to Xero but has no AUTHORISED repeating invoice — the retainer may be billed ad-hoc / as one-off invoices, or hasn't been set up yet.";
      }
    } else {
      const denom = Math.max(Math.abs(hubspotTotal), Math.abs(xeroTotal), 1);
      const ratio = Math.abs(hubspotTotal - xeroTotal) / denom;
      if (ratio <= AMOUNT_TOLERANCE) {
        status = "aligned";
        if (shape) reason = `${shape}Totals reconcile within tolerance.`;
      } else {
        status = "amount_mismatch";
        const pct = Math.round(ratio * 100);
        // Is the gap roughly a 10% GST layer? (Xero retainers are often inc-GST,
        // HubSpot amounts ex-GST.)
        const gstHi = xeroTotal > 0 && Math.abs(xeroTotal - hubspotTotal * 1.1) / Math.max(hubspotTotal, 1) <= 0.02;
        const gstLo = hubspotTotal > 0 && Math.abs(hubspotTotal - xeroTotal * 1.1) / Math.max(xeroTotal, 1) <= 0.02;
        if (gstHi) {
          reason = `${shape}Xero is ~10% higher — the repeating invoice looks GST-inclusive while HubSpot is ex-GST.${fuzzyNote}`;
        } else if (gstLo) {
          reason = `${shape}HubSpot is ~10% higher than Xero — GST handling looks reversed between the two systems.${fuzzyNote}`;
        } else if (hubspotTotal > xeroTotal) {
          reason = `${shape}HubSpot is ${pct}% higher than Xero (${formatCurrency(hubspotTotal - xeroTotal)}/mo gap) — likely a price increase not yet pushed to Xero, or Xero only bills part of the retainer.${fuzzyNote}`;
        } else {
          reason = `${shape}Xero is ${pct}% higher than HubSpot (${formatCurrency(xeroTotal - hubspotTotal)}/mo gap) — likely add-ons/extra services billed in Xero, or stale HubSpot deal amounts.${fuzzyNote}`;
        }
        if (reason) reason += fxNote;
      }
    }

    for (const d of g.deals) {
      // Proportional share of the client's Xero total so per-row figures sum
      // back to the client total on the page.
      const dealXero =
        nI === 0 ? null : hubspotTotal > 0 ? (xeroTotal * d.amt) / hubspotTotal : xeroTotal / nD;
      const delta = dealXero == null ? null : d.amt - dealXero;

      const existing = await db.reconciliation.findUnique({
        where: { hubspotDealId: d.id },
        select: { reviewStatus: true },
      });

      await db.reconciliation.upsert({
        where: { hubspotDealId: d.id },
        create: {
          hubspotDealId: d.id,
          xeroRepeatingInvoiceId: matchedId,
          status,
          reason,
          matchMethod: method,
          hubspotAmount: d.amt,
          xeroAmount: dealXero,
          amountDelta: delta,
          lastCheckedAt: new Date(),
        },
        update: {
          xeroRepeatingInvoiceId: matchedId,
          status,
          reason,
          matchMethod: method,
          hubspotAmount: d.amt,
          xeroAmount: dealXero,
          amountDelta: delta,
          lastCheckedAt: new Date(),
          // reviewStatus + notes intentionally left untouched on re-run
        },
      });

      if (status === "aligned") result.aligned++;
      else if (status === "missing_in_xero") result.missing++;
      else result.amountMismatch++;
      if (existing && existing.reviewStatus !== "open") result.unchanged++;
    }
  }

  return result;
}
