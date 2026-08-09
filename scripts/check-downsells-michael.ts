import { getMichaelSalesData } from "@/lib/analytics/michael-sales";
import { loadDownsellResolution } from "@/lib/analytics/downsells";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

async function main() {
  const res = await loadDownsellResolution();
  const data = await getMichaelSalesData();

  const namesIn = (rec: Record<string, { name: string }[]>) => Object.values(rec).flat().map((d) => d.name);
  assert(!namesIn(data.createdDealsByMonth).some((n) => /downsell|dowsell/i.test(n)), "no downsell counted as a deal created");
  assert(!namesIn(data.newRevenueDealsByMonth).some((n) => /downsell|dowsell/i.test(n)), "no downsell counted as new revenue");
  const commissionNames = data.commission.months.flatMap((m) => m.ownedDeals.map((d) => d.name));
  assert(!commissionNames.some((n) => /downsell|dowsell/i.test(n)), "no commission paid on a downsell");

  console.log(`  (${res.pairs.length} pairs exist; none owned by Michael today — this guards future ones)`);
  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
