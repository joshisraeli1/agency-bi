# Overview Pipeline-Stage Revenue Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Revenue by Pipeline Stage" tool to the bottom of the Overview page: four clickable columns (Very Warm, Contract out, Closed Won, Churned) each showing a revenue total that expands to its deals.

**Architecture:** A pure bucketing function (`bucketPipelineStages`) sorts synced HubSpot deals into four ordered stage columns as a current-time snapshot; a thin `getPipelineStageSnapshot()` wrapper runs the DB query and calls it. A client component (`pipeline-stage-tool.tsx`), modeled on the existing `michael-tiles.tsx` drill-down, renders the columns and their expandable deal lists. The Overview server page fetches the snapshot and renders the component last.

**Tech Stack:** Next.js (App Router, RSC), Prisma, React, TypeScript, Tailwind, `tsx` for the verification script.

## Global Constraints

- Value basis per deal: `amountExGst ?? amount ?? 0`, matching `src/lib/analytics/michael-sales.ts` pipeline snapshot.
- Snapshot is evaluated **as of today** (`new Date()` passed in) — no future-dating, no dependence on the Overview month picker.
- Exclude excluded clients using the shared `getExcludedClientIds()` set (`src/lib/analytics/excluded-clients.ts`) — skip any deal whose `clientId` is in the set.
- No test framework exists in this repo; verification uses a standalone `tsx` assertion script under `scripts/`, matching the repo's `scripts/check-*.ts` convention.
- Follow existing code idioms: 2-space indent, no semicolon-free style (repo uses semicolons), `formatCurrency` from `@/lib/utils`.

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
  - `type PipelineDealInput = { name: string; clientId: string | null; stage: string | null; stageLabel: string | null; amount: number | null; amountExGst: number | null; churnDate: Date | null }`
  - `function bucketPipelineStages(deals: PipelineDealInput[], excludedIds: Set<string>, now: Date): PipelineStageColumn[]` — pure; returns exactly 4 columns in order `["Very Warm", "Contract out", "Closed Won", "Churned"]`.
  - `async function getPipelineStageSnapshot(): Promise<PipelineStageColumn[]>` — DB query + `bucketPipelineStages`.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-pipeline-stages.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/check-pipeline-stages.ts`
Expected: FAIL — module `../src/lib/analytics/pipeline-stages` not found (cannot import `bucketPipelineStages`).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/analytics/pipeline-stages.ts`:

```typescript
import { db } from "@/lib/db";
import { getExcludedClientIds } from "./excluded-clients";

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
  stage: string | null;
  stageLabel: string | null;
  amount: number | null;
  amountExGst: number | null;
  churnDate: Date | null;
};

const dealValue = (d: PipelineDealInput): number =>
  Math.round(d.amountExGst ?? d.amount ?? 0);

/**
 * Buckets synced HubSpot deals into four pipeline-stage columns as a snapshot
 * "as of now". Columns are NOT mutually exclusive: a closed-won deal with a
 * past churn date appears in BOTH "Closed Won" (the full book) and "Churned"
 * (the breakout of deals that have actually churned).
 *
 *  - Very Warm    : stageLabel === "Very Warm"
 *  - Contract out : stageLabel === "Contract out"
 *  - Closed Won   : stage === "closed_won" (any churn state)
 *  - Churned      : churnDate set and on/before `now`
 */
export function bucketPipelineStages(
  deals: PipelineDealInput[],
  excludedIds: Set<string>,
  now: Date
): PipelineStageColumn[] {
  const columns: PipelineStageColumn[] = [
    { stage: "Very Warm", total: 0, deals: [] },
    { stage: "Contract out", total: 0, deals: [] },
    { stage: "Closed Won", total: 0, deals: [] },
    { stage: "Churned", total: 0, deals: [] },
  ];
  const [veryWarm, contractOut, closedWon, churned] = columns;

  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const amount = dealValue(d);

    if (d.stageLabel === "Very Warm") {
      veryWarm.deals.push({ name: d.name, amount });
    }
    if (d.stageLabel === "Contract out") {
      contractOut.deals.push({ name: d.name, amount });
    }
    if (d.stage === "closed_won") {
      closedWon.deals.push({ name: d.name, amount });
    }
    if (d.churnDate && d.churnDate <= now) {
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
 * Current-time snapshot of revenue by pipeline stage for the Overview page.
 */
export async function getPipelineStageSnapshot(): Promise<PipelineStageColumn[]> {
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: {
        OR: [
          { stageLabel: "Very Warm" },
          { stageLabel: "Contract out" },
          { stage: "closed_won" },
          { churnDate: { not: null } },
        ],
      },
      select: {
        name: true,
        clientId: true,
        stage: true,
        stageLabel: true,
        amount: true,
        amountExGst: true,
        churnDate: true,
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

- **Spec coverage:** Very Warm / Contract out (stageLabel) → Task 1 buckets + test; Closed Won full book incl. churn → Task 1 + assertion "Closed Won = full book"; Churned as past-dated churn breakout → Task 1 + assertion; value basis `amountExGst ?? amount` → `dealValue` + fallback assertion; exclusion → `getExcludedClientIds` + excluded-client assertion; clickable drill-down with Total → Task 2; bottom-of-page placement → Task 3 Step 3; snapshot-not-picker-dependent → `getPipelineStageSnapshot` ignores `months`.
- **Placeholder scan:** none — all steps contain full code/commands.
- **Type consistency:** `PipelineStageColumn` / `PipelineDeal` / `PipelineDealInput` / `bucketPipelineStages` / `getPipelineStageSnapshot` names identical across Tasks 1–3.
- **Note on Churned overlap:** intended and asserted — a past-churn closed-won deal is counted in both Closed Won and Churned. Column totals therefore are not additive across columns; this matches the approved spec ("Churned is a breakout, not a mutually-exclusive funnel stage").
