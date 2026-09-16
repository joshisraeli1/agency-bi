# Retention portfolio — design

**Date:** 2026-09-17
**Status:** awaiting review
**For:** Emily Heinhuis, client servicing lead (emily@swan.studio)

## Why

Retention is Emily's KPI and the tool measures none of it. Every existing surface
is organised by division; her book cuts across divisions and is defined by who
manages the client, not by what work is sold. Nothing in the schema records who
manages a client at all.

## The decision that shapes everything

A portfolio is **not** a division. Modelling it as a fourth division would count
her clients' revenue twice — once under Ad Creative, once under hers — and break
the reconciliation between the division dashboards and the agency total that the
Clients page, the Overview and the divisional bonus cards all depend on.

A portfolio is a **book of clients**, scoped by client manager, spanning whatever
divisions those clients happen to sit in. Divisional figures stay untouched.

## Data foundation

### Source of truth: `client_manager`

HubSpot carries three candidate properties. Measured against the 87 live
closed-won deals on 2026-09-16:

| Property | Label | Filled | Emily |
|---|---|---|---|
| `account_manager` | "Executor" | 64/87 (74%) | 0 clients |
| `account_managers` | "Account Managers" | 28/87 (32%) | 4 clients |
| `client_manager` | "Client Manager" | 28/87 (32%) | 2 clients |

`client_manager` is the chosen source: its options are full names, matching the
convention of the other people-fields, and it names the retention role rather
than the delivery one. `account_manager` is mis-labelled — "Executor" is the
production owner, and Emily appears on none of them.

The two candidate fields name **completely disjoint** client sets for Emily, so
there is no way to reconcile them from the data. One had to be chosen; the other
keeps its current meaning untouched.

### The backfill dependency

`client_manager` is populated on 32% of live deals. **Every metric below is
computed on whatever subset is tagged.** This is the single largest risk in the
work: a retention rate derived from a third of the book is not approximately
right, it is arbitrary.

Mitigation: the dashboard reports its own coverage in a banner — "portfolio
derived from 28 of 87 live deals" — and the banner only disappears at full
coverage. The tool must never quietly present a partial number as a complete one.

### Schema

Add to `HubspotDeal`:

```prisma
clientManager String?  // HubSpot "Client Manager" — the retention owner
```

Synced in `refresh-syncs.ts` alongside the existing property mapping
(`clientManager: p.client_manager ?? null`), which is a one-line addition to the
`properties` list and the upsert.

## Metrics

All figures ex-GST, reusing the existing gates — `excludedClientIds`,
`isOneOff`, upsell folding and downsell pairing — so the portfolio reconciles to
the divisional and agency numbers rather than forming a third version of truth.

| Metric | Definition | Source |
|---|---|---|
| Portfolio revenue | Live deals where `clientManager` matches, upsells folded | `amountExGst` |
| Client count | Distinct clients in that set, grouped by **company** | see "Client identity" below |
| Average tenure | Mean months from `startDate` to now across live clients | `startDate` |
| Upcoming renewals | `startDate` + `contractTerms`, rolled forward to the next occurrence after today | `contract_terms` (83% filled) |
| New vs churned revenue | Monthly, same windowing as `division-dashboard.ts` | `startDate` / `churnDate` |
| Upsells per month | Deals passing `isUpsell()` within the portfolio, by month | `upsells.ts` |
| Logo retention | Companies still live at period end ÷ companies live at period start, by quarter. Clients won *during* the quarter are excluded from both sides, so acquisition never flatters retention | derived |
| Gross revenue retention | Revenue retained from the starting cohort, churn and downsells counted, upsells excluded; capped at 100% | derived |
| Net revenue retention | As GRR but upsells counted; uncapped | derived |

### Client identity

The two existing surfaces disagree on what counts as one client, and a retention
rate is a ratio of client counts, so this must be settled before any of it means
anything.

`client-book.ts` groups by company (`clientId`, falling back to the normalised
HubSpot company name). `division-dashboard.ts` keys on `clientId ?? dealId`, so a
company with no Client record and two live deals counts as **two clients** there.
Blossom, Everyplate, Ipanema, Funding and BowWowMeow all fall in that gap — it is
why the Ad Creative dashboard reports 35 clients where the client book reports 36.

The portfolio groups by **company**, because "we kept the client" is a statement
about a company, not about a contract. A company holding two deals that drops one
is a downsell, not a churn, and a deal-keyed count would record it as a lost
client and understate retention.

This inconsistency is pre-existing and is NOT fixed here; it is recorded so the
portfolio's numbers are interpretable beside the divisional ones.

### Why both GRR and NRR

Logo retention alone hides the thing worth knowing. A portfolio can run 80% logo
retention and still clear 100% NRR if the kept clients grew — that distinction is
the entire argument for a retention lead, and neither number shows it alone.
Churned revenue is reported beside churned count for the same reason: one $15k
client leaving is not the same event as one $2k client leaving.

### Renewals

`contract_terms` holds `3 - month` (42), `6 - month` (24), `One-off` (4),
`Month to Month` (2). Next renewal derives as `startDate` plus whole terms until
the result is in the future. **One-off never renews and Month-to-Month renews
continuously — both are excluded rather than given a fabricated date.**

## Module

New `src/lib/analytics/portfolio.ts`, mirroring the shape of
`division-dashboard.ts`: one exported `getPortfolio(manager: string)` returning
revenue, clients, months, renewals, upsells and retention. Pure computation over
deals fetched once; no surface re-queries.

Retention cohort logic lives in its own exported function so it can be tested
against a fixed cohort without a database.

## Page and access

`/portfolio` — Emily's own book, resolved **from the session, never the URL**,
exactly as `division/page.tsx` resolves a lead's division.

### Role

A new `portfolio_lead` role, which **must be absent from the role hierarchy** in
`auth.ts` exactly as `division_lead` is. Adding it to the hierarchy to make it
"just above viewer" would silently grant her every division's numbers. Verified
already: an unknown role scores 0 and `hasRole(session, "viewer")` is false, so a
new scoped role fails closed before any code is written for it.

### Sidebar

`Sidebar`'s `divisionOnly` boolean becomes a mode: `"admin" | "division" |
"portfolio"`. Two booleans would permit a meaningless both-true state. A
portfolio lead sees one entry, "My Portfolio", and nothing else.

### Leadership access

`/portfolio/[manager]` for manager-and-above, so Josh can see what Emily sees —
the same pattern as the Divisions tab, guarded the same way.

## Testing

No test framework in this repo; verification is throwaway `tsx` scripts run
against live data, as with the Clients-page and bonus-basis work. Assertions:

1. Portfolio revenue ties to the sum of its clients' divisional contributions.
2. A downsell books as partial churn, not a full loss.
3. Renewal rolling handles a 3-month deal started 9 months ago (returns the next
   future date, not a past one).
4. One-off and Month-to-Month produce no renewal date.
5. NRR exceeds GRR whenever the cohort contains an upsell; they are equal when it
   does not.
6. `portfolio_lead` cannot satisfy `hasRole(..., "viewer")`.
7. Coverage banner reports the true tagged/total ratio.

## Sequencing

1. **Sync `client_manager`** into the DB — unblocked, and makes the backfill
   visible in the tool as it happens.
2. **Backfill in HubSpot** — Josh. Gates everything downstream.
3. **`portfolio.ts` + page** — build against real coverage.

## Open questions

- Is Emily's book genuinely confined to Ad Creative? `account_managers` put her
  on two Social Media clients. The portfolio model makes this moot — it spans
  whatever divisions her clients sit in — but it is worth confirming the brief.
- Should other client managers get portfolios? The design supports it; only
  Emily's is in scope here.

## Out of scope

- Splitting LTV by division (needs per-deal historical attribution).
- Reading portfolio ownership from Monday. 200+ boards, one per client, no master
  mapping; HubSpot is cheaper and more durable.
