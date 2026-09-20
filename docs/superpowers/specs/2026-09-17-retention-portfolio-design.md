# Client Success — a cut of Ad Creative

**Date:** 2026-09-17, revised 2026-09-20
**Status:** scaffolding built; metrics pending the backfill
**For:** Emily Heinhuis, client servicing lead (emily@swan.studio)

## What this is

Client Success is a **view over Ad Creative**, scoped to the clients Emily
manages. It is a tab, not a division. It changes who can see what and nothing
else — no divisional total, no agency figure, no bonus baseline moves.

An earlier revision of this document modelled it as a standalone portfolio
spanning divisions. Josh corrected the scope on 2026-09-20: it is only a cut of
Ad Creative, and must not affect any other calculation in the tool.

## Why it is not a division key

`DIVISION_KEYS` drives the divisional totals on `/divisions`. Emily's clients are
already counted inside Ad Creative, so adding a fourth key would:

- overstate the agency book by exactly the size of the cut, and
- move the Ad Creative baseline Vitor's bonus tiers were set against
  ($4,840,000 cumulative and up).

So `DIVISION_VIEWS` is a separate list. A view carries a `baseDivision` and a
`clientManager`, and `resolveScope()` turns either a division key or a view key
into the division to read plus an optional manager filter.

Verified invariant: each division's dashboard total still ties to the client
book's `divisionRevenue` with the view in place.

## Data foundation

### Source of truth: `client_manager`

HubSpot carries three candidate properties. Measured against the 87 live
closed-won deals on 2026-09-16:

| Property | Label | Filled | Emily |
|---|---|---|---|
| `account_manager` | "Executor" | 64/87 (74%) | 0 clients |
| `account_managers` | "Account Managers" | 28/87 (32%) | 4 clients |
| `client_manager` | "Client Manager" | 28/87 (32%) | 2 clients |

`client_manager` is the chosen source: full-name options matching the other
people-fields, and it names the retention role rather than the delivery one.
`account_manager` is mis-labelled — "Executor" is the production owner, and
Emily appears on none of them.

The two candidate fields name **disjoint** client sets for Emily, so there is no
way to reconcile them from the data. One had to be chosen; the other keeps its
current meaning.

### The backfill dependency

**This is the only thing standing between the scaffolding and real numbers.**
`clientManager` is populated on 60 of 963 synced deals — 29 live ones, of which
Emily holds 2 (Hello Fresh AU and NZ, $17,250 ex-GST).

Every retention metric below is computed on whatever subset is tagged. A
retention rate derived from part of a book is not approximately right, it is
arbitrary. Until the backfill lands, the page must state its own coverage.

## Built

- `HubspotDeal.clientManager`, nullable, applied to Supabase 2026-09-20.
- Synced from the HubSpot `client_manager` property in `refresh-syncs.ts`.
- `DIVISION_VIEWS` / `resolveScope()` in `divisions.ts`.
- `getDivisionDashboard(division, months, { clientManager })` — an optional
  filter. Division resolution still runs over the whole book, so a cut inherits
  the division its deals already had rather than re-deciding it.
- `/division?d=Client Success` renders the cut; `/divisions` shows it under
  "Cuts", excluded from the divisional total and labelled as counted within
  Ad Creative.
- `emily@swan.studio` provisions as `division_lead` scoped to Client Success via
  the Google access list. Her account is created on first sign-in.

### Bonus plans

A view has no plan of its own. `getDivisionBonusPlan` is skipped for a view —
paying a cut's lead against the whole division's tiers would be wrong in both
directions.

## Pending — retention metrics

To build once coverage is real. All ex-GST, reusing the existing gates
(`excludedClientIds`, `isOneOff`, upsell folding, downsell pairing) so the cut
reconciles to Ad Creative rather than forming a second version of truth.

| Metric | Definition |
|---|---|
| Average tenure | Mean months from `startDate` to now across live clients |
| Upcoming renewals | `startDate` + `contractTerms`, rolled forward past today |
| Upsells per month | Deals passing `isUpsell()` within the cut, by month |
| Logo retention | Companies live at period end ÷ companies live at period start, by quarter. Clients won *during* the quarter are excluded from both sides, so acquisition never flatters retention |
| Gross revenue retention | Revenue retained from the starting cohort, churn and downsells counted, upsells excluded; capped at 100% |
| Net revenue retention | As GRR but upsells counted; uncapped |
| Coverage banner | Tagged live deals ÷ total live deals, shown until it reaches 100% |

Revenue, client count and new-vs-churn already come free from the division
dashboard the cut reuses.

### Why both GRR and NRR

Logo retention alone hides the thing worth knowing. A book can run 80% logo
retention and still clear 100% NRR if the kept clients grew — that distinction is
the entire argument for a retention lead, and neither number shows it alone.
Churned revenue is reported beside churned count for the same reason: one $15k
client leaving is not the same event as one $2k client leaving.

### Renewals

`contract_terms` holds `3 - month` (42), `6 - month` (24), `One-off` (4),
`Month to Month` (2) — 83% filled, so no new field is needed. Next renewal is
`startDate` plus whole terms until the result is in the future. **One-off never
renews and Month-to-Month renews continuously — both are excluded rather than
given a fabricated date.**

### Client identity

A retention rate is a ratio of client counts, so this must be settled first.

`client-book.ts` groups by company (`clientId`, else normalised company name);
`division-dashboard.ts` keys on `clientId ?? dealId`, so a company with no Client
record and two live deals counts as **two clients** there. Blossom, Everyplate,
Ipanema, Funding and BowWowMeow fall in that gap.

Retention must group by **company** — "we kept the client" is a statement about a
company, not a contract. A company holding two deals that drops one is a
downsell, not a churn, and a deal-keyed count would record a lost client and
understate retention. The cut currently inherits the dashboard's deal-keyed
grouping, which is correct for revenue and wrong for retention; the retention
functions must do their own company-level grouping.

This inconsistency is pre-existing and is not fixed here.

## Testing

No test framework in this repo; verification is throwaway `tsx` scripts against
live data. Assertions already passing:

- Each division's dashboard still ties to the client book with the view in place.
- `DIVISION_KEYS` holds 3; `isDivisionKey("Client Success")` is false.
- The cut is a strict subset of Ad Creative, and every client in it is already an
  Ad Creative client.
- An unrecognised scope resolves to null, so the page fails closed.
- Emily provisions as `division_lead` / Client Success; an unlisted swan.studio
  address still gets nothing.

To add with the metrics: downsell books as partial churn; renewal rolling
handles a 3-month deal started 9 months ago; One-off and Month-to-Month yield no
renewal date; NRR exceeds GRR whenever the cohort contains an upsell.

## Open

- Should other client managers get cuts? `DIVISION_VIEWS` is a list, so adding
  one is a single entry. Josh Israeli holds 24 live tagged deals and Dean
  Gruskin 3.
- Whether Emily's book is genuinely Ad Creative only. `account_managers` put her
  on two Social Media clients; `client_manager` currently does not.

## Out of scope

- Splitting LTV by division (needs per-deal historical attribution).
- Reading ownership from Monday: 200+ boards, one per client, no master mapping.
- Fixing the client-identity inconsistency between the two existing surfaces.
