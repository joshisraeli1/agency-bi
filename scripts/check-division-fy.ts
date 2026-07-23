import {
  dealDivisionSplit,
  financialYearStartMonth,
  financialYearMonths,
  divisionRevenueForMonth,
  cumulateDivisionMonths,
  type DivisionDealInput,
} from "@/lib/analytics/division-fy";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
  else { console.log(`  ✓ ${msg}`); }
}

// --- classification ---
assert(dealDivisionSplit("Social Media")[0].division === "Social Media Management", "social media → SMM");
assert(dealDivisionSplit("Meta Ads")[0].division === "Ads Management", "meta ads → Ads");
const split = dealDivisionSplit("Social and Ads Management");
assert(split.length === 2 && split.every((s) => s.fraction === 0.5), "full suite → 50/50 SMM+Ads");
assert(dealDivisionSplit("anything else")[0].division === "Content Delivery", "unknown → Content Delivery");
assert(dealDivisionSplit(null)[0].division === "Content Delivery", "null → Content Delivery");

// --- FY math ---
assert(financialYearStartMonth(new Date("2026-07-23")) === "2026-07", "July date → FY starts same-year July");
assert(financialYearStartMonth(new Date("2026-03-10")) === "2025-07", "March date → FY starts previous-year July");
assert(JSON.stringify(financialYearMonths(new Date("2026-09-15"))) === JSON.stringify(["2026-07", "2026-08", "2026-09"]), "FY months Jul→Sep inclusive");
assert(financialYearMonths(new Date("2026-07-01")).length === 1, "single month at FY start");

// --- per-month division revenue ---
const d = (o: Partial<DivisionDealInput>): DivisionDealInput => ({
  clientId: null, amountExGst: null, startDate: null, closeDate: null, churnDate: null, contentPackageType: null, ...o,
});
const deals: DivisionDealInput[] = [
  d({ contentPackageType: "Social Media", amountExGst: 1000, startDate: new Date("2026-07-01") }),
  d({ contentPackageType: "Meta Ads", amountExGst: 500, startDate: new Date("2026-07-01") }),
  d({ contentPackageType: "Social and Ads Management", amountExGst: 2000, startDate: new Date("2026-07-01") }),
  d({ contentPackageType: "Content", amountExGst: 3000, startDate: new Date("2026-08-01") }), // not active in July
  d({ contentPackageType: "Social Media", amountExGst: 9999, startDate: new Date("2026-07-01"), clientId: "cx" }), // excluded
  d({ contentPackageType: "Content", amountExGst: 4000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-07-01") }), // churned before July
];
const excluded = new Set(["cx"]);
const jul = divisionRevenueForMonth(deals, "2026-07", excluded);
assert(jul["Social Media Management"] === 1000 + 1000, "July SMM = 1000 + 1000 (half of full suite)");
assert(jul["Ads Management"] === 500 + 1000, "July Ads = 500 + 1000 (half of full suite)");
assert(jul["Content Delivery"] === 0, "July Content Delivery = 0 (Aug deal not yet active, churned deal excluded)");
const aug = divisionRevenueForMonth(deals, "2026-08", excluded);
assert(aug["Content Delivery"] === 3000, "Aug Content Delivery = 3000");

// --- cumulation (monotonic running sum, carries across zero months) ---
const months = ["2026-07", "2026-08", "2026-09"];
const perMonth = [jul, aug, divisionRevenueForMonth(deals, "2026-09", excluded)];
const cum = cumulateDivisionMonths(months, perMonth);
assert(cum.length === 3, "cumulation returns one row per month");
assert(cum[0].month === "Jul 2026" && cum[0].rawMonth === "2026-07", "row carries display + raw month");
assert(cum[0]["Social Media Management"] === 2000, "cum Jul SMM = 2000");
assert(cum[1]["Social Media Management"] === 2000 + aug["Social Media Management"], "cum Aug SMM = Jul + Aug");
assert(cum[2]["Content Delivery"] >= cum[1]["Content Delivery"], "Content Delivery cumulative is non-decreasing");

if (failures > 0) { console.error(`\n${failures} assertion(s) FAILED`); process.exit(1); }
console.log("\nAll division-fy assertions passed.");
