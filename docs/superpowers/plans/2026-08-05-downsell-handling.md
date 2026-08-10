# Downsell Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a client downgrades — the old HubSpot deal churned, a replacement deal created at a lower amount — report it as one continuous deal whose only effect is the net contraction in churn, never as a churned client plus new business.

**Architecture:** A new `src/lib/analytics/downsells.ts` is the single source of truth, mirroring how `upsells.ts` already works. A pure `pairDownsells(deals)` matches each downsell to the deal it replaces and returns a `DownsellResolution` — id sets, handover months, inherited client ids, per-month contractions, and held-out unpaired downsells. A React-`cache()`d `getDownsellResolution()` loads it once per render, and every deal-enumerating surface consults it rather than re-deriving the rule.

**Tech Stack:** Next.js 16 (App Router, server components), Prisma 7 on Supabase Postgres, TypeScript, recharts, tsx for scripts.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-downsell-handling-design.md`. Read it before starting.
- **ex-GST convention:** `d.amountExGst ?? (d.amount != null ? d.amount / 1.1 : 0)`. Never apply a flat GST multiplier to a total.
- **No test runner in this project.** Verification is `scripts/check-*.ts` assertion scripts run with `npx tsx --env-file=.env.local scripts/<name>.ts`, following `scripts/check-forecast-3month.ts`.
- **`npx tsc --noEmit` must pass before every commit.** A recharts `onClick` type error was once pushed and broke the Vercel build.
- **Schema changes use `npx prisma db push`, never `migrate dev`** — this project's Prisma migration history is locked to SQLite (legacy).
- **Local `.env.local` and Vercel prod share the same Supabase database.** A `db push` here changes prod's schema too.
- **Upsell behaviour must not change.** `foldUpsells` keeps its current semantics, including its name-based fallback. Upsells continue to count as new revenue in time-series charts.
- **Downsell identification:** `Package Description = Downsell` is the signal; the name match is only a fallback safety net for untagged deals.
- **Reconciliation is out of scope** — it matches individual deals to Xero invoices and must keep reading raw deals.

## Reference data — the three live pairs

All three predecessors carry `reasons_for_churn = Downsell` and `churn_date = 2026-08-01`; all three successors are closed-won with `start_date = 2026-08-01`.

| Pair | Predecessor id / ex-GST | Successor id / ex-GST | Contraction |
|---|---|---|---|
| Hello Fresh NZ | `59153676324` / $9,000 | `63433823302` / $6,750 | $2,250 |
| Hello Fresh AU | `56116135556` / $13,500 | `63433698333` / $10,500 | $3,000 |
| YouFoodz | `58208775747` / $17,750 | `63436346972` / $12,000 | $5,750 |
| **Total** | **$40,250** | **$29,250** | **$11,000** |

August 2026 acceptance target for *New Revenue vs Churn*: **new $65,800** (currently $95,050), **churned $75,650** (currently $104,900).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/analytics/downsells.ts` | **New.** Identification, pairing, resolution. Pure `pairDownsells` + DB loader. The only place the downsell rule lives. |
| `src/lib/analytics/upsells.ts` | Export `companyRoot` and `normalize` so downsells reuse the proven company-matching logic instead of duplicating it. No behaviour change. |
| `prisma/schema.prisma` | Add `HubspotDeal.churnReason`. |
| `src/lib/sync/refresh-syncs.ts` | Fetch and map `reasons_for_churn`. |
| `src/lib/analytics/revenue-overview.ts` | MRR windows use handover months; New-vs-Churn books contraction only. |
| `src/lib/analytics/active-revenue.ts` | Snapshot, package-by-month, composition. |
| `src/lib/analytics/agency-kpis.ts` | Division deal counts and averages. |
| `src/lib/analytics/avg-deal-size-comparison.ts` | Active-deal windows. |
| `src/lib/analytics/advanced-analytics.ts` | LTV/tenure lifecycle, new-client deal size. |
| `src/lib/analytics/michael-sales.ts` | Deals created, new revenue, commission. |
| `src/lib/analytics/forecast-3month.ts` | Exclude downsells from pipeline. |
| `src/app/(dashboard)/clients/page.tsx` | Client retainer and LTV. |
| `src/components/dashboard/downsells-attention-card.tsx` | **New.** Held-out downsells card. |
| `src/app/(dashboard)/page.tsx` | Mount the card. |
| `scripts/check-downsells.ts` | **New.** Pure-function assertions over fixtures. |
| `scripts/check-downsells-live.ts` | **New.** Assertions against the real database. |

---

### Task 1: Sync the churn reason

Pairing's strongest signal is `reasons_for_churn`, which is not currently fetched or stored. Nothing else can be built until it is.

**Files:**
- Modify: `prisma/schema.prisma` (model `HubspotDeal`)
- Modify: `src/lib/sync/refresh-syncs.ts:90-93` (properties array), `src/lib/sync/refresh-syncs.ts:128` (row mapping)
- Create: `scripts/check-churn-reason.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `HubspotDeal.churnReason: string | null`, populated from HubSpot's `reasons_for_churn`

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, in `model HubspotDeal`, directly after the `churnDate` line:

```prisma
  churnDate          DateTime?
  churnReason        String? // HubSpot "Reasons for Churn" — Price|Results|Going In-house|Downsell|...
```

- [ ] **Step 2: Push the schema and regenerate the client**

```bash
cd ~/agency-bi
npx prisma db push
npx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema." This alters the shared Supabase database, which prod also uses — an added nullable column is backward compatible, so prod keeps working on the old code.

- [ ] **Step 3: Fetch the property in the sync**

In `src/lib/sync/refresh-syncs.ts`, add `"reasons_for_churn"` to the `properties` array (currently ends `"content_package_type", "package_description", "commission_type", "industry_type",`):

```ts
  const properties = [
    "dealname", "amount", "amount__excl_gst_", "dealstage", "pipeline",
    "createdate", "closedate", "start_date", "churn_date", "hubspot_owner_id",
    "content_package_type", "package_description", "commission_type", "industry_type",
    "reasons_for_churn",
  ];
```

- [ ] **Step 4: Map it onto the row**

In the same file, in the `rows = relevant.map(...)` object literal, directly after the `churnDate: parseDate(p.churn_date),` line:

```ts
      churnDate: parseDate(p.churn_date),
      churnReason: p.reasons_for_churn ?? null,
```

- [ ] **Step 5: Write the verification script**

Create `scripts/check-churn-reason.ts`:

```ts
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
```

- [ ] **Step 6: Run it and watch it fail**

```bash
npx tsx --env-file=.env.local scripts/check-churn-reason.ts
```

Expected: FAIL — `churnReason` is `null` for all three, because the sync has not run since the column was added.

- [ ] **Step 7: Run the sync**

```bash
npx tsx --env-file=.env.local scripts/sync-hubspot-deals.ts
```

Expected: completes in roughly 50 seconds, reporting ~876 deals upserted.

- [ ] **Step 8: Run the check again**

```bash
npx tsx --env-file=.env.local scripts/check-churn-reason.ts
```

Expected: PASS — all three predecessors report `churnReason: "Downsell"` and churn month `2026-08`.

- [ ] **Step 9: Typecheck and commit**

```bash
npx tsc --noEmit
git add prisma/schema.prisma src/lib/sync/refresh-syncs.ts scripts/check-churn-reason.ts
git commit -m "Sync HubSpot churn reason onto HubspotDeal"
```

---

### Task 2: The pairing core

**Files:**
- Modify: `src/lib/analytics/upsells.ts` (export two existing helpers)
- Create: `src/lib/analytics/downsells.ts`
- Create: `scripts/check-downsells.ts`

**Interfaces:**
- Consumes: `companyRoot`, `normalize` from `upsells.ts`; `dealDivision` from `upsells.ts`
- Produces:
  - `isDownsell(d: PairableDeal): boolean`
  - `pairDownsells<T extends PairableDeal>(deals: T[]): DownsellResolution`
  - `windowKeys(d, res): { startKey: string | null; churnKey: string | null }`
  - types `PairableDeal`, `DownsellPair`, `HeldOutDownsell`, `DownsellResolution`

- [ ] **Step 1: Export the two matching helpers from upsells.ts**

In `src/lib/analytics/upsells.ts`, add `export` to the two existing `const` declarations. Do not change their bodies — upsell behaviour must stay identical.

```ts
export const normalize = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
```

```ts
export const companyRoot = (name: string): string => {
```

- [ ] **Step 2: Write the failing assertions**

Create `scripts/check-downsells.ts`. These fixtures mirror the real data plus every edge case in the spec.

```ts
import { isDownsell, pairDownsells, windowKeys, type PairableDeal } from "@/lib/analytics/downsells";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

const deal = (o: Partial<PairableDeal> & { id: string; name: string }): PairableDeal => ({
  clientId: null, stage: "closed_won", amount: null, amountExGst: null,
  startDate: null, closeDate: null, churnDate: null, churnReason: null,
  contentPackageType: "Content Only", packageDescription: null, ...o,
});

// ---------- identification ----------
console.log("identification:");
assert(isDownsell(deal({ id: "1", name: "Anything", packageDescription: "Downsell" })), "tagged Downsell");
assert(isDownsell(deal({ id: "2", name: "Acme Downsell" })), "untagged but named Downsell (fallback)");
assert(isDownsell(deal({ id: "3", name: "Acme Dowsell" })), "Dowsell typo (fallback)");
assert(isDownsell(deal({ id: "4", name: "X", packageDescription: "Upsell;Downsell" })), "multi-valued tag set");
assert(!isDownsell(deal({ id: "5", name: "Acme Upsell", packageDescription: "Upsell" })), "an upsell is not a downsell");
assert(!isDownsell(deal({ id: "6", name: "Acme Content" })), "plain deal is not a downsell");

// ---------- the three real pairs ----------
console.log("\nreal-shaped pairs:");
const real: PairableDeal[] = [
  deal({ id: "P_NZ", name: "Hello Fresh NZ", amountExGst: 9000, startDate: new Date("2026-04-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned", clientId: "c_nz" }),
  deal({ id: "S_NZ", name: "Hello Fresh NZ Downsell", amountExGst: 6750, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
  deal({ id: "P_AU", name: "Hello Fresh AU", amountExGst: 13500, startDate: new Date("2026-04-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned", clientId: "c_au" }),
  deal({ id: "S_AU", name: "Hello Fresh AU Dowsell", amountExGst: 10500, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
  deal({ id: "P_YF", name: "YouFoodz", amountExGst: 17750, startDate: new Date("2026-04-20"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned", clientId: "c_yf" }),
  deal({ id: "S_YF", name: "Youfoodz Downsell", amountExGst: 12000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
];
const r = pairDownsells(real);
assert(r.pairs.length === 3, `3 pairs (got ${r.pairs.length})`);
assert(r.heldOut.length === 0, `nothing held out (got ${r.heldOut.length})`);
const nz = r.pairs.find((p) => p.successorId === "S_NZ");
assert(nz?.predecessorId === "P_NZ", "NZ successor pairs to NZ predecessor");
assert(nz?.contractionExGst === 2250, `NZ contraction 2250 (got ${nz?.contractionExGst})`);
assert(nz?.handoverMonth === "2026-08", "NZ handover 2026-08");
assert(nz?.clientId === "c_nz", "NZ successor inherits predecessor clientId");
const au = r.pairs.find((p) => p.successorId === "S_AU");
assert(au?.predecessorId === "P_AU", "AU (typo name) pairs to AU predecessor");
assert(au?.contractionExGst === 3000, `AU contraction 3000 (got ${au?.contractionExGst})`);
const yf = r.pairs.find((p) => p.successorId === "S_YF");
assert(yf?.contractionExGst === 5750, `YouFoodz contraction 5750 (got ${yf?.contractionExGst})`);
assert(r.pairs.reduce((s, p) => s + p.contractionExGst, 0) === 11000, "total contraction 11000");

// NZ/AU must never cross-pair
assert(r.pairs.every((p) => p.predecessorName.includes("NZ") === p.successorName.includes("NZ")), "NZ and AU do not cross-pair");

// ---------- lookup surfaces ----------
console.log("\nresolution lookups:");
assert(r.successorIds.has("S_NZ") && !r.successorIds.has("P_NZ"), "successorIds holds successors only");
assert(r.predecessorIds.has("P_NZ") && !r.predecessorIds.has("S_NZ"), "predecessorIds holds predecessors only");
assert(r.contractionsByMonth.get("2026-08")?.length === 3, "3 contractions in 2026-08");
assert(windowKeys(real[1], r).startKey === "2026-08", "successor window starts at handover");
assert(windowKeys(real[0], r).churnKey === "2026-08", "predecessor window ends at handover");
assert(windowKeys(real[0], r).startKey === "2026-04", "predecessor start unchanged");

// ---------- confirming signals ----------
console.log("\nconfirming signals:");
const dateOnly = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(dateOnly.pairs.length === 1, "pairs on aligned dates with no churn reason");

const reasonOnly = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-02-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(reasonOnly.pairs.length === 1, "pairs on churn reason with loose dates");

const neither = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-02-01"), stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(neither.pairs.length === 0 && neither.heldOut.length === 1, "no confirming signal → held out");
assert(neither.heldOutIds.has("S"), "held-out id exposed");

const noPred = pairDownsells([
  deal({ id: "S", name: "Nobody Downsell", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(noPred.heldOut.length === 1 && /no predecessor/i.test(noPred.heldOut[0].reason), "no predecessor → held out with reason");

const noChurnDate = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), stage: "closed_won" }),
  deal({ id: "S", name: "Acme", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(noChurnDate.heldOut.length === 1, "predecessor never churned → held out");

// ---------- chains and expansion ----------
console.log("\nchains and expansion:");
const chain = pairDownsells([
  deal({ id: "A", name: "Acme", amountExGst: 10000, startDate: new Date("2025-01-01"), churnDate: new Date("2026-01-01"), churnReason: "Downsell", stage: "churned", clientId: "c" }),
  deal({ id: "B", name: "Acme Downsell", amountExGst: 8000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-06-01"), churnReason: "Downsell", stage: "churned", packageDescription: "Downsell" }),
  deal({ id: "C", name: "Acme Downsell", amountExGst: 6000, startDate: new Date("2026-06-01"), packageDescription: "Downsell" }),
]);
assert(chain.pairs.length === 2, `chained downsell makes 2 pairs (got ${chain.pairs.length})`);
assert(chain.lifecycleStartByDeal.get("C")?.getFullYear() === 2025, "lifecycle of the last link walks back to 2025");
assert(chain.inheritedClientId.get("C") === "c", "clientId propagates along the chain");

const expansion = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 4000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S", name: "Acme", amountExGst: 5000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(expansion.pairs[0].contractionExGst === -1000, "larger replacement gives negative contraction (expansion)");

// ---------- not yet won ----------
console.log("\nnot yet won:");
const pending = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 5000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S", name: "Acme Downsell", amountExGst: 4000, startDate: new Date("2026-08-01"), packageDescription: "Downsell", stage: "negotiation" }),
]);
assert(pending.pairs.length === 0, "a downsell that is not yet won does not supersede");
assert(pending.pendingIds.has("S"), "it is marked pending");
assert(pending.heldOut.length === 0, "and is NOT flagged as needing attention");

// ---------- a predecessor is claimed once ----------
const twoDownsells = pairDownsells([
  deal({ id: "P", name: "Acme", amountExGst: 9000, startDate: new Date("2026-01-01"), churnDate: new Date("2026-08-01"), churnReason: "Downsell", stage: "churned" }),
  deal({ id: "S1", name: "Acme Downsell", amountExGst: 6000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
  deal({ id: "S2", name: "Acme Downsell", amountExGst: 5000, startDate: new Date("2026-08-01"), packageDescription: "Downsell" }),
]);
assert(twoDownsells.pairs.length === 1 && twoDownsells.heldOut.length === 1, "one predecessor is claimed by only one downsell");

console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx tsx scripts/check-downsells.ts
```

Expected: FAIL — `Cannot find module '@/lib/analytics/downsells'`.

- [ ] **Step 4: Write the module**

Create `src/lib/analytics/downsells.ts`:

```ts
/**
 * Downsell pairing.
 *
 * A downsell is a package downgrade recorded in HubSpot as TWO deals: the
 * superseded deal is churned (Churn Date = handover, Reasons for Churn =
 * "Downsell") and a replacement deal is created at the lower amount with
 * Package Description = "Downsell" and Start Date = the same handover.
 *
 * Left alone, every surface reads that as a churned client plus a new client.
 * This module pairs the two and treats them as ONE continuous deal: only the
 * net contraction books as churn, nothing books as new revenue, the deal count
 * stays flat, and the client's tenure runs unbroken from the original start.
 *
 * "Package Description = Downsell" is the signal; the deal NAME is only used
 * afterwards to work out which company the deal belongs to. A name fallback
 * exists for untagged deals, mirroring `isUpsell`.
 *
 * This is the single source of truth — every analytics surface that enumerates
 * deals consults the resolution rather than re-deriving the rule.
 * Reconciliation does NOT (it matches individual deals to Xero invoices).
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { companyRoot, normalize, dealDivision } from "./upsells";

export interface PairableDeal {
  id: string;
  name: string;
  clientId?: string | null;
  stage?: string | null;
  amount?: number | null;
  amountExGst?: number | null;
  startDate?: Date | null;
  closeDate?: Date | null;
  churnDate?: Date | null;
  churnReason?: string | null;
  contentPackageType?: string | null;
  packageDescription?: string | null;
}

export interface DownsellPair {
  predecessorId: string;
  predecessorName: string;
  successorId: string;
  successorName: string;
  clientId: string | null;
  handoverMonth: string; // yyyy-MM
  predecessorExGst: number;
  successorExGst: number;
  /** predecessor − successor. Positive = contraction, negative = expansion. */
  contractionExGst: number;
}

export interface HeldOutDownsell {
  id: string;
  name: string;
  amountExGst: number;
  reason: string;
}

export interface DownsellResolution {
  pairs: DownsellPair[];
  successorIds: Set<string>;
  predecessorIds: Set<string>;
  /** Unpaired downsells — excluded from every revenue, count and pipeline surface. */
  heldOutIds: Set<string>;
  heldOut: HeldOutDownsell[];
  /**
   * Downsells not yet won (no closed-won stage, no churn date). A scheduled
   * reduction, not incoming revenue: excluded from pipeline and forecast, but
   * NOT held out and NOT flagged — the predecessor simply keeps running at its
   * full amount until the replacement is won.
   */
  pendingIds: Set<string>;
  /** successorId → handover month, used as its effective start. */
  handoverStart: Map<string, string>;
  /** predecessorId → handover month, used as its effective churn. */
  handoverChurn: Map<string, string>;
  /** successorId → the clientId it inherits from its predecessor. */
  inheritedClientId: Map<string, string>;
  /** any pair member → the earliest start in its chain. */
  lifecycleStartByDeal: Map<string, Date>;
  contractionsByMonth: Map<string, DownsellPair[]>;
}

const monthKey = (d: Date | null | undefined): string | null =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

const monthIdx = (k: string): number => {
  const [y, m] = k.split("-").map(Number);
  return y * 12 + (m - 1);
};

export const dealExGst = (d: PairableDeal): number =>
  d.amountExGst ?? (d.amount != null ? d.amount / 1.1 : 0);

/**
 * Identify a downsell. The Package Description tag is the signal; the name is
 * a fallback for deals that were never tagged (including the "Dowsell" typo).
 */
export function isDownsell(d: PairableDeal): boolean {
  const tags = (d.packageDescription ?? "").toLowerCase().split(/[;,/]/).map((s) => s.trim());
  if (tags.includes("downsell")) return true;
  return /\b(down-?sells?|dowsells?)\b/i.test(d.name ?? "");
}

/** Strip the downsell token so `companyRoot` sees just the company + qualifiers. */
const stripDownsell = (name: string): string =>
  name.replace(/down-?sells?|dowsells?/gi, " ").replace(/\s+/g, " ").trim();

const rootOf = (name: string, isDown: boolean): string =>
  normalize(companyRoot(isDown ? stripDownsell(name) : name));

/**
 * Pair each downsell with the deal it replaces.
 *
 * Required: a company-root name match against a deal that is closed-won or
 * churned and started in an EARLIER month (which also prevents self-matching
 * and cycles in a downsell-of-a-downsell chain).
 *
 * Confirming, at least one: the candidate's churn reason is "Downsell", or its
 * churn month is within one month of the downsell's start month. Requiring the
 * name match but only ONE confirming signal means pairing works on dates alone
 * today and tightens by itself as churn reasons get populated.
 *
 * Ranking: churn-reason match, then closest churn date, then same division,
 * then largest amount. A predecessor can only be claimed once.
 */
export function pairDownsells(deals: PairableDeal[]): DownsellResolution {
  const pairs: DownsellPair[] = [];
  const heldOut: HeldOutDownsell[] = [];
  const pendingIds = new Set<string>();
  const claimed = new Set<string>();

  // A deal counts as won if it is closed-won, or has since churned (it was won
  // once and later ended — which is how the middle link of a chain looks).
  const isWon = (d: PairableDeal) => d.stage === "closed_won" || d.churnDate != null;

  // Earliest-starting downsells resolve first, so a chain links up in order.
  const downsells = deals
    .filter(isDownsell)
    .sort((a, b) => (monthKey(a.startDate ?? a.closeDate) ?? "").localeCompare(monthKey(b.startDate ?? b.closeDate) ?? ""));

  for (const s of downsells) {
    // Not won yet: the predecessor keeps running at full amount and this deal
    // is neither pipeline nor revenue. Nothing to pair, nothing to flag.
    if (!isWon(s)) { pendingIds.add(s.id); continue; }

    const startKey = monthKey(s.startDate ?? s.closeDate);
    const hold = (reason: string) =>
      heldOut.push({ id: s.id, name: s.name, amountExGst: Math.round(dealExGst(s)), reason });

    if (!startKey) { hold("no start date on the downsell deal"); continue; }

    const root = rootOf(s.name, true);
    if (root.length < 3) { hold("deal name too short to identify the company"); continue; }

    const candidates = deals.filter((c) => {
      if (c.id === s.id || claimed.has(c.id)) return false;
      if (c.stage !== "closed_won" && !c.churnDate) return false;
      const cStart = monthKey(c.startDate ?? c.closeDate);
      if (!cStart || cStart >= startKey) return false; // must precede the downsell
      const cRoot = rootOf(c.name, isDownsell(c));
      if (cRoot.length < 3) return false;
      return root.startsWith(cRoot) || cRoot.startsWith(root);
    });

    if (candidates.length === 0) { hold("no predecessor deal found for this company"); continue; }

    const scored = candidates
      .map((c) => {
        const reasonMatch = (c.churnReason ?? "").toLowerCase().includes("downsell");
        const cChurn = monthKey(c.churnDate);
        const distance = cChurn ? Math.abs(monthIdx(cChurn) - monthIdx(startKey)) : Infinity;
        return { c, reasonMatch, distance, sameDivision: dealDivision(c.contentPackageType) === dealDivision(s.contentPackageType) };
      })
      .filter((x) => x.reasonMatch || x.distance <= 1);

    if (scored.length === 0) {
      hold("predecessor found, but it has no churn reason of \"Downsell\" and no churn date within a month of this deal's start");
      continue;
    }

    scored.sort(
      (a, b) =>
        Number(b.reasonMatch) - Number(a.reasonMatch) ||
        a.distance - b.distance ||
        Number(b.sameDivision) - Number(a.sameDivision) ||
        dealExGst(b.c) - dealExGst(a.c)
    );

    const p = scored[0].c;
    claimed.add(p.id);
    const predecessorExGst = dealExGst(p);
    const successorExGst = dealExGst(s);
    pairs.push({
      predecessorId: p.id,
      predecessorName: p.name,
      successorId: s.id,
      successorName: s.name,
      clientId: p.clientId ?? null,
      handoverMonth: startKey,
      predecessorExGst: Math.round(predecessorExGst),
      successorExGst: Math.round(successorExGst),
      contractionExGst: Math.round(predecessorExGst - successorExGst),
    });
  }

  const successorIds = new Set(pairs.map((p) => p.successorId));
  const predecessorIds = new Set(pairs.map((p) => p.predecessorId));
  const heldOutIds = new Set(heldOut.map((h) => h.id));
  const handoverStart = new Map(pairs.map((p) => [p.successorId, p.handoverMonth]));
  const handoverChurn = new Map(pairs.map((p) => [p.predecessorId, p.handoverMonth]));

  // Walk each chain back to its origin for clientId and lifecycle start.
  const predecessorOf = new Map(pairs.map((p) => [p.successorId, p.predecessorId]));
  const byId = new Map(deals.map((d) => [d.id, d]));
  const inheritedClientId = new Map<string, string>();
  const lifecycleStartByDeal = new Map<string, Date>();
  const originOf = (id: string): PairableDeal | undefined => {
    let cur = id;
    const seen = new Set<string>([cur]);
    let prev = predecessorOf.get(cur);
    while (prev && !seen.has(prev)) { cur = prev; seen.add(cur); prev = predecessorOf.get(cur); }
    return byId.get(cur);
  };
  for (const p of pairs) {
    for (const id of [p.successorId, p.predecessorId]) {
      const origin = originOf(id);
      if (!origin) continue;
      const cid = origin.clientId;
      if (cid) inheritedClientId.set(id, cid);
      const start = origin.startDate ?? origin.closeDate;
      if (start) lifecycleStartByDeal.set(id, start);
    }
  }

  const contractionsByMonth = new Map<string, DownsellPair[]>();
  for (const p of pairs) {
    const list = contractionsByMonth.get(p.handoverMonth) ?? [];
    list.push(p);
    contractionsByMonth.set(p.handoverMonth, list);
  }

  return {
    pairs, successorIds, predecessorIds, heldOutIds, heldOut, pendingIds,
    handoverStart, handoverChurn, inheritedClientId, lifecycleStartByDeal, contractionsByMonth,
  };
}

/**
 * Effective active-window month keys for a deal, with the pair's handover month
 * overriding the raw dates. Using the handover for BOTH sides means a few days'
 * mismatch between the predecessor's churn date and the successor's start date
 * can never open a revenue gap or double-count a month.
 */
export function windowKeys(
  d: { id: string; startDate?: Date | null; closeDate?: Date | null; churnDate?: Date | null },
  res: DownsellResolution
): { startKey: string | null; churnKey: string | null } {
  return {
    startKey: res.handoverStart.get(d.id) ?? monthKey(d.startDate ?? d.closeDate),
    churnKey: res.handoverChurn.get(d.id) ?? monthKey(d.churnDate),
  };
}

/** Fields every consumer's Prisma select must include for pairing to work. */
export const DOWNSELL_DEAL_SELECT = {
  id: true, clientId: true, name: true, stage: true, amount: true, amountExGst: true,
  startDate: true, closeDate: true, churnDate: true, churnReason: true,
  contentPackageType: true, packageDescription: true,
} as const;

/** Uncached loader — call this from scripts, where React `cache` has no request scope. */
export async function loadDownsellResolution(): Promise<DownsellResolution> {
  const deals = await db.hubspotDeal.findMany({
    where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
    select: DOWNSELL_DEAL_SELECT,
  });
  return pairDownsells(deals);
}

/** Request-scoped: every surface in one render shares a single query + resolution. */
export const getDownsellResolution = cache(loadDownsellResolution);
```

- [ ] **Step 5: Run the assertions until they pass**

```bash
npx tsx scripts/check-downsells.ts
```

Expected: PASS, every line ticked.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/downsells.ts src/lib/analytics/upsells.ts scripts/check-downsells.ts
git commit -m "Add downsell pairing core"
```

---

### Task 3: Assert the resolution against real data

The fixtures prove the logic; this proves the logic meets the actual database.

**Files:**
- Create: `scripts/check-downsells-live.ts`

**Interfaces:**
- Consumes: `loadDownsellResolution` from Task 2
- Produces: a repeatable real-data check, extended by Task 4

- [ ] **Step 1: Write the script**

Create `scripts/check-downsells-live.ts`:

```ts
import { loadDownsellResolution } from "@/lib/analytics/downsells";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); } else { console.log(`  ✓ ${msg}`); }
}

const EXPECTED = [
  { pred: "59153676324", succ: "63433823302", contraction: 2250, label: "Hello Fresh NZ" },
  { pred: "56116135556", succ: "63433698333", contraction: 3000, label: "Hello Fresh AU" },
  { pred: "58208775747", succ: "63436346972", contraction: 5750, label: "YouFoodz" },
];

async function main() {
  const res = await loadDownsellResolution();

  console.log("pairs found:");
  for (const p of res.pairs) {
    console.log(`  ${p.predecessorName} ($${p.predecessorExGst}) → ${p.successorName} ($${p.successorExGst}) = $${p.contractionExGst} @ ${p.handoverMonth}`);
  }
  console.log("held out:");
  for (const h of res.heldOut) console.log(`  ${h.name} ($${h.amountExGst}) — ${h.reason}`);

  assert(res.pairs.length === 3, `exactly 3 pairs (got ${res.pairs.length})`);
  for (const e of EXPECTED) {
    const p = res.pairs.find((x) => x.successorId === e.succ);
    assert(!!p, `${e.label} paired`);
    assert(p?.predecessorId === e.pred, `${e.label} matched the right predecessor`);
    assert(p?.contractionExGst === e.contraction, `${e.label} contraction $${e.contraction} (got ${p?.contractionExGst})`);
    assert(p?.handoverMonth === "2026-08", `${e.label} handover 2026-08`);
    assert(!!p?.clientId, `${e.label} carries a clientId to inherit`);
  }
  const total = res.pairs.reduce((s, p) => s + p.contractionExGst, 0);
  assert(total === 11000, `total contraction $11,000 (got $${total})`);
  assert(res.heldOut.length === 0, `nothing held out (got ${res.heldOut.length})`);

  console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
```

- [ ] **Step 2: Run it**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: PASS with three pairs and `$11,000` total.

If a pair is held out with "no predecessor deal found", the company roots diverged — print `normalize(companyRoot(...))` for both names and widen `QUALIFIER_WORDS` in `upsells.ts` only if the extra word is a genuine service-line qualifier. Do **not** loosen the prefix match; that is what keeps Hello Fresh NZ and AU apart.

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add scripts/check-downsells-live.ts
git commit -m "Assert downsell pairing against live data"
```

---

### Task 4: New Revenue vs Churn — the headline fix

**Files:**
- Modify: `src/lib/analytics/revenue-overview.ts:351-406` (`getRevenueVsChurn`)
- Modify: `scripts/check-downsells-live.ts`

**Interfaces:**
- Consumes: `getDownsellResolution`, `DOWNSELL_DEAL_SELECT` from Task 2
- Produces: `getRevenueVsChurn` rows where downsells contribute contraction only

- [ ] **Step 1: Add the failing assertion**

In `scripts/check-downsells-live.ts`, add this import at the top:

```ts
import { getRevenueVsChurn } from "@/lib/analytics/revenue-overview";
```

and insert before the final `console.log(failures === 0 ...)`:

```ts
  const rows = await getRevenueVsChurn(12);
  const aug = rows.find((r) => r.month === "2026-08");
  assert(!!aug, "August 2026 row present");
  assert(aug?.newRevenue === 65800, `August new revenue $65,800 (got $${aug?.newRevenue})`);
  assert(aug?.churnedRevenue === 75650, `August churned revenue $75,650 (got $${aug?.churnedRevenue})`);
  assert(
    !aug?.newClients.some((c) => /downsell|dowsell/i.test(c.name)),
    "no downsell appears as new business"
  );
  const contraction = aug?.churnedClients.find((c) => /Hello Fresh NZ/i.test(c.name));
  assert(contraction?.retainerValue === 2250, `Hello Fresh NZ churn entry is the $2,250 contraction (got ${contraction?.retainerValue})`);
  assert(
    !aug?.churnedClients.some((c) => c.retainerValue === 17750),
    "YouFoodz predecessor's full $17,750 is not booked as churn"
  );
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: FAIL — August reports `$95,050` new and `$104,900` churned.

- [ ] **Step 3: Rewrite the aggregation**

In `src/lib/analytics/revenue-overview.ts`, add to the imports at the top of the file:

```ts
import { getDownsellResolution, DOWNSELL_DEAL_SELECT } from "./downsells";
```

Replace the body of `getRevenueVsChurn` from `const [excludedIds, deals] = await Promise.all([` through the closing `});` of the returned map with:

```ts
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: DOWNSELL_DEAL_SELECT,
    }),
    getDownsellResolution(),
  ]);

  const monthKeyOf = (d: Date | null | undefined): string | null => {
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  return monthRange.map((month) => {
    let newRevenue = 0;
    let churnedRevenue = 0;
    const newClients: RevenueVsChurnClient[] = [];
    const churnedClients: RevenueVsChurnClient[] = [];

    for (const d of deals) {
      if (d.clientId && excludedIds.has(d.clientId)) continue;
      // Unpaired downsells are held out until their HubSpot data is complete.
      if (downsells.heldOutIds.has(d.id)) continue;
      const amt = d.amountExGst ?? d.amount ?? 0;
      if (!amt) continue;

      // A downsell replacement is never new business, and the deal it replaces
      // never churns in full — the pair contributes its net contraction below.
      if (monthKeyOf(d.startDate ?? d.closeDate) === month && !downsells.successorIds.has(d.id)) {
        newRevenue += amt;
        newClients.push({ id: d.clientId ?? d.id, name: d.name, retainerValue: Math.round(amt) });
      }
      if (monthKeyOf(d.churnDate) === month && !downsells.predecessorIds.has(d.id)) {
        churnedRevenue += amt;
        churnedClients.push({ id: d.clientId ?? d.id, name: d.name, retainerValue: Math.round(amt) });
      }
    }

    // Net movement for each downsell pair handing over this month. A positive
    // contraction is churn; a larger replacement books the increase as new
    // revenue, so no chart ever renders a negative bar.
    for (const p of downsells.contractionsByMonth.get(month) ?? []) {
      if (p.clientId && excludedIds.has(p.clientId)) continue;
      if (p.contractionExGst > 0) {
        churnedRevenue += p.contractionExGst;
        churnedClients.push({
          id: p.clientId ?? p.successorId,
          name: `${p.predecessorName} (downsell)`,
          retainerValue: p.contractionExGst,
        });
      } else if (p.contractionExGst < 0) {
        const gain = -p.contractionExGst;
        newRevenue += gain;
        newClients.push({
          id: p.clientId ?? p.successorId,
          name: `${p.predecessorName} (upgrade)`,
          retainerValue: gain,
        });
      }
    }

    return {
      month,
      newRevenue: Math.round(newRevenue),
      churnedRevenue: Math.round(churnedRevenue),
      net: Math.round(newRevenue - churnedRevenue),
      newClients,
      churnedClients,
    };
  });
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: PASS — August `$65,800` new, `$75,650` churned, net `−$9,850`.

- [ ] **Step 5: Confirm no other month moved**

Add temporarily to the script and run it, then remove:

```ts
  for (const r of rows) console.log(`${r.month}: new $${r.newRevenue} churn $${r.churnedRevenue}`);
```

Expected: only `2026-08` differs from the figures in the screenshot (Sep 2025 $87K/$39K, Oct $74K/$68K, Nov $37K/$24K, Dec $47K/$44K, Jan $73K/$76K, Feb $50K/$43K, Mar $25K/$47K, Apr $105K/$48K, May $91K/$18K, Jun $77K/$19K, Jul $97K/$41K).

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/revenue-overview.ts scripts/check-downsells-live.ts
git commit -m "Book downsells as contraction only in New Revenue vs Churn"
```

---

### Task 5: Continuous MRR windows

The predecessor must stop and the successor start on the same handover month, from the pair rather than the raw dates.

**Files:**
- Modify: `src/lib/analytics/revenue-overview.ts:40-67` (`getRevenueOverview` MRR loop)
- Modify: `src/lib/analytics/revenue-overview.ts:225-261` (`divisionRevenueTrend` — same function, same deals, same treatment; added during Task 5 review after it was found to be an omission in this plan)
- Modify: `src/lib/analytics/active-revenue.ts:195-225` (`getPackageRevenueByMonth`)
- Modify: `src/lib/analytics/avg-deal-size-comparison.ts:40-72`
- Modify: `scripts/check-downsells-live.ts`

**Interfaces:**
- Consumes: `getDownsellResolution`, `windowKeys`, `DOWNSELL_DEAL_SELECT`
- Produces: MRR series with no gap or double-count across a handover

- [ ] **Step 1: Add the failing assertion**

Append to `scripts/check-downsells-live.ts`, before the final log, with `import { getRevenueOverview } from "@/lib/analytics/revenue-overview";` added at the top:

```ts
  const overview = await getRevenueOverview(12);
  const t = overview.monthlyTrend;
  const jul = t.find((m) => m.month === "2026-07")?.hubspotRevenue ?? 0;
  const augMrr = t.find((m) => m.month === "2026-08")?.hubspotRevenue ?? 0;
  assert(jul > 0 && augMrr > 0, "July and August MRR both present");
  assert(
    Math.abs((jul - augMrr) - 11000) < 12000,
    `Aug MRR drops from Jul by roughly the $11,000 contraction plus genuine churn (Jul $${jul}, Aug $${augMrr})`
  );
  assert(augMrr < jul, "August MRR is lower than July, not higher");
```

- [ ] **Step 2: Run to see the current behaviour**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Record the printed July and August MRR. With aligned dates the raw windows already happen to be continuous, so this may pass before the change — the edit's purpose is to make it *robust* to misaligned dates and to hold out unpaired downsells.

- [ ] **Step 3: Use handover windows in getRevenueOverview**

In `src/lib/analytics/revenue-overview.ts`, add `windowKeys` to the downsells import:

```ts
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";
```

Add `getDownsellResolution()` to the existing `Promise.all` in `getRevenueOverview` as a new final element, and destructure it:

```ts
  const [excludedIds, financialsRaw, settings, teamMembers, hubspotDeals, downsells] = await Promise.all([
```

Change the deal query's `select` to include the id and churn reason (pairing needs them):

```ts
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { id: true, clientId: true, name: true, amount: true, amountExGst: true, startDate: true, closeDate: true, churnDate: true, contentPackageType: true },
    }),
```

and add as the last element of the array:

```ts
    getDownsellResolution(),
```

Then replace the MRR loop body:

```ts
  for (const d of hubspotDeals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    if (downsells.heldOutIds.has(d.id)) continue;
    // Handover months keep a downsell pair continuous: the predecessor stops
    // and the successor starts in the same month, whatever the raw dates say.
    const { startKey, churnKey } = windowKeys(d, downsells);
    if (!startKey) continue;
    const ex = d.amountExGst ?? 0;
    const inc = d.amount ?? 0;
    for (const m of monthRange) {
      if (m >= startKey && (!churnKey || m < churnKey)) {
        hubspotMrrEx[m] += ex;
        hubspotMrrInc[m] += inc;
      }
    }
  }
```

Delete the now-unused local `dealMonthKey` declaration only if nothing else in the function references it; `grep -n dealMonthKey src/lib/analytics/revenue-overview.ts` first, and keep it if line ~240 still uses it.

- [ ] **Step 4: Apply the same window rule to getPackageRevenueByMonth**

In `src/lib/analytics/active-revenue.ts`, add:

```ts
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";
```

In `getPackageRevenueByMonth`, add the resolution to the `Promise.all`, widen the select, and filter using the handover window:

```ts
  const [excludedIds, rawDeals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: DOWNSELL_DEAL_SELECT,
    }),
    getDownsellResolution(),
  ]);
  const active = rawDeals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    if (downsells.heldOutIds.has(d.id)) return false;
    const { startKey, churnKey } = windowKeys(d, downsells);
    if (!startKey) return false;
    return monthKey >= startKey && (!churnKey || monthKey < churnKey);
  });
```

The local `monthOf` helper becomes unused here — remove it if `grep -n monthOf src/lib/analytics/active-revenue.ts` shows no other use inside this function.

- [ ] **Step 5: Apply it to the avg-deal-size comparison**

In `src/lib/analytics/avg-deal-size-comparison.ts`, add:

```ts
import { getDownsellResolution, DOWNSELL_DEAL_SELECT, windowKeys } from "./downsells";
```

Change the loader and the `statsFor` filter:

```ts
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: DOWNSELL_DEAL_SELECT,
    }),
    getDownsellResolution(),
  ]);

  const statsFor = (month: string) => {
    const active = deals.filter((d) => {
      if (d.clientId && excludedIds.has(d.clientId)) return false;
      if (downsells.heldOutIds.has(d.id)) return false;
      const { startKey, churnKey } = windowKeys(d, downsells);
      if (!startKey) return false;
      return month >= startKey && (!churnKey || month < churnKey);
    });
```

The rest of `statsFor` (the `foldUpsells` call and aggregation) is unchanged — a paired downsell replaces its predecessor in the active set for the month, so the division count stays flat automatically.

- [ ] **Step 6: Run the checks**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: PASS, with August MRR below July and no gap.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/revenue-overview.ts src/lib/analytics/active-revenue.ts src/lib/analytics/avg-deal-size-comparison.ts scripts/check-downsells-live.ts
git commit -m "Use downsell handover months for MRR and active-deal windows"
```

---

### Task 6: Snapshot, composition and division counts

`getRevenueComposition` classifies a deal as "new" purely by start month, so all three replacements would appear as $29,250 of new business on the Analytics page.

**Files:**
- Modify: `src/lib/analytics/active-revenue.ts:73-139` (`getRevenueComposition`), `:248-276` (`getActiveRevenueSnapshot`)
- Modify: `src/lib/analytics/agency-kpis.ts:341-354`
- Modify: `scripts/check-downsells-live.ts`

**Interfaces:**
- Consumes: `getDownsellResolution`
- Produces: composition rows where a paired downsell is `existing`, never `newRevenue` or `upsell`

- [ ] **Step 1: Add the failing assertions**

Append to `scripts/check-downsells-live.ts`, with `import { getRevenueComposition, getActiveRevenueSnapshot } from "@/lib/analytics/active-revenue";` at the top:

```ts
  const comp = await getRevenueComposition();
  const augComp = comp.byMonth.find((m) => m.month === "2026-08");
  assert(!!augComp, "August composition row present");
  const augNew = (augComp?.rows ?? []).reduce((s, r) => s + r.newRevenue, 0);
  const namedNew = (augComp?.rows ?? []).flatMap((r) => r.newDeals.map((d) => d.name));
  assert(!namedNew.some((n) => /downsell|dowsell/i.test(n)), "no downsell in the composition's new deals");
  console.log(`  August composition new revenue: $${augNew}`);
  const augUpsell = (augComp?.rows ?? []).flatMap((r) => r.upsellDeals.map((d) => d.name));
  assert(!augUpsell.some((n) => /downsell|dowsell/i.test(n)), "no downsell in the upsell bucket");

  const snap = await getActiveRevenueSnapshot();
  assert(!snap.byPackageType.some((r) => r.deals.some((d) => /dowsell/i.test(d.name))), "held-out downsells absent from the snapshot");
  console.log(`  snapshot deal count: ${snap.dealCount}, ex-GST $${snap.monthlyRevenueExGst}`);
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: FAIL — the three replacements appear in `newDeals` for August.

- [ ] **Step 3: Classify paired downsells as existing revenue**

In `src/lib/analytics/active-revenue.ts`, in `getRevenueComposition`, add the resolution and carry the deal id through the tagging pass:

```ts
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { stage: "closed_won" },
      select: { id: true, clientId: true, name: true, contentPackageType: true, packageDescription: true, amount: true, amountExGst: true, startDate: true, closeDate: true },
    }),
    getDownsellResolution(),
  ]);
```

Change the `Tagged` type and the first pass:

```ts
  type Tagged = { pkg: string; name: string; ex: number; month: string; upsell: boolean; downsell: boolean };
  const tagged: Tagged[] = [];
```

```ts
  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    if (isOneOff(d) || isAdHoc(d.name)) continue;
    if (downsells.heldOutIds.has(d.id)) continue;
    const ex = d.amountExGst ?? 0;
    if (ex <= 0) continue;
    const pkg = classifyPackageType(d.contentPackageType);
    const month = monthOf(d.startDate ?? d.closeDate) ?? "";
    const upsell = isUpsell(d);
    // A downsell replacement continues existing revenue — it must never open a
    // "new revenue" month or land in the upsell (expansion) bucket.
    const downsell = downsells.successorIds.has(d.id);
    if (!upsell && !downsell && month) monthsSet.add(month);
    tagged.push({ pkg, name: d.name, ex, month, upsell, downsell });
  }
```

and the classification branch:

```ts
      if (t.upsell) {
        row.upsell += t.ex;
        row.upsellDeals.push({ name: t.name, revenue: Math.round(t.ex) });
      } else if (t.downsell) {
        row.existing += t.ex;
      } else if (t.month === selMonth) {
```

- [ ] **Step 4: Hold out unpaired downsells from the snapshot**

In `getActiveRevenueSnapshot`, add the id to the select, load the resolution, and filter:

```ts
export async function getActiveRevenueSnapshot(): Promise<ActiveRevenueSnapshot> {
  const [rawDeals, downsells] = await Promise.all([
    db.hubspotDeal.findMany({
      where: { stage: "closed_won" },
      select: { id: true, name: true, stage: true, amount: true, amountExGst: true, contentPackageType: true, packageDescription: true },
    }),
    getDownsellResolution(),
  ]);
  // Unpaired downsells are held out until their HubSpot data is complete.
  const { deals } = foldUpsells(rawDeals.filter((d) => !downsells.heldOutIds.has(d.id)));
```

The paired replacements stay in the book — they *are* the current revenue — while their churned predecessors are already excluded by the `stage: "closed_won"` filter, so the count stays flat.

- [ ] **Step 5: Hold them out of the division averages**

In `src/lib/analytics/agency-kpis.ts`, add:

```ts
import { getDownsellResolution } from "./downsells";
```

and change the closed-won query and fold:

```ts
  const [rawCwDeals, downsellRes] = await Promise.all([
    db.hubspotDeal.findMany({
      where: { stage: "closed_won" },
      select: { id: true, name: true, stage: true, amountExGst: true, amount: true, contentPackageType: true, packageDescription: true },
    }),
    getDownsellResolution(),
  ]);
  const { deals: cwDeals } = foldUpsells(rawCwDeals.filter((d) => !downsellRes.heldOutIds.has(d.id)));
```

- [ ] **Step 6: Run to verify it passes**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: PASS. August composition new revenue drops by $29,250 relative to the pre-change figure printed in Step 2.

- [ ] **Step 7: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/active-revenue.ts src/lib/analytics/agency-kpis.ts scripts/check-downsells-live.ts
git commit -m "Classify downsell replacements as existing revenue, not new business"
```

---

### Task 7: Unbroken tenure and LTV

The stated purpose of the whole feature. A replacement deal arrives with `clientId = null` because `Client.hubspotDealId` is unique and already points at the predecessor, so without inheritance the client's revenue and lifecycle split.

**Files:**
- Modify: `src/lib/analytics/advanced-analytics.ts:72-128` (`getLTVData`)
- Modify: `scripts/check-downsells-live.ts`

**Interfaces:**
- Consumes: `getDownsellResolution` — specifically `inheritedClientId`, `lifecycleStartByDeal`, `heldOutIds`
- Produces: `getLTVData` where each downsell client has one continuous lifecycle

- [ ] **Step 1: Add the failing assertions**

Append to `scripts/check-downsells-live.ts`, with `import { getLTVData } from "@/lib/analytics/advanced-analytics";` at the top:

```ts
  const ltv = await getLTVData();
  for (const label of ["Hello Fresh NZ", "Hello Fresh AU", "YouFoodz"]) {
    const matches = ltv.clients.filter((c) => c.clientName.toLowerCase().startsWith(label.toLowerCase().slice(0, 10)));
    assert(matches.length === 1, `${label} appears as exactly one client (got ${matches.length})`);
    const c = matches[0];
    if (!c) continue;
    assert(c.startDate.getFullYear() === 2026 && c.startDate.getMonth() <= 3, `${label} lifecycle starts April 2026 or earlier (got ${c.startDate.toISOString().slice(0, 10)})`);
    assert(c.monthsActive >= 4, `${label} tenure is at least 4 months (got ${c.monthsActive})`);
    assert(c.monthlyAvgRevenue > 0, `${label} carries its replacement deal's revenue`);
  }
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: FAIL — the replacement deal contributes no revenue to the client (its `clientId` is null), and/or tenure is short.

- [ ] **Step 3: Inherit the client and the lifecycle start**

In `src/lib/analytics/advanced-analytics.ts`, add:

```ts
import { getDownsellResolution } from "./downsells";
```

In `getLTVData`, add the resolution to the `Promise.all`, widen the deal select to include `id`, and apply inheritance:

```ts
  const [allClients, deals, , excludedIds, downsells] = await Promise.all([
    db.client.findMany({
      where: { status: { not: "prospect" }, hubspotDealId: { not: null } },
      select: { id: true, name: true, status: true, industry: true, startDate: true, endDate: true, createdAt: true },
    }),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { id: true, clientId: true, amount: true, amountExGst: true, name: true, packageDescription: true },
    }),
    db.appSettings.findFirst(),
    getExcludedClientIds(),
    getDownsellResolution(),
  ]);
```

Note the deal query no longer filters `clientId: { not: null }` — a replacement deal has no `clientId` of its own and would otherwise be dropped before inheritance can run.

Replace the MRR aggregation loop:

```ts
  // Per-client monthly MRR (ex-GST) from their closed-won/churned deals
  const clientMrr = new Map<string, number>();
  for (const d of deals) {
    if (isOneOff(d)) continue; // one-offs are not recurring LTV
    if (downsells.heldOutIds.has(d.id)) continue;
    // A downsell replacement is created fresh in HubSpot with no client link
    // (Client.hubspotDealId is unique and still points at the deal it
    // replaced), so it inherits its predecessor's client. Without this the
    // client's lifecycle splits in two and tenure resets.
    const clientId = d.clientId ?? downsells.inheritedClientId.get(d.id) ?? null;
    if (!clientId) continue;
    // The predecessor's revenue stopped at the handover — only the current
    // replacement counts toward present MRR.
    if (downsells.predecessorIds.has(d.id)) continue;
    clientMrr.set(clientId, (clientMrr.get(clientId) || 0) + (d.amountExGst ?? d.amount ?? 0));
  }

  // Earliest chain start per client, so a downgraded client's tenure is measured
  // from its ORIGINAL deal rather than from the replacement.
  const chainStartByClient = new Map<string, Date>();
  for (const [dealId, start] of downsells.lifecycleStartByDeal) {
    const cid = downsells.inheritedClientId.get(dealId);
    if (!cid) continue;
    const cur = chainStartByClient.get(cid);
    if (!cur || start < cur) chainStartByClient.set(cid, start);
  }
```

Then in the `clientData` map, widen the start:

```ts
  const clientData = clients.map((c) => {
    const mrr = clientMrr.get(c.id) || 0;
    const clientStart = c.startDate ? new Date(c.startDate) : c.createdAt;
    const chainStart = chainStartByClient.get(c.id);
    const effectiveStart = chainStart && chainStart < clientStart ? chainStart : clientStart;
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: PASS — each of the three appears once, starting April 2026, with at least four months of tenure.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/advanced-analytics.ts scripts/check-downsells-live.ts
git commit -m "Keep client tenure and LTV continuous across a downsell"
```

---

### Task 8: Michael's sales tab

None of the current three are his (owner `250378614`, not `76570622`), so this is about the rule holding for future downsells rather than moving today's numbers.

**Files:**
- Modify: `src/lib/analytics/michael-sales.ts:151-166`, `:199-209`, `:256-278`
- Create: `scripts/check-downsells-michael.ts`

**Interfaces:**
- Consumes: `getDownsellResolution`, `isDownsell`
- Produces: `getMichaelSalesData` with downsells excluded from created deals, new revenue and commission

- [ ] **Step 1: Write the assertions**

Create `scripts/check-downsells-michael.ts`:

```ts
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
```

- [ ] **Step 2: Run it**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-michael.ts
```

Expected: PASS today, because Michael owns none of the three. It becomes a real regression guard once he owns one, so implement Step 3 regardless.

- [ ] **Step 3: Exclude downsells from all three surfaces**

In `src/lib/analytics/michael-sales.ts`, add:

```ts
import { getDownsellResolution, isDownsell } from "./downsells";
```

Widen the deal query to carry the fields pairing needs, and load the resolution:

```ts
  const [deals, downsells] = await Promise.all([
    db.hubspotDeal.findMany({
      where: { ownerId: MICHAEL_OWNER_ID },
      select: {
        id: true, name: true, stage: true, stageLabel: true, amountExGst: true, amount: true,
        startDate: true, createDate: true, closeDate: true, churnDate: true, commissionType: true,
        packageDescription: true,
      },
    }),
    getDownsellResolution(),
  ]);

  // A downsell renegotiates existing business — it is neither a win nor new
  // revenue, so it counts toward no goal and earns no commission. Held-out
  // (unpaired) downsells are excluded too, until their HubSpot data is complete.
  const isDownsellDeal = (d: { id: string; name: string; packageDescription?: string | null }) =>
    downsells.successorIds.has(d.id) ||
    downsells.heldOutIds.has(d.id) ||
    downsells.pendingIds.has(d.id) ||
    isDownsell(d);
```

In the commission filter:

```ts
  const commDeals = deals
    .filter((d) => !isDownsellDeal(d))
    .filter((d) => d.commissionType === "Owned" || d.commissionType === "Support")
```

In the deals-created loop:

```ts
  for (const d of deals) {
    if (isDownsellDeal(d)) continue;
    const key = toMonthKey(d.createDate);
```

In the meetings-booked loop (a downsell is not a booked meeting):

```ts
  for (const d of deals) {
    if (isDownsellDeal(d)) continue;
    const k = toMonthKey(d.createDate);
```

In the new-revenue loop:

```ts
  for (const d of deals) {
    if (d.stage !== "closed_won") continue;
    if (isDownsellDeal(d)) continue;
```

- [ ] **Step 4: Run to verify it still passes**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-michael.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/michael-sales.ts scripts/check-downsells-michael.ts
git commit -m "Exclude downsells from Michael's goals and commission"
```

---

### Task 9: New-client deal size and the forecast

**Files:**
- Modify: `src/lib/analytics/advanced-analytics.ts:631-653` (`getNewClientDealSize`)
- Modify: `src/lib/analytics/forecast-3month.ts:171-190`
- Modify: `scripts/check-downsells-live.ts`

**Interfaces:**
- Consumes: `getDownsellResolution`, `isDownsell`
- Produces: neither surface treats a downsell as an acquisition or as pipeline

- [ ] **Step 1: Add the failing assertions**

Append to `scripts/check-downsells-live.ts`, with `import { getNewClientDealSize } from "@/lib/analytics/advanced-analytics"; import { getThreeMonthForecast } from "@/lib/analytics/forecast-3month";` at the top:

```ts
  const ncds = await getNewClientDealSize(12);
  const ncdsJson = JSON.stringify(ncds);
  assert(!/downsell|dowsell/i.test(ncdsJson), "no downsell in new-client deal size");

  const f3 = await getThreeMonthForecast();
  assert(!/downsell|dowsell/i.test(JSON.stringify(f3)), "no downsell in the 3-month forecast");
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: FAIL on the new-client assertion (a replacement deal reads as a newly acquired client).

- [ ] **Step 3: Exclude downsells from new-client deal size**

In `src/lib/analytics/advanced-analytics.ts`, in `getNewClientDealSize`, add the resolution to the `Promise.all`:

```ts
  const [excludedIds, deals, downsells] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: {
        id: true, clientId: true, name: true, amountExGst: true, amount: true,
        startDate: true, closeDate: true, churnDate: true, contentPackageType: true,
        packageDescription: true,
      },
    }),
    getDownsellResolution(),
  ]);
```

and split the filter per-side. **The two exclusions must NOT share one filter**: `visible`
feeds both `newMonths` (keyed on `startDate`) and `churnedMonths` (keyed on `churnDate`),
so excluding predecessors from the shared filter deletes real acquisitions — the three
predecessors genuinely began in April 2026 and their clients are still active.

```ts
  // One-offs and upsells are never a new-client acquisition. Held-out
  // (unpaired) downsells are excluded everywhere until their data is complete.
  const visible = deals.filter(
    (d) =>
      !(d.clientId && excludedIds.has(d.clientId)) &&
      !isOneOff(d) &&
      !isUpsell(d) &&
      !downsells.heldOutIds.has(d.id)
  );
  // A downsell replacement is not an acquisition...
  const newVisible = visible.filter((d) => !downsells.successorIds.has(d.id));
  // ...and the deal it replaced is a contraction, not a lost client. The
  // predecessor STAYS in the new-client view: its own start month was a genuine
  // acquisition and the client is still active.
  const churnVisible = visible.filter((d) => !downsells.predecessorIds.has(d.id));
```

Use `newVisible` in `newMonths` and `churnVisible` in `churnedMonths`.

Note `packageDescription` must be added to this query's `select`: `isOneOff` and `isUpsell`
both read it (`upsells.ts:32,46`) and it was absent before, so one-off exclusion never
worked here and upsell detection silently fell back to name matching. Adding it corrects a
pre-existing bug and will move some monthly counts on its own.

- [ ] **Step 4: Exclude downsells from the forecast**

In `src/lib/analytics/forecast-3month.ts`, add:

```ts
import { getDownsellResolution } from "./downsells";
```

Replace the query at `forecast-3month.ts:171-189` and the `kept` filter on the line directly after it. The existing `kept` filter is the single place every later line reads from, so extending it is the whole change — no other reference to `deals` needs touching.

```ts
  const [deals, downsells] = await Promise.all([
    db.hubspotDeal.findMany({
      where: {
        OR: [
          { stageLabel: { in: ["Very Warm", "Contract out", "Closed Won"] } },
          { churnDate: { not: null } },
        ],
      },
      select: {
        id: true,
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
    }),
    getDownsellResolution(),
  ]);
  // A downsell is never incoming revenue: pending ones are a scheduled
  // reduction rather than pipeline, and held-out ones are excluded everywhere
  // until their HubSpot data is complete. Paired successors DO remain — they
  // are closed-won ongoing revenue and form part of the currentMrr baseline.
  const kept = deals.filter(
    (d) =>
      !(d.clientId && excludedIds.has(d.clientId)) &&
      !downsells.pendingIds.has(d.id) &&
      !downsells.heldOutIds.has(d.id)
  );
```

Note the predecessors are deliberately *not* excluded here — their churn is real MRR leaving the book on the handover, which the forecast should see.

**Corrected during Task 9 review.** An earlier draft of this step also excluded `successorIds`.
That was wrong: `kept` feeds BOTH the pipeline logic and `currentMrr`
(`forecast-3month.ts:207-208` computes the baseline as `kept.filter(stageLabel === "Closed
Won")`), so excluding paired successors deleted $29,250 of real ongoing revenue from the
forecast baseline and cascaded into the churn rate and every projected month. "Not pipeline"
and "not revenue" are different things; only pending and held-out downsells are neither.

- [ ] **Step 5: Run both check scripts**

```bash
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
npx tsx --env-file=.env.local scripts/check-forecast-3month.ts
```

Expected: both PASS. `check-forecast-3month.ts` tests the pure helpers and must be unaffected.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/analytics/advanced-analytics.ts src/lib/analytics/forecast-3month.ts scripts/check-downsells-live.ts
git commit -m "Keep downsells out of new-client deal size and the forecast"
```

---

### Task 10: The held-out downsells card

Holding unpaired downsells out of the numbers silently removes revenue. This makes that visible.

**Files:**
- Create: `src/components/dashboard/downsells-attention-card.tsx`
- Modify: `src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `getDownsellResolution().heldOut` — `{ id, name, amountExGst, reason }[]`
- Produces: a card rendered above Recent Imports, and nothing at all when the list is empty

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/downsells-attention-card.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { HeldOutDownsell } from "@/lib/analytics/downsells";

/**
 * Unpaired downsells are held out of every revenue figure until their HubSpot
 * data is complete, so they must be visible — otherwise revenue goes missing
 * with nothing to explain it.
 */
export function DownsellsAttentionCard({ heldOut }: { heldOut: HeldOutDownsell[] }) {
  if (heldOut.length === 0) return null;
  const total = heldOut.reduce((s, d) => s + d.amountExGst, 0);

  return (
    <Card className="border-yellow-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          Downsells needing attention
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {heldOut.length} downsell{heldOut.length === 1 ? "" : "s"} worth {formatCurrency(total)}/mo
          {" "}excluded from all revenue figures until paired to the deal each replaces. Set the
          superseded deal&apos;s Churn Date and Reasons for Churn = &ldquo;Downsell&rdquo; in HubSpot.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {heldOut.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-4 text-sm">
              <div>
                <span className="font-medium">{d.name}</span>
                <p className="text-muted-foreground">{d.reason}</p>
              </div>
              <span className="whitespace-nowrap font-medium">{formatCurrency(d.amountExGst)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount it on the Overview**

In `src/app/(dashboard)/page.tsx`, add the imports:

```ts
import { getDownsellResolution } from "@/lib/analytics/downsells";
import { DownsellsAttentionCard } from "@/components/dashboard/downsells-attention-card";
```

Add `getDownsellResolution()` as the final element of the existing `Promise.all` and `downsells` as the final destructured name:

```ts
  const [clientCount, recentImports, revenue, revenueVsChurn, activeSnapshot, forecast, budgetVsActual, ytdXero, lastYearPackages, pipelineStages, threeMonthForecast, downsells] = await Promise.all([
```

Then insert the card immediately before the `{recentImports.length > 0 && (` block near the end of the JSX:

```tsx
      <DownsellsAttentionCard heldOut={downsells.heldOut} />

      {recentImports.length > 0 && (
```

- [ ] **Step 3: Verify it renders nothing today**

```bash
npm run dev
```

Open http://localhost:3000, log in as `admin@swanstudio.com.au`, and confirm the Overview shows **no** attention card — all three downsells pair cleanly, so `heldOut` is empty. Confirm Recent Imports still sits at the very bottom.

- [ ] **Step 4: Verify it renders when something is unpaired**

Temporarily clear one predecessor's signals to force a held-out state:

```bash
npx tsx --env-file=.env.local -e "
import('./src/lib/db.js').then(async ({ db }) => {
  await db.hubspotDeal.update({ where: { id: '59153676324' }, data: { churnReason: null, churnDate: new Date('2025-01-01') } });
  console.log('Hello Fresh NZ predecessor signals cleared');
});
"
```

Reload the Overview. Expected: the card appears listing **Hello Fresh NZ Downsell** at $6,750 with the reason about no matching churn reason or date. Then restore:

```bash
npx tsx --env-file=.env.local scripts/sync-hubspot-deals.ts
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
```

Expected: sync restores the real values and the live check returns to PASS with nothing held out.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/components/dashboard/downsells-attention-card.tsx "src/app/(dashboard)/page.tsx"
git commit -m "Surface held-out downsells on the Overview"
```

---

### Task 11: Full verification and push

**Files:** none modified

- [ ] **Step 1: Run every check script**

```bash
npx tsx --env-file=.env.local scripts/check-churn-reason.ts
npx tsx scripts/check-downsells.ts
npx tsx --env-file=.env.local scripts/check-downsells-live.ts
npx tsx --env-file=.env.local scripts/check-downsells-michael.ts
npx tsx --env-file=.env.local scripts/check-forecast-3month.ts
npx tsx --env-file=.env.local scripts/check-division-fy.ts
npx tsx --env-file=.env.local scripts/check-pipeline-stages.ts
```

Expected: all PASS. The last three are pre-existing and prove nothing regressed.

- [ ] **Step 2: Full typecheck and production build**

```bash
npx tsc --noEmit
npm run build
```

Expected: both clean. Never push on a failing typecheck — a type error has broken the Vercel build before.

- [ ] **Step 3: Eyeball the dashboard**

```bash
npm run dev
```

Check on http://localhost:3000:
- Overview → *New Revenue vs Churn*: August 2026 reads **$65,800 new / $75,650 churned**, and its drill-down lists "Hello Fresh NZ (downsell) $2,250" rather than a $9,000 churn.
- Overview → deal count and monthly revenue tiles unchanged from before the work.
- Analytics → *Revenue Composition* for August: no deal named "…Downsell" under new revenue or upsells.
- Analytics → LTV/tenure: Hello Fresh NZ, Hello Fresh AU and YouFoodz each appear once with tenure from April 2026.
- Michael tab renders without error.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Prod (`agency-bi.vercel.app`) may not auto-deploy — historically Git auto-deploy has been off and the Vercel CLI unauthenticated. If prod needs to reflect this, run `vercel login` then `vercel --prod`.

## Notes for the implementer

- **`getDownsellResolution()` is React-`cache()`d**, so the several surfaces calling it in one page render share a single query. Scripts must call `loadDownsellResolution()` instead — `cache` has no request scope outside a render.
- **Never re-derive the downsell rule at a call site.** If a surface needs something the resolution does not expose, add it to `DownsellResolution` rather than reimplementing the matching.
- **The predecessor keeps its own `clientId`;** only the successor inherits. Client-keyed surfaces therefore see one client with one continuous revenue stream.
- **`foldUpsells` runs before downsell logic** wherever both apply, so an upsell folded onto the predecessor is included in the amount the contraction is measured against.
- **A brand-new downsell synced before its predecessor is churned will be held out**, and the Overview card is the signal to go finish the HubSpot record. That is intended behaviour, not a bug.
