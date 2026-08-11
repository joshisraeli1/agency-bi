import { db } from "@/lib/db";

const PREDECESSORS = ["59153676324", "56116135556", "58208775747"];

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

async function main() {
  const rows = await db.hubspotDeal.findMany({
    where: { id: { in: PREDECESSORS } },
    select: { id: true, name: true, churnReason: true, churnDate: true },
  });
  assert(rows.length === 3, `all 3 predecessors present (got ${rows.length})`);
  for (const r of rows) {
    assert(r.churnReason === "Downsell", `${r.name} churnReason is "Downsell" (got ${JSON.stringify(r.churnReason)})`);
    assert(r.churnDate?.toISOString().slice(0, 7) === "2026-08", `${r.name} churns in 2026-08`);
  }
  const tagged = await db.hubspotDeal.count({ where: { churnReason: { not: null } } });
  console.log(`\ndeals with any churn reason: ${tagged}`);
  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
