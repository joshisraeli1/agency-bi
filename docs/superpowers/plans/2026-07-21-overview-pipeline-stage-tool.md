# Overview Pipeline-Stage Revenue Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Revenue by Pipeline Stage" tool to the bottom of the Overview page: four clickable columns (Very Warm, Contract out, Closed Won, Churned (still active)) each showing a revenue total that expands to its deals.

**Architecture:** A pure bucketing function (`bucketPipelineStages`) sorts synced HubSpot deals into four ordered stage columns as a current-time snapshot; a thin `getPipelineStageSnapshot()` wrapper runs the DB query and calls it. A client component (`pipeline-stage-tool.tsx`), modeled on the existing `michael-tiles.tsx` drill-down, renders the columns and their expandable deal lists. The Overview server page fetches the snapshot and renders the component last.

**Tech Stack:** Next.js (App Router, RSC), Prisma, React, TypeScript, Tailwind, `tsx` for the verification script.

## Global Constraints

- Columns key **only** off the raw HubSpot `stageLabel` — never the mapped `stage` or `churnDate`. The four columns, in order, are:
  1. **Very Warm** → `stageLabel === "Very Warm"`
  2. **Contract out** → `stageLabel === "Contract out"`
  3. **Closed Won** → `stageLabel === "Closed Won"`
  4. **Churned (still active)** → `stageLabel === "Churned but still active"` OR `stageLabel === "Current (Not Paying)"`
- Columns are **mutually exclusive** (each deal has one `stageLabel`). The plain `"Churned"` stage (fully-lost deals) is intentionally **excluded** from every column.
- Value basis per deal (all columns ex-GST, so totals reconcile with the ex-GST revenue tile): `amountExGst ?? (amount / 1.1)`, rounded. Very Warm / Contract out store no ex-GST value, so their inc-GST `amount` has the 10% GST removed via `/ 1.1` — the same fallback used in `src/lib/analytics/michael-sales.ts`.
- Exclude excluded clients using the shared `getExcludedClientIds()` set (`src/lib/analytics/excluded-clients.ts`) — skip any deal whose `clientId` is in the set.
- No test framework exists in this repo; verification uses a standalone `tsx` assertion script under `scripts/`, matching the repo's `scripts/check-*.ts` convention.
- Follow existing code idioms: 2-space indent, semicolons, `formatCurrency` from `@/lib/utils`.

---

### Task 1: Pipeline-stage bucketing logic + data function

**Files:**
- Create: `src/lib/analytics/pipeline-stages.ts`
- Create (test): `scripts/check-pipeline-stages.ts`

**Interfaces:**
- Consumes: `getExcludedClientIds()` from `./excluded-clients` (returns `Promise<Set<string>>`); `db` from `@/lib/db`.
- Produces:
  - `interface PipelineDeal { name: string; amount: number }`
  - `interface PipelineStageColumn { stage: string; total: number; deals: PipelineDeal[] }`
  - `type PipelineDealInput = { name: string; clientId: string | null; stageLabel: string | null; amount: number | null; amountExGst: number | null }`
  - `function bucketPipelineStages(deals: PipelineDealInput[], excludedIds: Set<string>, now: Date): PipelineStageColumn[]` — pure; buckets on `stageLabel`; returns exactly 4 columns in order `["Very Warm", "Contract out", "Closed Won", "Churned (still active)"]`. `now` is accepted for a stable snapshot signature but not used in bucketing.
  - `async function getPipelineStageSnapshot(): Promise<PipelineStageColumn[]>` — DB query + `bucketPipelineStages`.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-pipeline-stages.ts`:

```typescript
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
```

Note: import via the `@/` path alias (works under `tsx` in this repo — see `scripts/check-*.ts`). The pure function has no DB import at module load, so no env is needed to run this script.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/check-pipeline-stages.ts`
Expected: FAIL — module `@/lib/analytics/pipeline-stages` not found (cannot import `bucketPipelineStages`).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/analytics/pipeline-stages.ts`:

Note: this module has **no top-level imports** — both `db` and
`getExcludedClientIds` are imported lazily inside `getPipelineStageSnapshot`.
That keeps the module import-safe for the pure-function test: `excluded-clients.ts`
imports `db` at its top, so a top-level import of it would drag Prisma
initialization into the test at module-load time.

```typescript
export interface PipelineDeal {
  name: string;
  amount: number;
}

export interface PipelineStageColumn {
  stage: string;
  total: number;
  deals: PipelineDeal[];
}

export type PipelineDealInput = {
  name: string;
  clientId: string | null;
  stageLabel: string | null;
  amount: number | null;
  amountExGst: number | null;
};

// The raw HubSpot stage labels each column collects. The two "Churned but still
// active" / "Current (Not Paying)" labels merge into one "Churned (still active)" column; the
// plain "Churned" label (fully-lost deals) is intentionally not listed.
const CHURNED_LABELS = ["Churned but still active", "Current (Not Paying)"];
const QUERY_LABELS = ["Very Warm", "Contract out", "Closed Won", ...CHURNED_LABELS];

// Every column is reported ex-GST so the totals reconcile with the Overview's
// ex-GST revenue tile. Very Warm / Contract out deals store no ex-GST value, so
// we derive it from the inc-GST `amount` by removing the 10% GST — the same
// `amount / 1.1` fallback used in michael-sales.ts.
const GST_MULTIPLIER = 1.1;
const dealValue = (d: PipelineDealInput): number =>
  Math.round(d.amountExGst ?? (d.amount != null ? d.amount / GST_MULTIPLIER : 0));

/**
 * Buckets synced HubSpot deals into four pipeline-stage columns, keyed purely
 * on the raw `stageLabel`. Columns are mutually exclusive (one label per deal).
 *
 *  - Very Warm    : stageLabel === "Very Warm"
 *  - Contract out : stageLabel === "Contract out"
 *  - Closed Won   : stageLabel === "Closed Won"
 *  - Churned (still active) : stageLabel ∈ {"Churned but still active", "Current (Not Paying)"}
 *
 * `now` is accepted for a stable snapshot signature but is not used here — the
 * columns no longer depend on any date.
 */
export function bucketPipelineStages(
  deals: PipelineDealInput[],
  excludedIds: Set<string>,
  now: Date
): PipelineStageColumn[] {
  void now;
  const columns: PipelineStageColumn[] = [
    { stage: "Very Warm", total: 0, deals: [] },
    { stage: "Contract out", total: 0, deals: [] },
    { stage: "Closed Won", total: 0, deals: [] },
    { stage: "Churned (still active)", total: 0, deals: [] },
  ];
  const [veryWarm, contractOut, closedWon, churned] = columns;

  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const amount = dealValue(d);

    if (d.stageLabel === "Very Warm") {
      veryWarm.deals.push({ name: d.name, amount });
    } else if (d.stageLabel === "Contract out") {
      contractOut.deals.push({ name: d.name, amount });
    } else if (d.stageLabel === "Closed Won") {
      closedWon.deals.push({ name: d.name, amount });
    } else if (d.stageLabel && CHURNED_LABELS.includes(d.stageLabel)) {
      churned.deals.push({ name: d.name, amount });
    }
  }

  for (const col of columns) {
    col.deals.sort((a, b) => b.amount - a.amount);
    col.total = col.deals.reduce((s, d) => s + d.amount, 0);
  }
  return columns;
}

/**
 * Current snapshot of revenue by pipeline stage for the Overview page.
 */
export async function getPipelineStageSnapshot(): Promise<PipelineStageColumn[]> {
  // `db` and `getExcludedClientIds` are imported lazily so that importing this
  // module for the pure `bucketPipelineStages` function (e.g. from the tsx test
  // script) does not trigger Prisma client initialization, which needs
  // DATABASE_URL at load. (`excluded-clients` imports `db` at its top.)
  const [{ db }, { getExcludedClientIds }] = await Promise.all([
    import("@/lib/db"),
    import("./excluded-clients"),
  ]);
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { stageLabel: { in: QUERY_LABELS } },
      select: {
        name: true,
        clientId: true,
        stageLabel: true,
        amount: true,
        amountExGst: true,
      },
    }),
  ]);

  return bucketPipelineStages(deals, excludedIds, new Date());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/check-pipeline-stages.ts`
Expected: PASS — "All pipeline-stage bucketing assertions passed." and exit code 0.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/lib/analytics/pipeline-stages.ts` or `scripts/check-pipeline-stages.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/pipeline-stages.ts scripts/check-pipeline-stages.ts
git commit -m "Add pipeline-stage revenue snapshot analytics"
```

---

### Task 2: PipelineStageTool client component

**Files:**
- Create: `src/components/dashboard/pipeline-stage-tool.tsx`

**Interfaces:**
- Consumes: `PipelineStageColumn` from `@/lib/analytics/pipeline-stages`; `formatCurrency` from `@/lib/utils`; `Card`, `CardContent`, `CardHeader`, `CardTitle` from `@/components/ui/card`; `StatCard` from `@/components/charts/stat-card`.
- Produces: `function PipelineStageTool({ stages }: { stages: PipelineStageColumn[] })` (named export).

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/pipeline-stage-tool.tsx`:

```typescript
"use client";

import { useState } from "react";
import { StatCard } from "@/components/charts/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PipelineStageColumn } from "@/lib/analytics/pipeline-stages";

export function PipelineStageTool({ stages }: { stages: PipelineStageColumn[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const active = stages.find((s) => s.stage === selected) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue by Pipeline Stage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stages.map((s) => (
            <button
              key={s.stage}
              type="button"
              onClick={() => setSelected((prev) => (prev === s.stage ? null : s.stage))}
              className={`text-left rounded-lg transition ${selected === s.stage ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"}`}
            >
              <StatCard
                title={s.stage}
                value={formatCurrency(s.total)}
                description={`${s.deals.length} deal${s.deals.length !== 1 ? "s" : ""}`}
              />
            </button>
          ))}
        </div>

        {active && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                {active.stage} — {active.deals.length} deal{active.deals.length !== 1 ? "s" : ""}
              </h4>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            {active.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals.</p>
            ) : (
              <div className="space-y-1">
                {active.deals.map((d, i) => (
                  <div
                    key={`${d.name}-${i}`}
                    className="flex items-center justify-between text-sm border-b py-1 last:border-0"
                  >
                    <span className="truncate mr-2">{d.name}</span>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(d.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm font-semibold border-t pt-1 mt-2">
                  <span>Total</span>
                  <span>{formatCurrency(active.deals.reduce((s, d) => s + d.amount, 0))}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/components/dashboard/pipeline-stage-tool.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/pipeline-stage-tool.tsx
git commit -m "Add PipelineStageTool drill-down component"
```

---

### Task 3: Wire the tool into the Overview page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `getPipelineStageSnapshot` from `@/lib/analytics/pipeline-stages`; `PipelineStageTool` from `@/components/dashboard/pipeline-stage-tool`.

- [ ] **Step 1: Add the import**

In `src/app/(dashboard)/page.tsx`, alongside the other analytics imports (near line 5, next to `getActiveRevenueSnapshot`):

```typescript
import { getPipelineStageSnapshot } from "@/lib/analytics/pipeline-stages";
```

And with the component imports (near line 16):

```typescript
import { PipelineStageTool } from "@/components/dashboard/pipeline-stage-tool";
```

- [ ] **Step 2: Fetch the snapshot in the existing `Promise.all`**

Add `getPipelineStageSnapshot()` as the final entry of the `Promise.all` array (currently ends with `getPackageRevenueByMonth(lastYearMonthKey)`) and destructure it as `pipelineStages`:

```typescript
  const [clientCount, recentImports, revenue, revenueVsChurn, activeSnapshot, forecast, budgetVsActual, ytdXero, lastYearPackages, pipelineStages] = await Promise.all([
    db.client.count({ where: { status: "active", OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }] } }),
    db.dataImport.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    getRevenueOverview(months),
    getRevenueVsChurn(12),
    getActiveRevenueSnapshot(),
    getRevenueForecast(6),
    getBudgetVsActual(),
    getYtdXeroRevenue(),
    getPackageRevenueByMonth(lastYearMonthKey),
    getPipelineStageSnapshot(),
  ]);
```

- [ ] **Step 3: Render the tool as the last section**

Immediately before the final closing `</div>` of the returned JSX (after the At-Risk Clients / Recent Imports `<div className="grid grid-cols-1 lg:grid-cols-2 gap-4"> … </div>` block that ends near line 198):

```tsx
      <PipelineStageTool stages={pipelineStages} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Build/lint check**

Run: `npm run lint`
Expected: no new lint errors in the three touched files.

- [ ] **Step 6: Manual verification**

Run the dev server (`npm run dev`), open the Overview page, scroll to the bottom. Confirm:
- A "Revenue by Pipeline Stage" card with four stat tiles: Very Warm, Contract out, Closed Won, Churned, each showing a currency total and deal count.
- Clicking a tile expands a deal list (name + amount, sorted high→low) with a Total row matching the tile value; clicking again or "Close" collapses it.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(dashboard)/page.tsx"
git commit -m "Render pipeline-stage tool at the bottom of the Overview page"
```

---

## Self-Review Notes

- **Spec coverage:** all four columns key off `stageLabel` → Task 1 `bucketPipelineStages` + assertions on column order and membership; The "Churned (still active)" column merges "Churned but still active" + "Current (Not Paying)" and drops plain "Churned" → Task 1 + "Dead I" assertion; value basis `amountExGst ?? amount` with amount fallback → `dealValue` + "Warm A" assertion; exclusion → lazy `getExcludedClientIds` + "Excluded F" assertion; clickable drill-down with Total → Task 2; bottom-of-page placement → Task 3 Step 3; snapshot-not-picker-dependent → `getPipelineStageSnapshot` ignores `months`.
- **Placeholder scan:** none — all steps contain full code/commands.
- **Type consistency:** `PipelineStageColumn` / `PipelineDeal` / `PipelineDealInput` / `bucketPipelineStages` / `getPipelineStageSnapshot` names identical across Tasks 1–3. `PipelineDealInput` fields (`name`, `clientId`, `stageLabel`, `amount`, `amountExGst`) match the `select` in `getPipelineStageSnapshot`.
- **Mutually-exclusive columns:** each deal has one `stageLabel`, so the `else if` chain assigns it to at most one column; totals are additive across columns.
