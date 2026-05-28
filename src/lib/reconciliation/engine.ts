import { db } from "@/lib/db";

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

  // 2. Pull AUTHORISED ACCREC repeating invoices
  const repeating = await db.xeroRepeatingInvoice.findMany({
    where: { status: "AUTHORISED", type: "ACCREC" },
    select: {
      id: true,
      xeroContactId: true,
      xeroContactName: true,
      subTotal: true,
      scheduleUnit: true,
      scheduleInterval: true,
    },
  });

  // Build lookup indexes
  const byContactId = new Map<string, typeof repeating>();
  const byNormName = new Map<string, typeof repeating>();
  for (const r of repeating) {
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

    // 4. Status + amount delta
    let status: ReconciliationStatus;
    let xeroAmount: number | null = null;
    let amountDelta: number | null = null;
    let matchedId: string | null = null;

    if (candidates.length === 0) {
      status = "missing_in_xero";
      result.missing++;
    } else if (candidates.length > 1) {
      status = "multiple_matches";
      matchedId = candidates[0].id;
      result.multipleMatches++;
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
        matchMethod: method,
        hubspotAmount: dealAmt,
        xeroAmount,
        amountDelta,
        lastCheckedAt: new Date(),
      },
      update: {
        xeroRepeatingInvoiceId: matchedId,
        status,
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
