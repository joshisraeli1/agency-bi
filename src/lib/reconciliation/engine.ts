import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

export type ReconciliationStatus =
  | "aligned"
  | "missing_in_xero"
  | "amount_mismatch"
  | "multiple_matches";

export type MatchMethod = "xero_contact_id" | "name_exact" | "name_fuzzy";

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

  for (const deal of deals) {
    const dealAmt = deal.amountExGst ?? deal.amount ?? 0;

    // 3. Find candidate match(es)
    let candidates: typeof repeating = [];
    let method: MatchMethod | null = null;

    // (a) xero contact id on the linked Client
    const contactId = deal.client?.xeroContactId;
    if (contactId) {
      const m = byContactId.get(contactId);
      if (m && m.length > 0) {
        candidates = m;
        method = "xero_contact_id";
      }
    }

    // (b) exact normalized name match (client name OR deal name)
    if (candidates.length === 0) {
      const names = [deal.client?.name, deal.name].filter(Boolean) as string[];
      for (const n of names) {
        const m = byNormName.get(normalizeName(n));
        if (m && m.length > 0) {
          candidates = m;
          method = "name_exact";
          break;
        }
      }
    }

    // (c) fuzzy: substring containment either direction
    if (candidates.length === 0) {
      const dealNorm = normalizeName(deal.client?.name || deal.name);
      if (dealNorm) {
        for (const [k, arr] of byNormName) {
          if (k.includes(dealNorm) || dealNorm.includes(k)) {
            candidates = arr;
            method = "name_fuzzy";
            break;
          }
        }
      }
    }

    // 4. Status + amount delta + a human-readable reason for the discrepancy
    let status: ReconciliationStatus;
    let xeroAmount: number | null = null;
    let amountDelta: number | null = null;
    let matchedId: string | null = null;
    let reason: string | null = null;

    const fuzzyNote =
      method === "name_fuzzy"
        ? " (matched on an approximate name — confirm it's the right invoice)"
        : "";

    if (candidates.length === 0) {
      status = "missing_in_xero";
      result.missing++;

      const names = [deal.client?.name, deal.name].filter(Boolean) as string[];
      const stale = findInactiveMatch(contactId, names);
      if (stale) {
        const kind = stale.type === "ACCPAY" ? "bill (ACCPAY)" : "invoice";
        reason = `Xero has a ${stale.status} repeating ${kind} for this client, but it isn't an active AUTHORISED sales invoice — re-authorise or activate it in Xero.`;
      } else if (!deal.clientId) {
        reason =
          "This deal isn't linked to a client record, so it can't be matched to a Xero contact.";
      } else if (!contactId) {
        reason =
          "Client isn't linked to a Xero contact and no invoice name-matches — either there's no Xero retainer set up, or the business name differs between HubSpot and Xero.";
      } else {
        reason =
          "Client is linked to Xero but has no AUTHORISED repeating invoice — the retainer may be billed ad-hoc / as one-off invoices, or hasn't been set up yet.";
      }
    } else if (candidates.length > 1) {
      status = "multiple_matches";
      matchedId = candidates[0].id;
      // Compare the combined monthly value of every matching invoice.
      const combined = candidates.reduce(
        (s, c) => s + monthlyAmount(c.subTotal ?? 0, c.scheduleUnit, c.scheduleInterval),
        0,
      );
      xeroAmount = combined;
      amountDelta = dealAmt - combined;
      result.multipleMatches++;

      const denom = Math.max(Math.abs(dealAmt), Math.abs(combined), 1);
      const combinedAligns = Math.abs(amountDelta) / denom <= AMOUNT_TOLERANCE;
      reason =
        `${candidates.length} active repeating invoices match this client` +
        (combinedAligns
          ? `, and together they total ${formatCurrency(combined)}/mo — close to the deal. Likely one retainer split across separate line items.`
          : `, totalling ${formatCurrency(combined)}/mo vs the ${formatCurrency(dealAmt)}/mo deal. Likely multiple service lines; confirm which maps to this deal.`) +
        fuzzyNote;
    } else {
      const c = candidates[0];
      matchedId = c.id;
      xeroAmount = monthlyAmount(c.subTotal ?? 0, c.scheduleUnit, c.scheduleInterval);
      amountDelta = dealAmt - xeroAmount;

      const denom = Math.max(Math.abs(dealAmt), Math.abs(xeroAmount), 1);
      const ratio = Math.abs(amountDelta) / denom;
      if (ratio <= AMOUNT_TOLERANCE) {
        status = "aligned";
        result.aligned++;
      } else {
        status = "amount_mismatch";
        result.amountMismatch++;

        const pct = Math.round(ratio * 100);
        // Is the gap roughly a 10% GST layer? (Xero retainers are often inc-GST,
        // HubSpot amounts ex-GST.)
        const gstHi = xeroAmount > 0 && Math.abs(xeroAmount - dealAmt * 1.1) / Math.max(dealAmt, 1) <= 0.02;
        const gstLo = dealAmt > 0 && Math.abs(dealAmt - xeroAmount * 1.1) / Math.max(xeroAmount, 1) <= 0.02;
        if (gstHi) {
          reason = `Xero is ~10% higher than HubSpot — the repeating invoice looks GST-inclusive while the HubSpot amount is ex-GST.${fuzzyNote}`;
        } else if (gstLo) {
          reason = `HubSpot is ~10% higher than Xero — GST handling looks reversed between the two systems.${fuzzyNote}`;
        } else if (amountDelta > 0) {
          reason = `HubSpot retainer is ${pct}% higher than the Xero invoice (${formatCurrency(amountDelta)}/mo gap) — likely a price increase not yet pushed to Xero, or Xero only bills part of the retainer.${fuzzyNote}`;
        } else {
          reason = `Xero invoice is ${pct}% higher than HubSpot (${formatCurrency(-amountDelta)}/mo gap) — likely add-ons/extra services billed in Xero, or a stale HubSpot deal amount.${fuzzyNote}`;
        }
      }
    }

    // 5. Upsert reconciliation row, preserving reviewStatus/notes
    const existing = await db.reconciliation.findUnique({
      where: { hubspotDealId: deal.id },
      select: { reviewStatus: true, notes: true },
    });

    await db.reconciliation.upsert({
      where: { hubspotDealId: deal.id },
      create: {
        hubspotDealId: deal.id,
        xeroRepeatingInvoiceId: matchedId,
        status,
        reason,
        matchMethod: method,
        hubspotAmount: dealAmt,
        xeroAmount,
        amountDelta,
        lastCheckedAt: new Date(),
      },
      update: {
        xeroRepeatingInvoiceId: matchedId,
        status,
        reason,
        matchMethod: method,
        hubspotAmount: dealAmt,
        xeroAmount,
        amountDelta,
        lastCheckedAt: new Date(),
        // reviewStatus + notes intentionally left untouched on re-run
      },
    });

    if (existing && existing.reviewStatus !== "open") result.unchanged++;
  }

  return result;
}
