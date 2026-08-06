import { isDownsell, pairDownsells, windowKeys, type PairableDeal } from "@/lib/analytics/downsells";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

const deal = (o: Partial<PairableDeal> & { id: string; name: string }): PairableDeal => ({
  clientId: null, stage: "closed_won", amount: null, amountExGst: null,
  startDate: null, closeDate: null, churnDate: null, churnReason: null,
  contentPackageType: "Content Only", packageDescription: null, ...o,
});

// ---------- identification ----------
console.log("identification:");
assert(isDownsell(deal({ id: "1", name: "Anything", packageDescription: "Downsell" })), "tagged Downsell");
assert(isDownsell(deal({ id: "2", name: "Acme Downsell" })), "untagged but named Downsell (fallback)");
assert(isDownsell(deal({ id: "3", name: "Acme Dowsell" })), "Dowsell typo (fallback)");
assert(isDownsell(deal({ id: "4", name: "X", packageDescription: "Upsell;Downsell" })), "multi-valued tag set");
assert(!isDownsell(deal({ id: "5", name: "Acme Upsell", packageDescription: "Upsell" })), "an upsell is not a downsell");
assert(!isDownsell(deal({ id: "6", name: "Acme Content" })), "plain deal is not a downsell");

// ---------- the three real pairs ----------
console.log("\nreal-shaped pairs:");
const real: PairableDeal[] = [
  deal({ id: "P_NZ", name: "Hello Fresh NZ", amountExGst: 9000, startDate: new Date("2026-04-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned", clientId: "c_nz" }),
  deal({ id: "S_NZ", name: "Hello Fresh NZ Downsell", amountExGst: 6750, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
  deal({ id: "P_AU", name: "Hello Fresh AU", amountExGst: 13500, startDate: new Date("2026-04-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned", clientId: "c_au" }),
  deal({ id: "S_AU", name: "Hello Fresh AU Dowsell", amountExGst: 10500, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
  deal({ id: "P_YF", name: "YouFoodz", amountExGst: 17750, startDate: new Date("2026-04-20"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned", clientId: "c_yf" }),
  deal({ id: "S_YF", name: "Youfoodz Downsell", amountExGst: 12000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
];
const r = pairDownsells(real);
assert(r.pairs.length === 3, `3 pairs (got ${r.pairs.length})`);
assert(r.heldOut.length === 0, `nothing held out (got ${r.heldOut.length})`);
const nz = r.pairs.find((p) => p.successorId === "S_NZ");
assert(nz?.predecessorId === "P_NZ", "NZ successor pairs to NZ predecessor");
assert(nz?.contractionExGst === 2250, `NZ contraction 2250 (got ${nz?.contractionExGst})`);
assert(nz?.handoverMonth === "2026-08", "NZ handover 2026-08");
assert(nz?.clientId === "c_nz", "NZ successor inherits predecessor clientId");
const au = r.pairs.find((p) => p.successorId === "S_AU");
assert(au?.predecessorId === "P_AU", "AU (typo name) pairs to AU predecessor");
assert(au?.contractionExGst === 3000, `AU contraction 3000 (got ${au?.contractionExGst})`);
const yf = r.pairs.find((p) => p.successorId === "S_YF");
assert(yf?.contractionExGst === 5750, `YouFoodz contraction 5750 (got ${yf?.contractionExGst})`);
assert(r.pairs.reduce((s, p) => s + p.contractionExGst, 0) === 11000, "total contraction 11000");

// NZ/AU must never cross-pair
assert(r.pairs.every((p) => p.predecessorName.includes("NZ") === p.successorName.includes("NZ")), "NZ and AU do not cross-pair");

// ---------- lookup surfaces ----------
console.log("\nresolution lookups:");
assert(r.successorIds.has("S_NZ") && !r.successorIds.has("P_NZ"), "successorIds holds successors only");
assert(r.predecessorIds.has("P_NZ") && !r.predecessorIds.has("S_NZ"), "predecessorIds holds predecessors only");
assert(r.contractionsByMonth.get("2026-08")?.length === 3, "3 contractions in 2026-08");
assert(windowKeys(real[1], r).startKey === "2026-08", "successor window starts at handover");
assert(windowKeys(real[0], r).churnKey === "2026-08", "predecessor window ends at handover");
assert(windowKeys(real[0], r).startKey === "2026-04", "predecessor start unchanged");

// ---------- confirming signals ----------
console.log("\nconfirming signals:");
const dateOnly = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(dateOnly.pairs.length === 1, "pairs on aligned dates with no churn reason");

const reasonOnly = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-02-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(reasonOnly.pairs.length === 1, "pairs on churn reason with loose dates");

const neither = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-02-01"), stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(neither.pairs.length === 0 && neither.heldOut.length === 1, "no confirming signal → held out");
assert(neither.heldOutIds.has("S"), "held-out id exposed");

const noPred = pairDownsells([
  deal({ id: "S", name: "Nobody Downsell", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(noPred.heldOut.length === 1 && /no predecessor/i.test(noPred.heldOut[0].reason), "no predecessor → held out with reason");

const noChurnDate = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), stage: "closed_won" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(noChurnDate.heldOut.length === 1, "predecessor never churned → held out");

// ---------- chains and expansion ----------
console.log("\nchains and expansion:");
const chain = pairDownsells([
  deal({ id: "A", name: "Acme", amountExGst: 10000, startDate: new Date("2025-01-01"), churnDate: new Date("2026-01-01"), churnReason: "Downsell", stage: "churned", clientId: "c" }),
  deal({ id: "B", name: "Acme Downsell", amountExGst: 8000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-06-01"), churnReason: "Downsell", stage: "churned", packageDescription: "Downsell" }),
  deal({ id: "C", name: "Acme Downsell", amountExGst: 6000, startDate: new Date("2026-06-01"), packageDescription: "Downsell" }),
]);
assert(chain.pairs.length === 2, `chained downsell makes 2 pairs (got ${chain.pairs.length})`);
assert(chain.lifecycleStartByDeal.get("C")?.getFullYear() === 2025, "lifecycle of the last link walks back to 2025");
assert(chain.inheritedClientId.get("C") === "c", "clientId propagates along the chain");

const expansion = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 4000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 5000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(expansion.pairs[0].contractionExGst === -1000, "larger replacement gives negative contraction (expansion)");

// ---------- not yet won ----------
console.log("\nnot yet won:");
const pending = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S", name: "Acme Downsell", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell", stage: "negotiation" }),
]);
assert(pending.pairs.length === 0, "a downsell that is not yet won does not supersede");
assert(pending.pendingIds.has("S"), "it is marked pending");
assert(pending.heldOut.length === 0, "and is NOT flagged as needing attention");

// ---------- a predecessor is claimed once ----------
const twoDownsells = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 9000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S1", name: "Acme Downsell", amountExGst: 6000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
  deal({ id: "S2", name: "Acme Downsell", amountExGst: 5000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(twoDownsells.pairs.length === 1 && twoDownsells.heldOut.length === 1, "one predecessor is claimed by only one downsell");

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
