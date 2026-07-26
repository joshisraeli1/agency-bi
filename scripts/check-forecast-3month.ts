import {
  medianCreateToStartLagDays,
  expectedStartMonth,
  buildForecast,
  forecastMonths,
  dealExGst,
  type PipelineDealInput,
} from "@/lib/analytics/forecast-3month";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
  else { console.log(`  ✓ ${msg}`); }
}
const approx = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps;

// dealExGst fallback
assert(dealExGst({ amountExGst: 1000, amount: 1100 }) === 1000, "dealExGst prefers ex-GST");
assert(approx(dealExGst({ amountExGst: null, amount: 1100 }), 1000), "dealExGst falls back to amount/1.1");

// forecastMonths = next 3 after now
assert(JSON.stringify(forecastMonths(new Date("2026-07-24"), 3)) === JSON.stringify(["2026-08", "2026-09", "2026-10"]), "forecastMonths = next 3 months");

// median lag
assert(medianCreateToStartLagDays([
  { createDate: new Date("2026-01-01"), startDate: new Date("2026-01-11") }, // 10
  { createDate: new Date("2026-01-01"), startDate: new Date("2026-01-21") }, // 20
  { createDate: new Date("2026-01-01"), startDate: new Date("2026-01-31") }, // 30
]) === 20, "median lag of [10,20,30] = 20");
assert(medianCreateToStartLagDays([]) === 30, "median lag defaults to 30 when no data");

// expectedStartMonth
const months = ["2026-08", "2026-09", "2026-10"];
const now = new Date("2026-07-24");
const base = (o: Partial<PipelineDealInput>): PipelineDealInput => ({
  name: "d", stageLabel: "Very Warm", amountExGst: null, amount: null, startDate: null, createDate: null, ...o,
});
assert(expectedStartMonth(base({ startDate: new Date("2026-09-10") }), 30, months, now) === "2026-09", "start date wins → its month");
assert(expectedStartMonth(base({ createDate: new Date("2026-07-20") }), 30, months, now) === "2026-08", "no start date → createDate + ~30d lands in Aug");
assert(expectedStartMonth(base({ startDate: new Date("2026-06-01") }), 30, months, now) === "2026-08", "overdue (past) → clamped to first forecast month");
assert(expectedStartMonth(base({ startDate: new Date("2027-02-01") }), 30, months, now) === null, "beyond horizon → null");

// buildForecast running balance
const forecast = buildForecast({
  currentMrr: 100000,
  months,
  pipeline: [
    { name: "Deal A", expected: 5000, month: "2026-09" }, // lands month 2
  ],
  churn: [
    { name: "Churn X", amount: 2000, month: "2026-08" }, // known churn month 1
  ],
  netNewMonthly: 3000,
  churnRate: 0.10,
});
assert(forecast.length === 3, "three forecast months");
// Month 1 (Aug): starting 100000, +0 pipeline, +3000 net-new, -2000 known, -baseline 0.10*(100000-2000)=9800 → 91200
assert(forecast[0].knownChurn === 2000 && forecast[0].baselineChurn === 9800, "month1 churn split (baseline on base minus known)");
assert(forecast[0].projected === 91200, "month1 projected = 100000+0+3000-2000-9800");
assert(forecast[0].churnDeals.length === 1 && forecast[0].pipelineDeals.length === 0, "month1 drill-downs");
// Month 2 (Sep): starting 91200, +5000 pipeline, +3000, -0 known, -baseline 0.10*91200=9120 → 90080
assert(forecast[1].starting === 91200, "month2 starts from month1 projected");
assert(forecast[1].pipelineAdded === 5000 && forecast[1].pipelineDeals[0].name === "Deal A", "month2 pipeline add + drill-down");
assert(forecast[1].projected === 90080, "month2 projected = 91200+5000+3000-0-9120");
// Month 3 (Oct): pipeline deal persists via running balance (no new pipeline add, but starting already includes it)
assert(forecast[2].pipelineAdded === 0, "month3 has no NEW pipeline add");
assert(forecast[2].starting === 90080, "month3 starts from month2 projected (pipeline persisted)");

if (failures > 0) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
console.log("\nAll forecast-3month assertions passed.");
