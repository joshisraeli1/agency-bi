import { loadDownsellResolution } from "@/lib/analytics/downsells";
import { companyRoot, normalize } from "@/lib/analytics/upsells";
import { db } from "@/lib/db";
import { getRevenueVsChurn } from "@/lib/analytics/revenue-overview";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

const EXPECTED = [
  { pred: "59153676324", succ: "63433823302", contraction: 2250, label: "Hello Fresh NZ" },
  { pred: "56116135556", succ: "63433698333", contraction: 3000, label: "Hello Fresh AU" },
  { pred: "58208775747", succ: "63436346972", contraction: 5750, label: "YouFoodz" },
];

async function main() {
  const res = await loadDownsellResolution();

  console.log("pairs found:");
  for (const p of res.pairs) {
    console.log(`  ${p.predecessorName} ($${p.predecessorExGst}) → ${p.successorName} ($${p.successorExGst}) = $${p.contractionExGst} @ ${p.handoverMonth}`);
  }
  console.log("held out:");
  for (const h of res.heldOut) console.log(`  ${h.name} ($${h.amountExGst}) — ${h.reason}`);

  assert(res.pairs.length === 3, `exactly 3 pairs (got ${res.pairs.length})`);
  for (const e of EXPECTED) {
    const p = res.pairs.find((x) => x.successorId === e.succ);
    assert(!!p, `${e.label} paired`);
    assert(p?.predecessorId === e.pred, `${e.label} matched the right predecessor`);
    assert(p?.contractionExGst === e.contraction, `${e.label} contraction $${e.contraction} (got ${p?.contractionExGst})`);
    assert(p?.handoverMonth === "2026-08", `${e.label} handover 2026-08`);
    assert(!!p?.clientId, `${e.label} carries a clientId to inherit`);
  }
  const total = res.pairs.reduce((s, p) => s + p.contractionExGst, 0);
  assert(total === 11000, `total contraction $11,000 (got $${total})`);
  assert(res.heldOut.length === 0, `nothing held out (got ${res.heldOut.length})`);

  // ---------------------------------------------------------------------
  // Extra check (code review): the pairing uses bidirectional prefix matching
  // on the company root — root.startsWith(cRoot) || cRoot.startsWith(root).
  // A hypothetical region-less parent, e.g. "Hello Fresh" with root
  // "hellofresh", would be a strict prefix of "hellofreshnz" and would enter
  // the candidate pool for the NZ downsell (and equally for AU). The
  // EXPECTED assertions above already prove each successor matched its
  // correct, region-specific predecessor id — if a region-less parent had
  // out-ranked it, those assertions would already be failing. This section
  // makes that check explicit and independent of ranking, by reporting every
  // strict company-root-prefix relationship anywhere in the closed-won/
  // churned book, so a false pass (right answer for the wrong reason, e.g. a
  // region-less parent losing the ranking rather than not existing) can't
  // hide. This is diagnostic only — a coincidental prefix between two
  // unrelated companies elsewhere in the book is not itself a pairing bug,
  // so it is reported but does not fail the run.
  // ---------------------------------------------------------------------
  console.log("\nregion-less-parent scan (company-root strict-prefix pairs in the won/churned book):");
  const wonOrChurned = await db.hubspotDeal.findMany({
    where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
    select: { id: true, name: true },
  });
  const roots = wonOrChurned.map((d) => ({ id: d.id, name: d.name, root: normalize(companyRoot(d.name)) }));
  const strictPrefixPairs: { a: typeof roots[number]; b: typeof roots[number] }[] = [];
  for (const a of roots) {
    if (a.root.length < 3) continue;
    for (const b of roots) {
      if (a.id === b.id || b.root.length < 3) continue;
      if (b.root !== a.root && b.root.startsWith(a.root)) {
        strictPrefixPairs.push({ a, b });
      }
    }
  }
  if (strictPrefixPairs.length === 0) {
    console.log("  none found — no deal's company root is a strict prefix of another's");
  } else {
    for (const { a, b } of strictPrefixPairs) {
      console.log(`  "${a.name}" (root "${a.root}") is a strict prefix of "${b.name}" (root "${b.root}")`);
    }
  }
  // Targeted check: is there a bare "Hello Fresh" or "Youfoodz" (no region/
  // qualifier) deal in the won/churned book whose company root is a strict
  // prefix of one of our three successor/predecessor roots? This is the
  // concrete version of the reviewer's hypothetical, independent of the
  // generic scan above (which reports every coincidental prefix in the whole
  // book, most of which are unrelated companies and not a pairing risk).
  //
  // Finding such a deal by NAME is not itself proof of a live bug: pairing
  // also requires `cStart < startKey` (the candidate must have started in a
  // STRICTLY EARLIER month than the downsell) — a same-company deal that
  // starts in or after the handover month never enters the candidate pool
  // regardless of its root. So this section reports the name match, then
  // separately checks the date condition to say whether it was ever a real
  // candidate (structurally excluded) or just lost the ranking (verified
  // instead by the EXPECTED predecessorId assertions above).
  const successorRoots = new Set(res.pairs.flatMap((p) => [
    normalize(companyRoot(p.predecessorName)),
    normalize(companyRoot(p.successorName)),
  ]));
  const bareParentCandidates = roots.filter((r) =>
    !res.pairs.some((p) => p.predecessorId === r.id || p.successorId === r.id) &&
    [...successorRoots].some((sr) => sr !== r.root && sr.startsWith(r.root) && r.root.length >= 3)
  );
  if (bareParentCandidates.length === 0) {
    console.log("  no bare region-less parent name found outside the 3 known pairs");
  } else {
    for (const c of bareParentCandidates) {
      console.log(`  found by name: "${c.name}" (id ${c.id}, root "${c.root}") — checking whether it was ever a real candidate...`);
      const detail = await db.hubspotDeal.findUnique({ where: { id: c.id }, select: { startDate: true, closeDate: true, stage: true } });
      const cStart = detail?.startDate ?? detail?.closeDate ?? null;
      const cMonth = cStart ? `${cStart.getFullYear()}-${String(cStart.getMonth() + 1).padStart(2, "0")}` : null;
      console.log(`    start month: ${cMonth}; handover month: 2026-08; excluded by date filter: ${cMonth ? cMonth >= "2026-08" : "no start date"}`);
    }
  }

  const rows = await getRevenueVsChurn(12);
  const aug = rows.find((r) => r.month === "2026-08");
  assert(!!aug, "August 2026 row present");
  // Point-in-time acceptance figures. These move whenever a deal is added,
  // won or churned in August 2026 — e.g. "Hello Fresh Upsell" ($3,600 ex-GST)
  // was created on 2026-08-05 and lifted new revenue from $65,800 to $69,400.
  // Upsells legitimately count as new revenue; only downsells are excluded.
  // The structural assertions below are the drift-proof ones.
  assert(aug?.newRevenue === 69400, `August new revenue $69,400 (got $${aug?.newRevenue})`);
  assert(aug?.churnedRevenue === 75650, `August churned revenue $75,650 (got $${aug?.churnedRevenue})`);
  assert(
    !aug?.newClients.some((c) => /downsell|dowsell/i.test(c.name)),
    "no downsell appears as new business"
  );
  const contraction = aug?.churnedClients.find((c) => /Hello Fresh NZ/i.test(c.name));
  assert(contraction?.retainerValue === 2250, `Hello Fresh NZ churn entry is the $2,250 contraction (got ${contraction?.retainerValue})`);
  assert(
    !aug?.churnedClients.some((c) => c.retainerValue === 17750),
    "YouFoodz predecessor's full $17,750 is not booked as churn"
  );

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
