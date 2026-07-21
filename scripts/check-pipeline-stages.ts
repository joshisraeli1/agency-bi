import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { bucketPipelineStages, type PipelineDealInput } from "../src/lib/analytics/pipeline-stages";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

const now = new Date("2026-07-21T00:00:00Z");
const past = new Date("2026-01-01T00:00:00Z");
const future = new Date("2026-12-01T00:00:00Z");

const deals: PipelineDealInput[] = [
  // Very Warm
  { name: "Warm A", clientId: "c1", stage: "qualified", stageLabel: "Very Warm", amount: 1100, amountExGst: 1000, churnDate: null },
  // Contract out
  { name: "Contract B", clientId: "c2", stage: "negotiation", stageLabel: "Contract out", amount: 2200, amountExGst: 2000, churnDate: null },
  // Closed Won, no churn
  { name: "Won C", clientId: "c3", stage: "closed_won", stageLabel: "Closed Won", amount: 3300, amountExGst: 3000, churnDate: null },
  // Closed Won with FUTURE churn date → Closed Won only, NOT Churned
  { name: "Won D (future churn)", clientId: "c4", stage: "closed_won", stageLabel: "Closed Won", amount: 4400, amountExGst: 4000, churnDate: future },
  // Closed Won with PAST churn date → Closed Won AND Churned
  { name: "Won E (past churn)", clientId: "c5", stage: "closed_won", stageLabel: "Closed Won", amount: 5500, amountExGst: 5000, churnDate: past },
  // Excluded client → dropped from ALL buckets
  { name: "Excluded F", clientId: "cx", stage: "closed_won", stageLabel: "Closed Won", amount: 9999, amountExGst: 9999, churnDate: null },
  // amountExGst null → falls back to amount
  { name: "Warm G (no exGst)", clientId: "c6", stage: "qualified", stageLabel: "Very Warm", amount: 500, amountExGst: null, churnDate: null },
];

const excluded = new Set(["cx"]);
const cols = bucketPipelineStages(deals, excluded, now);

assert(cols.length === 4, "returns exactly 4 columns");
assert(cols.map((c) => c.stage).join(",") === "Very Warm,Contract out,Closed Won,Churned", "columns in progression order");

const byStage = Object.fromEntries(cols.map((c) => [c.stage, c]));

// Very Warm: Warm A (1000) + Warm G (500, from amount fallback) = 1500
assert(byStage["Very Warm"].total === 1500, "Very Warm total sums ex-GST with amount fallback");
assert(byStage["Very Warm"].deals.length === 2, "Very Warm has 2 deals");
assert(byStage["Very Warm"].deals[0].name === "Warm A", "Very Warm sorted high→low (Warm A first)");

// Contract out: Contract B (2000)
assert(byStage["Contract out"].total === 2000, "Contract out total = 2000");

// Closed Won: Won C + Won D + Won E (excludes Excluded F) = 3000+4000+5000 = 12000
assert(byStage["Closed Won"].total === 12000, "Closed Won = full book incl. future & past churn, excludes excluded client");
assert(byStage["Closed Won"].deals.length === 3, "Closed Won has 3 deals");
assert(!byStage["Closed Won"].deals.some((d) => d.name === "Excluded F"), "Closed Won drops excluded client");

// Churned: only Won E (past churn) = 5000. Won D (future churn) NOT included.
assert(byStage["Churned"].total === 5000, "Churned = only past-dated churn (5000)");
assert(byStage["Churned"].deals.length === 1 && byStage["Churned"].deals[0].name === "Won E (past churn)", "Churned contains only the past-churn deal");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log("\nAll pipeline-stage bucketing assertions passed.");
