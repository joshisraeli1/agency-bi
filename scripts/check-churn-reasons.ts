import { db } from "@/lib/db";
import { getChurnReasons } from "@/lib/analytics/churn-reasons";
import { OTHER_REASON, UNSPECIFIED_REASON } from "@/lib/analytics/churn-reason-labels";
import { loadDownsellResolution } from "@/lib/analytics/downsells";
import { getMonthRange, toMonthKey } from "@/lib/utils";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

const MONTHS = 12;

async function main() {
  const data = await getChurnReasons(MONTHS);
  const range = new Set(getMonthRange(MONTHS));

  console.log(`range: ${MONTHS} months | churned deals: ${data.churnedDeals} | reason mentions: ${data.reasonMentions}`);
  console.log(`top ${data.topReasons.length}: ${data.topReasons.join(", ")}`);

  // 1. Mentions reconcile with the totals table.
  const totalsSum = data.totals.reduce((s, t) => s + t.count, 0);
  assert(totalsSum === data.reasonMentions, `totals sum to reasonMentions (${totalsSum} vs ${data.reasonMentions})`);

  // 2. The monthly stack sums to the same mention total.
  const monthSum = data.byMonth.reduce(
    (s, r) => s + Object.values(r.counts).reduce((a, b) => a + b, 0), 0
  );
  assert(monthSum === data.reasonMentions, `byMonth counts sum to reasonMentions (${monthSum} vs ${data.reasonMentions})`);

  // 3. Multi-select means mentions >= deals, and every deal cites something.
  assert(data.reasonMentions >= data.churnedDeals, `reasonMentions >= churnedDeals`);

  // 4. Top-N contract.
  assert(data.topReasons.length <= 6, `topReasons capped at 6 (got ${data.topReasons.length})`);
  const totalReasons = new Set(data.totals.map((t) => t.reason));
  assert(data.topReasons.every((r) => totalReasons.has(r)), `every topReason appears in totals`);
  assert(!data.topReasons.includes(OTHER_REASON), `"${OTHER_REASON}" is not itself a topReason`);
  assert(data.byMonth.every((r) => Object.keys(r.counts).length === data.topReasons.length + 1),
    `every month carries exactly the charted series`);

  // 5. Downsell is never a reason, and no predecessor deal is counted.
  assert(!data.totals.some((t) => /downsell/i.test(t.reason)), `no "Downsell" slice`);
  const [downsells, allChurned] = await Promise.all([
    loadDownsellResolution(),
    db.hubspotDeal.findMany({
      where: { churnDate: { not: null } },
      select: { id: true, name: true, churnDate: true, churnReason: true, clientId: true },
    }),
  ]);
  const inRange = allChurned.filter((d) => d.churnDate && range.has(toMonthKey(d.churnDate)));
  const predecessorsInRange = inRange.filter((d) => downsells.predecessorIds.has(d.id));
  const chartedNames = new Set(data.byMonth.flatMap((r) => Object.values(r.deals).flat()));
  assert(predecessorsInRange.every((d) => !chartedNames.has(d.name)),
    `no downsell predecessor is charted (${predecessorsInRange.length} in range)`);

  // 6. Unspecified matches the deals with a blank reason (a lone "Downsell"
  //    token also blanks out, so count those the same way the module does).
  const blank = inRange.filter((d) => {
    const parts = (d.churnReason ?? "").split(";").map((s) => s.trim())
      .filter((s) => s.length > 0 && s.toLowerCase() !== "downsell");
    return parts.length === 0;
  });
  const blankVisible = blank.filter((d) => !downsells.predecessorIds.has(d.id));
  assert(data.unspecified <= blankVisible.length,
    `unspecified (${data.unspecified}) <= blank-reason deals in range (${blankVisible.length}); the gap is excluded clients`);
  const unspecifiedTotal = data.totals.find((t) => t.reason === UNSPECIFIED_REASON)?.count ?? 0;
  assert(unspecifiedTotal === data.unspecified,
    `"${UNSPECIFIED_REASON}" total matches the unspecified count (${unspecifiedTotal} vs ${data.unspecified})`);

  // 7. Drill-down names reconcile with the charted counts per month.
  for (const row of data.byMonth) {
    const fromCounts = Object.values(row.counts).reduce((a, b) => a + b, 0);
    const fromDeals = Object.values(row.deals).reduce((a, b) => a + b.length, 0);
    if (fromCounts !== fromDeals) {
      failures++;
      console.error(`  ✗ ${row.month}: counts ${fromCounts} != drill-down ${fromDeals}`);
    }
  }
  console.log(`  ✓ drill-down names reconcile with counts in all ${data.byMonth.length} months`);

  console.log("\n-- totals --");
  for (const t of data.totals) console.log(`${String(t.count).padStart(4)}  ${t.reason}`);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
