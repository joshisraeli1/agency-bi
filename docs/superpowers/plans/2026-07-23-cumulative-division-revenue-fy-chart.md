# Cumulative Revenue by Division (FY) Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a grouped-bar chart to the Analytics page showing each division's cumulative recognized revenue across the current financial year to date.

**Architecture:** A new `division-fy.ts` module holds pure, testable helpers (division classification, FY month math, per-month division revenue, cumulation) plus `getCumulativeDivisionRevenueFY()`. The shared `dealDivisionSplit` classifier is also adopted by the existing `divisionRevenueTrend` in `revenue-overview.ts` to remove duplication. A Recharts client component renders three tight-grouped bars per FY month; the Analytics server page fetches the data and renders it below the Division Goals card.

**Tech Stack:** Next.js (App Router, RSC), Prisma, React, TypeScript, Recharts, `tsx` for the verification script.

## Global Constraints

- **Divisions** (exactly, in this order): `"Content Delivery"`, `"Social Media Management"`, `"Ads Management"`.
- **Classification** from `contentPackageType` (lower-cased, trimmed), identical to `divisionRevenueTrend`:
  - `"social media"` / `"social media management"` → Social Media Management (100%)
  - `"social and ads management"` → Social Media Management 50% + Ads Management 50%
  - `"meta ads"` / `"ads management"` → Ads Management (100%)
  - anything else → Content Delivery (100%)
- **Revenue basis:** recognized monthly MRR, **ex-GST** (`amountExGst`; deals with no/zero ex-GST contribute nothing). A deal is active in month `m` iff `m >= monthKey(startDate ?? closeDate)` and (`churnDate` is null or `m < monthKey(churnDate)`).
- **Excluded clients:** skip any deal whose `clientId` is in `getExcludedClientIds()`.
- **Financial year:** AU FY = 1 July → 30 June. The "current FY" is computed dynamically from `now` (month index ≥ 6 → FY starts July of the current calendar year; else July of the previous year). Never hardcode 2026.
- **Cumulative:** each FY month's value = running sum of that division's monthly MRR from the FY start month through that month (monotonic non-decreasing).
- **Chart:** grouped/clustered bars (NOT stacked), three bars per month, bars within a month touching (`barGap={0}`), normal gap between months. Ex-GST currency axis/tooltip. The implementer MUST invoke the `dataviz` skill to choose the 3-series palette, anchoring Content Delivery to brand orange `#ea580c`.
- **Module import-safety:** `division-fy.ts` top-level imports must be DB-free (import only `formatMonth` from `@/lib/utils`, which is pure). Import `db` and `getExcludedClientIds` lazily inside `getCumulativeDivisionRevenueFY` (because `excluded-clients.ts` imports `db`, which initializes Prisma at load) so the `tsx` test can import the pure helpers with no env.
- No test framework in the repo; verification is a standalone `tsx` assertion script under `scripts/`. Idioms: 2-space indent, semicolons, `formatCurrency`/`formatMonth` from `@/lib/utils`.

---

### Task 1: `division-fy.ts` module + shared classifier refactor

**Files:**
- Create: `src/lib/analytics/division-fy.ts`
- Modify: `src/lib/analytics/revenue-overview.ts` (make `divisionRevenueTrend` use the shared `dealDivisionSplit`)
- Create (test): `scripts/check-division-fy.ts`

**Interfaces:**
- Consumes: `formatMonth` from `@/lib/utils`; lazily `db` from `@/lib/db` and `getExcludedClientIds` from `./excluded-clients`.
- Produces:
  - `const DIVISIONS = ["Content Delivery", "Social Media Management", "Ads Management"] as const;` and `type Division = (typeof DIVISIONS)[number];`
  - `function dealDivisionSplit(contentPackageType: string | null): Array<{ division: Division; fraction: number }>`
  - `function financialYearStartMonth(now: Date): string` (e.g. `"2026-07"`)
  - `function financialYearMonths(now: Date): string[]` (FY-start month → month of `now`, inclusive)
  - `type DivisionDealInput = { clientId: string | null; amountExGst: number | null; startDate: Date | null; closeDate: Date | null; churnDate: Date | null; contentPackageType: string | null }`
  - `function divisionRevenueForMonth(deals: DivisionDealInput[], month: string, excludedIds: Set<string>): Record<Division, number>`
  - `interface CumulativeDivisionMonth { month: string; rawMonth: string; "Content Delivery": number; "Social Media Management": number; "Ads Management": number }`
  - `function cumulateDivisionMonths(months: string[], perMonth: Record<Division, number>[]): CumulativeDivisionMonth[]`
  - `async function getCumulativeDivisionRevenueFY(now?: Date): Promise<CumulativeDivisionMonth[]>`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-division-fy.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/.bin/tsx scripts/check-division-fy.ts`
Expected: FAIL — module `@/lib/analytics/division-fy` not found.

(Use `node node_modules/.bin/tsx` rather than `npx tsx`; `npx` misresolved in this environment.)

- [ ] **Step 3: Create `division-fy.ts`**

```typescript
import { formatMonth } from "@/lib/utils";

export const DIVISIONS = ["Content Delivery", "Social Media Management", "Ads Management"] as const;
export type Division = (typeof DIVISIONS)[number];

/**
 * Split a deal's revenue across divisions by its contentPackageType.
 * "social and ads management" (full suite) splits 50/50 between SMM and Ads;
 * unrecognized types fall into Content Delivery. Matches divisionRevenueTrend.
 */
export function dealDivisionSplit(
  contentPackageType: string | null
): Array<{ division: Division; fraction: number }> {
  const pkg = (contentPackageType || "").toLowerCase().trim();
  if (pkg === "social media" || pkg === "social media management") {
    return [{ division: "Social Media Management", fraction: 1 }];
  }
  if (pkg === "social and ads management") {
    return [
      { division: "Social Media Management", fraction: 0.5 },
      { division: "Ads Management", fraction: 0.5 },
    ];
  }
  if (pkg === "meta ads" || pkg === "ads management") {
    return [{ division: "Ads Management", fraction: 1 }];
  }
  return [{ division: "Content Delivery", fraction: 1 }];
}

const monthKeyOf = (dt: Date | null | undefined): string | null =>
  dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` : null;

/** First month (yyyy-MM) of the AU financial year (Jul–Jun) containing `now`. */
export function financialYearStartMonth(now: Date): string {
  // getMonth() is 0-based; 6 = July.
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-07`;
}

/** Month keys from the FY start month through the month of `now`, inclusive. */
export function financialYearMonths(now: Date): string[] {
  const [sy, sm] = financialYearStartMonth(now).split("-").map(Number);
  const endKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const months: string[] = [];
  let y = sy;
  let m = sm;
  for (let i = 0; i < 12; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    months.push(key);
    if (key === endKey) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

export type DivisionDealInput = {
  clientId: string | null;
  amountExGst: number | null;
  startDate: Date | null;
  closeDate: Date | null;
  churnDate: Date | null;
  contentPackageType: string | null;
};

/** Recognized ex-GST division revenue for a single month (non-cumulative). */
export function divisionRevenueForMonth(
  deals: DivisionDealInput[],
  month: string,
  excludedIds: Set<string>
): Record<Division, number> {
  const rev: Record<Division, number> = {
    "Content Delivery": 0,
    "Social Media Management": 0,
    "Ads Management": 0,
  };
  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const startKey = monthKeyOf(d.startDate ?? d.closeDate);
    if (!startKey) continue;
    const churnKey = monthKeyOf(d.churnDate);
    if (!(month >= startKey && (!churnKey || month < churnKey))) continue;
    const amt = d.amountExGst ?? 0;
    if (!amt) continue;
    for (const { division, fraction } of dealDivisionSplit(d.contentPackageType)) {
      rev[division] += amt * fraction;
    }
  }
  return rev;
}

export interface CumulativeDivisionMonth {
  month: string; // display, e.g. "Jul 2026"
  rawMonth: string; // "2026-07"
  "Content Delivery": number;
  "Social Media Management": number;
  "Ads Management": number;
}

/** Running-sum the per-month division totals into cumulative FY-to-date values. */
export function cumulateDivisionMonths(
  months: string[],
  perMonth: Record<Division, number>[]
): CumulativeDivisionMonth[] {
  const running: Record<Division, number> = {
    "Content Delivery": 0,
    "Social Media Management": 0,
    "Ads Management": 0,
  };
  return months.map((month, i) => {
    for (const div of DIVISIONS) running[div] += perMonth[i][div];
    return {
      month: formatMonth(month),
      rawMonth: month,
      "Content Delivery": Math.round(running["Content Delivery"]),
      "Social Media Management": Math.round(running["Social Media Management"]),
      "Ads Management": Math.round(running["Ads Management"]),
    };
  });
}

/**
 * Cumulative recognized revenue per division across the current FY to date.
 * `db` and `getExcludedClientIds` are imported lazily so the pure helpers above
 * stay importable (e.g. from the tsx test) without triggering Prisma init.
 */
export async function getCumulativeDivisionRevenueFY(
  now: Date = new Date()
): Promise<CumulativeDivisionMonth[]> {
  const [{ db }, { getExcludedClientIds }] = await Promise.all([
    import("@/lib/db"),
    import("./excluded-clients"),
  ]);
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: {
        clientId: true,
        amountExGst: true,
        startDate: true,
        closeDate: true,
        churnDate: true,
        contentPackageType: true,
      },
    }),
  ]);
  const months = financialYearMonths(now);
  const perMonth = months.map((m) => divisionRevenueForMonth(deals, m, excludedIds));
  return cumulateDivisionMonths(months, perMonth);
}
```

- [ ] **Step 4: Refactor `revenue-overview.ts` to use the shared classifier**

In `src/lib/analytics/revenue-overview.ts`, add to the imports at the top:

```typescript
import { dealDivisionSplit } from "./division-fy";
```

Then replace the classification branching inside `divisionRevenueTrend` (the block that currently reads):

```typescript
      const pkg = (d.contentPackageType || "").toLowerCase().trim();
      if (pkg === "social media" || pkg === "social media management") {
        add("Social Media Management", amt, d.name);
      } else if (pkg === "social and ads management") {
        add("Social Media Management", amt * 0.5, `${d.name} (Full Suite)`);
        add("Ads Management", amt * 0.5, `${d.name} (Full Suite)`);
      } else if (pkg === "meta ads" || pkg === "ads management") {
        add("Ads Management", amt, d.name);
      } else {
        add("Content Delivery", amt, d.name);
      }
```

with the behavior-preserving equivalent (a 2-entry split keeps the `(Full Suite)` label; a single division keeps the plain deal name):

```typescript
      const split = dealDivisionSplit(d.contentPackageType);
      const label = split.length > 1 ? `${d.name} (Full Suite)` : d.name;
      for (const { division, fraction } of split) add(division, amt * fraction, label);
```

This is behavior-preserving: same divisions, same fractions, same labels.

- [ ] **Step 5: Run test to verify it passes**

Run: `node node_modules/.bin/tsx scripts/check-division-fy.ts`
Expected: PASS — "All division-fy assertions passed." (exit 0)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `division-fy.ts`, `revenue-overview.ts`, or the test script.

- [ ] **Step 7: Verify the refactor is behavior-preserving against live data**

Run this throwaway check (create `scripts/_tmp_verify.ts`, run with env sourced, then delete it):

```typescript
import { getRevenueOverview } from "@/lib/analytics/revenue-overview";
async function main() {
  const ov = await getRevenueOverview(12);
  const last = ov.divisionRevenueTrend[ov.divisionRevenueTrend.length - 1];
  console.log("latest month division MRR:", {
    "Content Delivery": last["Content Delivery"],
    "Social Media Management": last["Social Media Management"],
    "Ads Management": last["Ads Management"],
  });
  const { db } = await import("@/lib/db"); await db.$disconnect();
}
main();
```

Run: `set -a; . ./.env.local; set +a; node node_modules/.bin/tsx scripts/_tmp_verify.ts`
Expected: three non-negative division numbers print without error (confirms the refactored `divisionRevenueTrend` still runs and classifies). Delete the temp file afterward: `rm -f scripts/_tmp_verify.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analytics/division-fy.ts scripts/check-division-fy.ts src/lib/analytics/revenue-overview.ts
git commit -m "Add cumulative division-revenue FY analytics + shared division classifier"
```

---

### Task 2: `CumulativeDivisionRevenueChart` component

**Files:**
- Create: `src/components/dashboard/cumulative-division-revenue-chart.tsx`

**Interfaces:**
- Consumes: `CumulativeDivisionMonth` from `@/lib/analytics/division-fy`; `formatCurrency` from `@/lib/utils`; `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/card`; Recharts (`BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`).
- Produces: `function CumulativeDivisionRevenueChart({ data }: { data: CumulativeDivisionMonth[] })` (named export).

- [ ] **Step 1: Invoke the `dataviz` skill**

Before writing chart code, invoke the `dataviz` skill and follow it to choose an accessible, theme-consistent 3-series palette. Anchor **Content Delivery** to brand orange `#ea580c`; pick two further distinct, colorblind-safe hues for Social Media Management and Ads Management (verify contrast in light and dark). Record the three hex values chosen.

- [ ] **Step 2: Write the component**

Create `src/components/dashboard/cumulative-division-revenue-chart.tsx`. Use the exact structure below; substitute the three palette hex values from Step 1 into `DIVISION_COLORS`. Match the axis/currency conventions of the existing dashboard charts (abbreviated `$K` ticks, `formatCurrency` in the tooltip).

```tsx
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { CumulativeDivisionMonth } from "@/lib/analytics/division-fy";

// From the dataviz skill (Step 1). Content Delivery anchored to brand orange.
const DIVISION_COLORS: Record<string, string> = {
  "Content Delivery": "#ea580c",
  "Social Media Management": "#2563eb", // replace per dataviz skill
  "Ads Management": "#14b8a6", // replace per dataviz skill
};
const DIVISION_ORDER = ["Content Delivery", "Social Media Management", "Ads Management"] as const;

const shortDollars = (v: number) =>
  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`;

export function CumulativeDivisionRevenueChart({ data }: { data: CumulativeDivisionMonth[] }) {
  const fyLabel = data.length ? `FY${data[0].rawMonth.slice(2, 4)}/${String(Number(data[0].rawMonth.slice(0, 4)) + 1).slice(2)}` : "FY";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cumulative Revenue by Division — {fyLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data} barGap={0} barCategoryGap="20%" margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis tickFormatter={shortDollars} tick={{ fontSize: 12, fill: "#64748b" }} width={56} />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
              labelStyle={{ color: "#334155", fontWeight: 600 }}
            />
            <Legend />
            {DIVISION_ORDER.map((div) => (
              <Bar key={div} dataKey={div} fill={DIVISION_COLORS[div]} radius={[2, 2, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

`barGap={0}` makes the three division bars touch within each month; `barCategoryGap="20%"` keeps months apart. The `fyLabel` derives "FY26/27" from the first row's `rawMonth` (no hardcoding).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from the component.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/cumulative-division-revenue-chart.tsx
git commit -m "Add CumulativeDivisionRevenueChart component"
```

---

### Task 3: Wire into the Analytics page

**Files:**
- Modify: `src/app/(dashboard)/analytics/page.tsx`

**Interfaces:**
- Consumes: `getCumulativeDivisionRevenueFY` from `@/lib/analytics/division-fy`; `CumulativeDivisionRevenueChart` from `@/components/dashboard/cumulative-division-revenue-chart`.

- [ ] **Step 1: Add imports**

In `src/app/(dashboard)/analytics/page.tsx`, add near the other analytics imports:

```typescript
import { getCumulativeDivisionRevenueFY } from "@/lib/analytics/division-fy";
```

and near the other dashboard component imports:

```typescript
import { CumulativeDivisionRevenueChart } from "@/components/dashboard/cumulative-division-revenue-chart";
```

- [ ] **Step 2: Fetch the data**

Add `getCumulativeDivisionRevenueFY()` as a new entry in the page's existing `await Promise.all([...])` block and destructure it as `cumulativeDivisionFY` (append it as the LAST array element and the LAST destructured name so positions stay aligned).

- [ ] **Step 3: Render below the Division Goals card**

Immediately after the `<DivisionGoals byPackageType={activeSnapshot.byPackageType} goals={divisionGoals} />` line, add:

```tsx
      <CumulativeDivisionRevenueChart data={cumulativeDivisionFY} />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit` (expect clean) and `npm run lint` (expect no new errors in `analytics/page.tsx`).

- [ ] **Step 5: Manual verification**

Deferred to the controller: run the dev server, open Analytics, confirm a "Cumulative Revenue by Division — FY26/27" card appears under the Division Goals card with three tight-grouped bars per month.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/analytics/page.tsx"
git commit -m "Render cumulative division-revenue FY chart on Analytics page"
```

---

## Self-Review Notes

- **Spec coverage:** grouped bars not stacked / `barGap 0` → Task 2 component; cumulative recognized ex-GST MRR reusing divisionRevenueTrend rules → Task 1 `divisionRevenueForMonth` + shared `dealDivisionSplit`; dynamic FY (Jul→current) → `financialYearStartMonth`/`financialYearMonths` + assertions; placement under DivisionGoals → Task 3 Step 3; dataviz palette + brand orange → Task 2 Step 1; DRY classifier → Task 1 Step 4 refactor; tsx test of cumulation + FY math → Task 1 Step 1.
- **Placeholder scan:** the two non-orange hex values in `DIVISION_COLORS` are explicitly to be replaced via the dataviz skill in Task 2 Step 1 — not a leftover TODO.
- **Type consistency:** `Division`, `DivisionDealInput`, `CumulativeDivisionMonth`, `dealDivisionSplit`, `divisionRevenueForMonth`, `cumulateDivisionMonths`, `getCumulativeDivisionRevenueFY` names identical across tasks; the `CumulativeDivisionMonth` keys match the `dataKey`s in the chart.
- **Behavior preservation:** Task 1 Step 4 changes `divisionRevenueTrend` internals only; Step 7 verifies it still produces division numbers against live data. The full Overview page is not otherwise touched.
