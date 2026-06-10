import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";

// ---------------------------------------------------------------------------
// Revenue Forecast (revenue bridge)
//
// Current MRR (active Closed Won) → +Incoming (signed Contract Out starting in
// the horizon) → −Outgoing (Closed Won with a Churn Date in the horizon) →
// Projected MRR. Classification is by raw stageLabel; ex-GST throughout.
//
//   - "Closed Won"               → currently billing (Current MRR), incl. deals
//                                   with a future start date — they're signed.
//   - "Contract out" + StartDate → revenue coming IN at the Start-Date month.
//   - "Closed Won" + ChurnDate   → revenue going OUT at the Churn-Date month.
//   - "Churned but still active" → winding down (shown as context, not in the
//                                   bridge: not part of the Closed Won base).
//   - "Current (Not Paying)"     → paused; shown as context.
// ---------------------------------------------------------------------------

export interface ForecastDeal {
  id: string;
  name: string;
  amount: number; // ex-GST monthly value
  month?: string; // start month (incoming) or churn month (outgoing)
}

export interface RevenueForecast {
  currentMrr: number; // active Closed Won, ex-GST
  incoming: number;
  outgoing: number;
  projected: number; // currentMrr + incoming − outgoing
  horizonMonths: number;
  incomingDeals: ForecastDeal[];
  outgoingDeals: ForecastDeal[];
  // Context (not in the bridge math):
  pausedRevenue: number;
  pausedDeals: ForecastDeal[];
  windingDownRevenue: number; // Churned but still active
  windingDownDeals: ForecastDeal[];
  unsignedContractOut: number; // Contract Out with no Start Date yet
}

const CLOSED_WON = "Closed Won";
const CONTRACT_OUT = "Contract out";
const CHURNED_ACTIVE = "Churned but still active";
const NOT_PAYING = "Current (Not Paying)";

const monthKey = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

function forwardMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export async function getRevenueForecast(monthsForward = 6): Promise<RevenueForecast> {
  const [excludedIds, settings, deals] = await Promise.all([
    getExcludedClientIds(),
    db.appSettings.findFirst(),
    db.hubspotDeal.findMany({
      select: {
        id: true,
        clientId: true,
        name: true,
        stageLabel: true,
        amount: true,
        amountExGst: true,
        startDate: true,
        churnDate: true,
      },
    }),
  ]);

  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;
  // Contract Out deals only carry inc-GST `amount`; convert for consistency.
  const exAmount = (d: { amountExGst: number | null; amount: number | null }): number =>
    d.amountExGst ?? (d.amount != null ? d.amount / gstDivisor : 0);

  const months = forwardMonths(monthsForward);
  const current = months[0];
  const horizonEnd = months[months.length - 1];
  const inHorizon = (mk: string | null): boolean => mk !== null && mk >= current && mk <= horizonEnd;

  const visible = deals.filter((d) => !(d.clientId && excludedIds.has(d.clientId)));
  const toDeal = (d: (typeof visible)[number], month: string | null): ForecastDeal => ({
    id: d.id,
    name: d.name,
    amount: Math.round(exAmount(d)),
    month: month ?? undefined,
  });

  // Current MRR = active Closed Won (not churned before this month), incl. ones
  // whose start date is in the future — they're signed and on the books.
  const closedWon = visible.filter((d) => d.stageLabel === CLOSED_WON);
  const currentMrr = Math.round(
    closedWon
      .filter((d) => { const ck = monthKey(d.churnDate); return ck === null || ck >= current; })
      .reduce((s, d) => s + exAmount(d), 0)
  );

  // Incoming = signed Contract Out (Start Date set) starting within the horizon.
  const incomingDeals = visible
    .filter((d) => d.stageLabel === CONTRACT_OUT && d.startDate && inHorizon(monthKey(d.startDate)))
    .map((d) => toDeal(d, monthKey(d.startDate)))
    .sort((a, b) => b.amount - a.amount);

  // Outgoing = Closed Won deals whose Churn Date falls within the horizon.
  const outgoingDeals = closedWon
    .filter((d) => inHorizon(monthKey(d.churnDate)))
    .map((d) => toDeal(d, monthKey(d.churnDate)))
    .sort((a, b) => b.amount - a.amount);

  const incoming = incomingDeals.reduce((s, d) => s + d.amount, 0);
  const outgoing = outgoingDeals.reduce((s, d) => s + d.amount, 0);

  // Context buckets (not in the bridge):
  const pausedDeals = visible
    .filter((d) => d.stageLabel === NOT_PAYING)
    .map((d) => toDeal(d, null));
  const windingDownDeals = visible
    .filter((d) => d.stageLabel === CHURNED_ACTIVE && (monthKey(d.churnDate) === null || monthKey(d.churnDate)! >= current))
    .map((d) => toDeal(d, monthKey(d.churnDate)));
  const unsignedContractOut = visible.filter((d) => d.stageLabel === CONTRACT_OUT && !d.startDate).length;

  return {
    currentMrr,
    incoming,
    outgoing,
    projected: currentMrr + incoming - outgoing,
    horizonMonths: monthsForward,
    incomingDeals,
    outgoingDeals,
    pausedRevenue: pausedDeals.reduce((s, d) => s + d.amount, 0),
    pausedDeals,
    windingDownRevenue: windingDownDeals.reduce((s, d) => s + d.amount, 0),
    windingDownDeals,
    unsignedContractOut,
  };
}
