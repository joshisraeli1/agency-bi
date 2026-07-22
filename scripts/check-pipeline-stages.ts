import { bucketPipelineStages, type PipelineDealInput } from "@/lib/analytics/pipeline-stages";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// `now` is passed through but does not affect bucketing (columns key off stageLabel).
const now = new Date("2026-07-21T00:00:00Z");

const deals: PipelineDealInput[] = [
  // Very Warm — amountExGst null, so value falls back to inc-GST `amount / 1.1`
  { name: "Warm A", clientId: "c1", stageLabel: "Very Warm", amount: 1100, amountExGst: null },
  { name: "Warm G", clientId: "c6", stageLabel: "Very Warm", amount: 550, amountExGst: null },
  // Contract out
  { name: "Contract B", clientId: "c2", stageLabel: "Contract out", amount: 2200, amountExGst: 2000 },
  // Closed Won
  { name: "Won C", clientId: "c3", stageLabel: "Closed Won", amount: 3300, amountExGst: 3000 },
  { name: "Won D", clientId: "c4", stageLabel: "Closed Won", amount: 4400, amountExGst: 4000 },
  // Churned column = "Churned but still active" + "Current (Not Paying)"
  { name: "Still Active E", clientId: "c5", stageLabel: "Churned but still active", amount: 0, amountExGst: 6000 },
  { name: "Not Paying H", clientId: "c7", stageLabel: "Current (Not Paying)", amount: 0, amountExGst: 1000 },
  // Plain "Churned" → dropped (not one of the four columns)
  { name: "Dead I", clientId: "c8", stageLabel: "Churned", amount: 0, amountExGst: 99999 },
  // Excluded client → dropped from ALL buckets even though its label matches
  { name: "Excluded F", clientId: "cx", stageLabel: "Closed Won", amount: 9999, amountExGst: 9999 },
];

const excluded = new Set(["cx"]);
const cols = bucketPipelineStages(deals, excluded, now);

assert(cols.length === 4, "returns exactly 4 columns");
assert(cols.map((c) => c.stage).join(",") === "Very Warm,Contract out,Closed Won,Churned (still active)", "columns in progression order");

const byStage = Object.fromEntries(cols.map((c) => [c.stage, c]));

// Very Warm: ex-GST fallback = amount / 1.1 → Warm A 1100→1000 + Warm G 550→500 = 1500, sorted high→low
assert(byStage["Very Warm"].total === 1500, "Very Warm total derives ex-GST from inc-GST amount (/1.1) when ex-GST null");
assert(byStage["Very Warm"].deals.length === 2, "Very Warm has 2 deals");
assert(byStage["Very Warm"].deals[0].name === "Warm A", "Very Warm sorted high→low (Warm A first)");

// Contract out: Contract B (2000, ex-GST)
assert(byStage["Contract out"].total === 2000, "Contract out total = 2000");

// Closed Won: Won C + Won D = 3000 + 4000 = 7000; Excluded F dropped
assert(byStage["Closed Won"].total === 7000, "Closed Won sums stageLabel='Closed Won', excludes excluded client");
assert(byStage["Closed Won"].deals.length === 2, "Closed Won has 2 deals");
assert(!byStage["Closed Won"].deals.some((d) => d.name === "Excluded F"), "Closed Won drops excluded client");

// Churned (still active): Still Active E (6000) + Not Paying H (1000) = 7000; plain "Churned" NOT included
assert(byStage["Churned (still active)"].total === 7000, "Churned (still active) = 'still active' + 'not paying' merged");
assert(byStage["Churned (still active)"].deals.length === 2, "Churned (still active) has 2 deals");
assert(!byStage["Churned (still active)"].deals.some((d) => d.name === "Dead I"), "plain 'Churned' stage is excluded");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll pipeline-stage bucketing assertions passed.");
