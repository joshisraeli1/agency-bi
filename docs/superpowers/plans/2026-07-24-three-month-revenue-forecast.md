# 3-Month Revenue Forecast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "3-Month Revenue Forecast" card to the bottom of the Overview page: a projected recognized-MRR figure for each of the next three months, decomposed into pipeline / net-new / churn and drillable to deals.

**Architecture:** A new `forecast-3month.ts` module holds pure, testable helpers (median lag, expected-start-month timing, the running-balance builder) plus `getThreeMonthForecast()`. A client component renders three month blocks with drill-downs, reusing the `pipeline-stage-tool.tsx` interaction. The Overview server page fetches and renders it after the pipeline-stage tool.

**Tech Stack:** Next.js (App Router, RSC), Prisma, React, TypeScript, `tsx` for the verification script.

## Global Constraints

- **Ex-GST throughout.** Deal value = `amountExGst ?? amount / 1.1`.
- **Stage probabilities (constants, HubSpot's real values):** `{ "Very Warm": 0.70, "Contract out": 0.90 }`. No DB column / migration.
- **Base MRR** = `stageLabel = "Closed Won"` ex-GST, excluded clients removed (`getExcludedClientIds()`).
- **Forecast months** = the next three calendar months after the current month (current+1, +2, +3).
- **Pipeline timing:** expected start month = `startDate`'s month if set, else month of `createDate + medianLagDays` (median historical `createDate→startDate` lag over closed-won deals). Clamp a computed month at/before the current month to the FIRST forecast month; drop deals beyond the horizon.
- **Net-new** = trailing-12-month average monthly new closed-won revenue (start month = `startDate ?? closeDate`), added every forecast month.
- **Known churn[m]** = ex-GST of **Closed Won** deals whose `churnDate` is in month m (base-only, no over-subtraction). **Churn rate** = (trailing-12-month churned ex-GST ÷ 12) ÷ currentMrr, applied as `baselineChurn[m] = churnRate × max(0, starting − knownChurn[m])`.
- **Running balance:** `projected[m] = starting + pipelineAdded[m] + netNewMonthly − knownChurn[m] − baselineChurn[m]`, carrying `starting` forward.
- **Module import-safety:** `forecast-3month.ts` top-level imports must be DB-free (only `formatMonth` from `@/lib/utils`). Import `db` and `getExcludedClientIds` lazily inside `getThreeMonthForecast`.
- No test framework; `tsx` assertion script under `scripts/`, run via `node node_modules/.bin/tsx`. Idioms: 2-space indent, semicolons, `formatCurrency`/`formatMonth` from `@/lib/utils`.

---

### Task 1: `forecast-3month.ts` module + tsx test

**Files:**
- Create: `src/lib/analytics/forecast-3month.ts`
- Create (test): `scripts/check-forecast-3month.ts`

**Interfaces produced:**
- `const STAGE_PROBABILITY: Record<string, number>`
- `dealExGst(d: { amountExGst: number | null; amount: number | null }): number`
- `forecastMonths(now: Date, n?: number): string[]`
- `medianCreateToStartLagDays(deals: { createDate: Date | null; startDate: Date | null }[]): number`
- `type PipelineDealInput = { name: string; stageLabel: string | null; amountExGst: number | null; amount: number | null; startDate: Date | null; createDate: Date | null }`
- `expectedStartMonth(d: PipelineDealInput, medianLagDays: number, months: string[], now: Date): string | null`
- `buildForecast(args): ForecastMonth[]`
- `interface ForecastDealRef`, `interface ForecastMonth`, `interface ThreeMonthForecast`
- `async function getThreeMonthForecast(now?: Date): Promise<ThreeMonthForecast>`

- [ ] **Step 1: Write the failing test**

Create `scripts/check-forecast-3month.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/.bin/tsx scripts/check-forecast-3month.ts`
Expected: FAIL — module `@/lib/analytics/forecast-3month` not found.

- [ ] **Step 3: Create `forecast-3month.ts`**

```typescript
import { formatMonth } from "@/lib/utils";

export const STAGE_PROBABILITY: Record<string, number> = {
  "Very Warm": 0.7,
  "Contract out": 0.9,
};

const GST = 1.1;
export const dealExGst = (d: { amountExGst: number | null; amount: number | null }): number =>
  d.amountExGst ?? (d.amount != null ? d.amount / GST : 0);

const monthKeyOf = (dt: Date | null | undefined): string | null =>
  dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}` : null;

/** The next `n` calendar months after the month of `now` (excludes current). */
export function forecastMonths(now: Date, n = 3): string[] {
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Median whole-day lag from createDate to startDate over deals that have both. Defaults to 30. */
export function medianCreateToStartLagDays(
  deals: { createDate: Date | null; startDate: Date | null }[]
): number {
  const lags = deals
    .filter((d) => d.createDate && d.startDate)
    .map((d) => Math.round((d.startDate!.getTime() - d.createDate!.getTime()) / 86_400_000))
    .filter((x) => x >= 0)
    .sort((a, b) => a - b);
  if (!lags.length) return 30;
  const mid = Math.floor(lags.length / 2);
  return lags.length % 2 ? lags[mid] : Math.round((lags[mid - 1] + lags[mid]) / 2);
}

export type PipelineDealInput = {
  name: string;
  stageLabel: string | null;
  amountExGst: number | null;
  amount: number | null;
  startDate: Date | null;
  createDate: Date | null;
};

/**
 * Expected start month (yyyy-MM) for an open pipeline deal within the horizon,
 * or null if it falls beyond it. Start date wins; otherwise createDate + median
 * lag. A computed month at/before the current month clamps to the first
 * forecast month (an overdue-but-open deal is expected imminently).
 */
export function expectedStartMonth(
  d: PipelineDealInput,
  medianLagDays: number,
  months: string[],
  now: Date
): string | null {
  void now;
  let key: string | null;
  if (d.startDate) {
    key = monthKeyOf(d.startDate);
  } else if (d.createDate) {
    key = monthKeyOf(new Date(d.createDate.getTime() + medianLagDays * 86_400_000));
  } else {
    key = months[0];
  }
  if (!key) key = months[0];
  const first = months[0];
  const last = months[months.length - 1];
  if (key < first) return first;
  if (key > last) return null;
  return key;
}

export interface ForecastDealRef {
  name: string;
  amount: number;
}

export interface ForecastMonth {
  month: string;
  rawMonth: string;
  starting: number;
  pipelineAdded: number;
  netNewAdded: number;
  knownChurn: number;
  baselineChurn: number;
  projected: number;
  pipelineDeals: ForecastDealRef[];
  churnDeals: ForecastDealRef[];
}

export interface ThreeMonthForecast {
  currentMrr: number;
  months: ForecastMonth[];
  assumptions: {
    netNewMonthly: number;
    churnRatePct: number;
    medianLagDays: number;
    stageProbabilities: { stage: string; probability: number }[];
  };
}

interface BuildForecastArgs {
  currentMrr: number;
  months: string[];
  pipeline: { name: string; expected: number; month: string }[];
  churn: { name: string; amount: number; month: string }[];
  netNewMonthly: number;
  churnRate: number;
}

/** Roll the running MRR balance forward across the forecast months. */
export function buildForecast(args: BuildForecastArgs): ForecastMonth[] {
  const { currentMrr, months, pipeline, churn, netNewMonthly, churnRate } = args;
  const out: ForecastMonth[] = [];
  let starting = currentMrr;
  for (const m of months) {
    const pDeals = pipeline.filter((p) => p.month === m);
    const pipelineAdded = pDeals.reduce((s, p) => s + p.expected, 0);
    const cDeals = churn.filter((c) => c.month === m);
    const knownChurn = cDeals.reduce((s, c) => s + c.amount, 0);
    const baselineChurn = churnRate * Math.max(0, starting - knownChurn);
    const projected = starting + pipelineAdded + netNewMonthly - knownChurn - baselineChurn;
    out.push({
      month: formatMonth(m),
      rawMonth: m,
      starting: Math.round(starting),
      pipelineAdded: Math.round(pipelineAdded),
      netNewAdded: Math.round(netNewMonthly),
      knownChurn: Math.round(knownChurn),
      baselineChurn: Math.round(baselineChurn),
      projected: Math.round(projected),
      pipelineDeals: pDeals
        .map((p) => ({ name: p.name, amount: Math.round(p.expected) }))
        .sort((a, b) => b.amount - a.amount),
      churnDeals: cDeals
        .map((c) => ({ name: c.name, amount: Math.round(c.amount) }))
        .sort((a, b) => b.amount - a.amount),
    });
    starting = projected;
  }
  return out;
}

/** Three-month MRR forecast for the Overview page. `db`/`getExcludedClientIds` imported lazily. */
export async function getThreeMonthForecast(now: Date = new Date()): Promise<ThreeMonthForecast> {
  const [{ db }, { getExcludedClientIds }] = await Promise.all([
    import("@/lib/db"),
    import("./excluded-clients"),
  ]);
  const excludedIds = await getExcludedClientIds();
  const deals = await db.hubspotDeal.findMany({
    where: {
      OR: [
        { stageLabel: { in: ["Very Warm", "Contract out", "Closed Won"] } },
        { churnDate: { not: null } },
      ],
    },
    select: {
      name: true,
      clientId: true,
      stageLabel: true,
      amount: true,
      amountExGst: true,
      startDate: true,
      closeDate: true,
      createDate: true,
      churnDate: true,
    },
  });
  const kept = deals.filter((d) => !(d.clientId && excludedIds.has(d.clientId)));
  const months = forecastMonths(now, 3);

  const closedWon = kept.filter((d) => d.stageLabel === "Closed Won");
  const currentMrr = closedWon.reduce((s, d) => s + dealExGst(d), 0);

  // trailing 12 months (excluding current)
  const last12: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last12.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  let newSum = 0;
  for (const d of closedWon) {
    const m = monthKeyOf(d.startDate ?? d.closeDate);
    if (m && last12.includes(m)) newSum += dealExGst(d);
  }
  const netNewMonthly = newSum / 12;

  let churnSum = 0;
  for (const d of kept) {
    const m = monthKeyOf(d.churnDate);
    if (m && last12.includes(m)) churnSum += dealExGst(d);
  }
  const churnRate = currentMrr > 0 ? churnSum / 12 / currentMrr : 0;

  const medianLagDays = medianCreateToStartLagDays(closedWon);

  const pipeline: { name: string; expected: number; month: string }[] = [];
  for (const d of kept) {
    if (d.stageLabel !== "Very Warm" && d.stageLabel !== "Contract out") continue;
    const expected = dealExGst(d) * (STAGE_PROBABILITY[d.stageLabel] ?? 0);
    if (expected <= 0) continue;
    const m = expectedStartMonth(d, medianLagDays, months, now);
    if (!m) continue;
    pipeline.push({ name: d.name, expected, month: m });
  }

  // known churn: Closed Won base deals whose churn date lands in the horizon
  const churn: { name: string; amount: number; month: string }[] = [];
  for (const d of closedWon) {
    const m = monthKeyOf(d.churnDate);
    if (m && months.includes(m)) churn.push({ name: d.name, amount: dealExGst(d), month: m });
  }

  const monthsOut = buildForecast({ currentMrr, months, pipeline, churn, netNewMonthly, churnRate });
  return {
    currentMrr: Math.round(currentMrr),
    months: monthsOut,
    assumptions: {
      netNewMonthly: Math.round(netNewMonthly),
      churnRatePct: Math.round(churnRate * 1000) / 10,
      medianLagDays,
      stageProbabilities: Object.entries(STAGE_PROBABILITY).map(([stage, probability]) => ({ stage, probability })),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node node_modules/.bin/tsx scripts/check-forecast-3month.ts`
Expected: PASS — "All forecast-3month assertions passed." (exit 0)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/forecast-3month.ts scripts/check-forecast-3month.ts
git commit -m "Add 3-month revenue forecast analytics"
```

---

### Task 2: `ThreeMonthForecast` component

**Files:**
- Create: `src/components/dashboard/three-month-forecast.tsx`

**Interfaces:**
- Consumes: `ThreeMonthForecast`, `ForecastMonth`, `ForecastDealRef` from `@/lib/analytics/forecast-3month`; `formatCurrency` from `@/lib/utils`; `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/card`.
- Produces: `function ThreeMonthForecast({ data }: { data: ThreeMonthForecast })` (named export).

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/three-month-forecast.tsx`. Render an assumptions strip, then three month blocks; each shows the decomposition, with the Pipeline and Known-churn lines clickable to expand deals (one open at a time via `useState`, keyed by `${rawMonth}:${kind}`), mirroring the `pipeline-stage-tool.tsx` drill-down markup.

```tsx
"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { ForecastDealRef, ForecastMonth, ThreeMonthForecast as ThreeMonthForecastData } from "@/lib/analytics/forecast-3month";

function DealList({ deals }: { deals: ForecastDealRef[] }) {
  if (!deals.length) return <p className="mt-1 text-xs text-muted-foreground">No deals.</p>;
  return (
    <div className="mt-1 space-y-1">
      {deals.map((d, i) => (
        <div key={`${d.name}-${i}`} className="flex items-center justify-between text-xs border-b py-1 last:border-0">
          <span className="truncate mr-2">{d.name}</span>
          <span className="tabular-nums text-muted-foreground">{formatCurrency(d.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function MonthBlock({
  m,
  openKey,
  onToggle,
}: {
  m: ForecastMonth;
  openKey: string | null;
  onToggle: (key: string) => void;
}) {
  const pipeKey = `${m.rawMonth}:pipeline`;
  const churnKey = `${m.rawMonth}:churn`;
  const Row = ({
    label,
    value,
    note,
    sign,
    onClick,
    active,
  }: {
    label: string;
    value: number;
    note?: string;
    sign?: "+" | "−";
    onClick?: () => void;
    active?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center justify-between rounded px-1 py-0.5 text-sm ${onClick ? "hover:bg-muted cursor-pointer" : "cursor-default"} ${active ? "bg-muted" : ""}`}
    >
      <span className="text-muted-foreground">
        {label}
        {note ? <span className="ml-1 text-xs">({note})</span> : null}
        {onClick ? <span className="ml-1 text-xs">▸</span> : null}
      </span>
      <span className="tabular-nums">
        {sign ? `${sign}` : ""}
        {formatCurrency(value)}
      </span>
    </button>
  );

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm font-semibold">{m.month}</div>
      <div className="space-y-0.5">
        <Row label="Starting" value={m.starting} />
        <Row label="Pipeline" value={m.pipelineAdded} sign="+" onClick={() => onToggle(pipeKey)} active={openKey === pipeKey} />
        {openKey === pipeKey && <DealList deals={m.pipelineDeals} />}
        <Row label="Net-new" value={m.netNewAdded} sign="+" note="run-rate" />
        <Row label="Known churn" value={m.knownChurn} sign="−" onClick={() => onToggle(churnKey)} active={openKey === churnKey} />
        {openKey === churnKey && <DealList deals={m.churnDeals} />}
        <Row label="Baseline churn" value={m.baselineChurn} sign="−" note="rate" />
        <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold">
          <span>Projected MRR</span>
          <span className="tabular-nums">{formatCurrency(m.projected)}</span>
        </div>
      </div>
    </div>
  );
}

export function ThreeMonthForecast({ data }: { data: ThreeMonthForecastData }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) => setOpenKey((prev) => (prev === key ? null : key));
  const { assumptions } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>3-Month Revenue Forecast</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          From current MRR {formatCurrency(data.currentMrr)} · net-new {formatCurrency(assumptions.netNewMonthly)}/mo ·{" "}
          churn <span className="font-semibold text-foreground">{assumptions.churnRatePct}%/mo</span> ·{" "}
          {assumptions.stageProbabilities.map((s) => `${s.stage} ${Math.round(s.probability * 100)}%`).join(" · ")} ·{" "}
          timing ~{assumptions.medianLagDays}d
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.months.map((m) => (
            <MonthBlock key={m.rawMonth} m={m} openKey={openKey} onToggle={toggle} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/three-month-forecast.tsx
git commit -m "Add ThreeMonthForecast component"
```

---

### Task 3: Wire into the Overview page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { getThreeMonthForecast } from "@/lib/analytics/forecast-3month";
```
and with the component imports:
```typescript
import { ThreeMonthForecast } from "@/components/dashboard/three-month-forecast";
```

- [ ] **Step 2: Fetch in the existing Promise.all**

Append `getThreeMonthForecast()` as the LAST entry of the `Promise.all([...])` array and destructure it as `threeMonthForecast` (the LAST destructured name, so positions stay aligned).

- [ ] **Step 3: Render after the pipeline-stage tool**

Immediately after `<PipelineStageTool stages={pipelineStages} />` (currently the last section, just before the final closing `</div>`):

```tsx
      <ThreeMonthForecast data={threeMonthForecast} />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit` (clean) and `npm run lint` (no new errors in `page.tsx`).

- [ ] **Step 5: Manual verification (controller)**

Deferred to the controller: run the dev server, open the Overview, scroll to the bottom, confirm a "3-Month Revenue Forecast" card appears under the pipeline-stage tool with three month blocks and working Pipeline / Known-churn drill-downs.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "Render 3-month revenue forecast on the Overview page"
```

---

## Self-Review Notes

- **Spec coverage:** base = Closed Won ex-GST → `getThreeMonthForecast`; probability-weighted + timed pipeline → `expectedStartMonth` + `STAGE_PROBABILITY` + assertions; net-new trailing-12mo → `netNewMonthly`; known churn (base-only) + baseline rate → `buildForecast` churn split + assertion (no double-count); running balance persistence → month2/month3 assertions; drill-downs → Task 2 `DealList`; assumptions strip incl. flagged churn % → Task 2; placement below pipeline-stage tool → Task 3.
- **Placeholder scan:** none — full code in every step.
- **Type consistency:** `ForecastMonth` / `ForecastDealRef` / `ThreeMonthForecast` / `getThreeMonthForecast` / `buildForecast` / `expectedStartMonth` names consistent across tasks; component aliases the type import as `ThreeMonthForecastData` to avoid colliding with the `ThreeMonthForecast` component name.
- **Import-safety:** `forecast-3month.ts` only imports `formatMonth` at top; `db`/`getExcludedClientIds` lazy — test imports pure helpers with no Prisma init.
- **Churn no-double-count:** `baselineChurn = churnRate × (starting − knownChurn)`; known churn restricted to Closed Won base. Verified by the month1 assertion (baseline 9800 = 0.10 × (100000 − 2000)).
