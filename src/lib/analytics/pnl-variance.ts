import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";
import { directDivisionOf, DIVISIONS } from "./cost-allocation";
import { getDivisionDashboard } from "./division-dashboard";
import { getOneOffSales } from "./one-off-sales";
import { DIVISION_KEYS } from "@/lib/divisions";

/** Movement big enough to look at, in dollars AND in percent. Both apply, so a
 *  500% swing on a $240 account and a 2% slip on payroll both stay quiet. */
const MATERIAL_DOLLARS = 2_000;
const MATERIAL_PERCENT = 20;
/** Two accounts are a possible reclassification when they move in opposite
 *  directions, sit in the same division, and their sizes are within this much
 *  of each other. Compared smaller-over-larger so the test does not depend on
 *  which of the two is read first. */
const PAIR_TOLERANCE = 0.25;
/** Pairing only considers movements this large. Below it, two unrelated
 *  accounts drifting in opposite directions match by coincidence often enough
 *  to bury the real ones. */
const PAIR_FLOOR = 5_000;

export type Section = "revenue" | "cost";

export interface AccountRow {
  account: string;
  section: Section;
  current: number;
  prior: number;
  delta: number;
  /** null where the prior month was zero — a percentage off nothing is not a
   *  number anyone can read. */
  deltaPercent: number | null;
  division: string;
  /** Plain English, written next to the account. The whole point of the page is
   *  that a number and a percentage do not tell you whether to worry; this
   *  says what the movement looks like and what it probably is. */
  note: string;
  /** How loudly to say it. */
  tone: "neutral" | "watch" | "alert";
  /** What moved in HubSpot for this division that month. Context for the
   *  account's movement, not an explanation of it — Xero bills on invoice date
   *  and HubSpot holds contracted MRR, so the two will not tie exactly. */
  won: ClientMove[];
  lost: ClientMove[];
}

export type FindingKind =
  | "disappeared"
  | "appeared"
  | "sign_flip"
  | "moved"
  | "reclassification";

export interface Finding {
  kind: FindingKind;
  account: string;
  section: Section;
  delta: number;
  detail: string;
  /** The other half of a reclassification pair. */
  pairedWith?: string;
}

export interface ClientMove {
  name: string;
  amount: number;
}

export interface DivisionReconciliation {
  division: string;
  xeroRevenue: number;
  hubspotMrr: number;
  gap: number;
  /** The part of the gap one-off project work accounts for. */
  oneOff: number;
  /** Creator revenue — billed through Xero but never held in HubSpot as a
   *  deal, so it is a permanent and expected part of the gap rather than a
   *  discrepancy. It was the bulk of what the page first called unexplained. */
  creator: number;
  /** What is left once one-off work and creator revenue are taken out. This is
   *  the only part worth chasing. */
  unexplained: number;
  /** Which clients moved in HubSpot that month. A division's revenue changing
   *  is only interesting once you know who caused it. */
  won: ClientMove[];
  lost: ClientMove[];
}

export interface UnmatchedXeroClient {
  name: string;
  monthly: number;
}

export interface MonthHealth {
  month: string;
  label: string;
  costAccounts: number;
  /** Median cost-account count over the months before it. */
  typicalAccounts: number;
  /** The books look unfinished: far fewer accounts than usual, or it is the
   *  month we are standing in. */
  likelyOpen: boolean;
  reason: string | null;
}

export interface PnlVariance {
  month: string;
  monthLabel: string;
  priorMonth: string;
  priorLabel: string;
  /** Every month with P&L data, newest first, for the picker. */
  available: { month: string; label: string; likelyOpen: boolean }[];
  health: MonthHealth;
  priorHealth: MonthHealth;
  revenue: AccountRow[];
  costs: AccountRow[];
  findings: Finding[];
  reconciliation: DivisionReconciliation[];
  /** Billed on a Xero repeating invoice with no HubSpot deal behind it. Either
   *  the CRM is missing a deal, or the name does not match and needs an alias. */
  unmatchedXero: UnmatchedXeroClient[];
  totals: {
    revenue: { current: number; prior: number };
    cost: { current: number; prior: number };
  };
}

const prevMonthOf = (m: string): string => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const median = (ns: number[]): number => {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/**
 * One month of the Xero P&L against another, account by account.
 *
 * Two questions the tool could not answer before. Does this month look like the
 * last one — and where it does not, is that a real change or a bookkeeping
 * artefact? And does Xero agree with HubSpot about what each division billed?
 *
 * Costs use the DIRECT mapping, so every figure here ties to a P&L line. The
 * shared-cost allocation is an interpretation and has no place in a report
 * whose purpose is reconciliation.
 */
export async function getPnlVariance(month?: string): Promise<PnlVariance> {
  const [incomeLines, costRecords] = await Promise.all([
    db.xeroPnlIncomeLine.findMany({ select: { month: true, account: true, amount: true } }),
    db.financialRecord.findMany({
      where: { source: "xero", type: "cost" },
      select: { month: true, category: true, amount: true },
    }),
  ]);

  const allMonths = [...new Set([...incomeLines.map((l) => l.month), ...costRecords.map((r) => r.month)])].sort();

  // How many cost accounts each month carries. A month far below the usual
  // count is almost certainly still being closed — September 2026 was missing
  // sixteen accounts including Payroll Tax, which flattered every margin.
  const accountsPerMonth = new Map<string, number>();
  for (const m of allMonths) {
    accountsPerMonth.set(m, new Set(costRecords.filter((r) => r.month === m).map((r) => r.category)).size);
  }

  const now = new Date();
  const thisCalendarMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const healthOf = (m: string): MonthHealth => {
    const count = accountsPerMonth.get(m) ?? 0;
    const earlier = allMonths.filter((x) => x < m).slice(-6).map((x) => accountsPerMonth.get(x) ?? 0);
    const typical = median(earlier);
    const thin = typical > 0 && count < typical * 0.7;
    const isCurrent = m === thisCalendarMonth;
    return {
      month: m,
      label: formatMonth(m),
      costAccounts: count,
      typicalAccounts: typical,
      likelyOpen: thin || isCurrent,
      reason: thin
        ? `${count} cost accounts against a usual ${typical} — the books look unfinished`
        : isCurrent
          ? "the month is still running"
          : null,
    };
  };

  // Default to the newest month whose books look closed, so the page never
  // opens on a half-posted month reporting a fictional margin.
  const closed = allMonths.filter((m) => !healthOf(m).likelyOpen);
  const target = month && allMonths.includes(month) ? month : closed[closed.length - 1] ?? allMonths[allMonths.length - 1];
  const prior = prevMonthOf(target);

  const build = (section: Section): AccountRow[] => {
    const cur = new Map<string, number>();
    const pri = new Map<string, number>();
    if (section === "revenue") {
      for (const l of incomeLines) {
        if (l.month === target) cur.set(l.account, (cur.get(l.account) ?? 0) + l.amount);
        if (l.month === prior) pri.set(l.account, (pri.get(l.account) ?? 0) + l.amount);
      }
    } else {
      for (const r of costRecords) {
        const a = r.category ?? "";
        if (!a) continue;
        if (r.month === target) cur.set(a, (cur.get(a) ?? 0) + r.amount);
        if (r.month === prior) pri.set(a, (pri.get(a) ?? 0) + r.amount);
      }
    }
    const accounts = [...new Set([...cur.keys(), ...pri.keys()])];
    return accounts
      .map((account) => {
        const c = Math.round(cur.get(account) ?? 0);
        const p = Math.round(pri.get(account) ?? 0);
        return {
          account,
          section,
          current: c,
          prior: p,
          delta: c - p,
          deltaPercent: p !== 0 ? Number((((c - p) / Math.abs(p)) * 100).toFixed(1)) : null,
          division: directDivisionOf(account),
          note: "",
          tone: "neutral" as const,
          won: [],
          lost: [],
        };
      })
      // Biggest movers first: a report of 59 accounts is only useful if the
      // ones that moved are at the top.
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  };

  const revenue = build("revenue");
  const costs = build("cost");

  // Client movement per division, attached to the revenue accounts that belong
  // to it. A creator account has no clients behind it, so it gets none.
  const movementByDivision = new Map<string, { won: ClientMove[]; lost: ClientMove[] }>();
  for (const key of DIVISION_KEYS) {
    const dash = await getDivisionDashboard(key, 24);
    const row = dash.months.find((m) => m.month === target);
    movementByDivision.set(key, {
      won: (row?.newClients ?? []).map((c) => ({ name: c.name.trim(), amount: c.revenue })),
      lost: (row?.churnedClients ?? []).map((c) => ({ name: c.name.trim(), amount: c.revenue })),
    });
  }
  for (const r of revenue) {
    if (isCreatorAccount(r.account)) continue;
    const mv = movementByDivision.get(r.division);
    if (!mv) continue;
    r.won = mv.won;
    r.lost = mv.lost;
  }

  const findings = detectFindings([...revenue, ...costs]);
  annotate(revenue, findings);
  annotate(costs, findings);

  // Xero billed against HubSpot contracted, per division.
  const oneOff = await getOneOffSales(18);
  const oneOffThisMonth = oneOff.months.find((m) => m.month === target);
  const reconciliation: DivisionReconciliation[] = [];
  for (const key of DIVISION_KEYS) {
    const xeroRevenue = Math.round(
      revenue.filter((r) => r.division === key).reduce((s, r) => s + r.current, 0)
    );
    const dash = await getDivisionDashboard(key, 24);
    const hubspotMrr = dash.months.find((m) => m.month === target)?.revenue ?? 0;
    const oneOffForDivision = Math.round(
      (oneOffThisMonth?.deals ?? [])
        .filter((d) => divisionOfPackage(d.division) === key)
        .reduce((s, d) => s + d.revenue, 0)
    );
    const creator = Math.round(
      revenue
        .filter((r) => r.division === key && isCreatorAccount(r.account))
        .reduce((s2, r) => s2 + r.current, 0)
    );
    const gap = xeroRevenue - hubspotMrr;
    const monthRow = dash.months.find((m) => m.month === target);
    reconciliation.push({
      division: key,
      xeroRevenue,
      hubspotMrr,
      gap,
      oneOff: oneOffForDivision,
      creator,
      unexplained: gap - oneOffForDivision - creator,
      won: (monthRow?.newClients ?? []).map((c) => ({ name: c.name.trim(), amount: c.revenue })),
      lost: (monthRow?.churnedClients ?? []).map((c) => ({ name: c.name.trim(), amount: c.revenue })),
    });
  }

  // Anything Xero bills on a repeating invoice that no HubSpot deal matches.
  // Some of these are genuinely missing from the CRM and some are only a name
  // the matcher cannot resolve — both are worth seeing, and the page says so
  // rather than asserting which.
  const [reconRows, repeating] = await Promise.all([
    db.reconciliation.findMany({
      where: { xeroRepeatingInvoiceId: { not: null } },
      select: { xeroRepeatingInvoiceId: true },
    }),
    db.xeroRepeatingInvoice.findMany({
      where: { status: "AUTHORISED", type: "ACCREC" },
      select: { id: true, xeroContactName: true, subTotal: true, scheduleUnit: true, scheduleInterval: true },
    }),
  ]);
  const matched = new Set(reconRows.map((r) => r.xeroRepeatingInvoiceId));
  const unmatchedXero: UnmatchedXeroClient[] = repeating
    .filter((r) => !matched.has(r.id))
    .map((r) => ({
      name: r.xeroContactName ?? "(no contact)",
      monthly: Math.round(monthlyFrom(r.subTotal ?? 0, r.scheduleUnit, r.scheduleInterval)),
    }))
    .filter((r) => r.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);

  return {
    month: target,
    monthLabel: formatMonth(target),
    priorMonth: prior,
    priorLabel: formatMonth(prior),
    available: allMonths
      .slice()
      .reverse()
      .map((m) => ({ month: m, label: formatMonth(m), likelyOpen: healthOf(m).likelyOpen })),
    health: healthOf(target),
    priorHealth: healthOf(prior),
    revenue,
    costs,
    findings,
    reconciliation,
    unmatchedXero,
    totals: {
      revenue: {
        current: revenue.reduce((s, r) => s + r.current, 0),
        prior: revenue.reduce((s, r) => s + r.prior, 0),
      },
      cost: {
        current: costs.reduce((s, r) => s + r.current, 0),
        prior: costs.reduce((s, r) => s + r.prior, 0),
      },
    },
  };
}

/**
 * Write the sentence that sits beside each account.
 *
 * A finding already says what is unusual, so it wins. Otherwise the note
 * describes the movement in proportion to its size, and says plainly when there
 * is nothing to see — a blank cell reads as missing data, not as a quiet month.
 */
function annotate(rows: AccountRow[], findings: Finding[]): void {
  const byAccount = new Map<string, Finding>();
  for (const f of findings) {
    // Findings arrive in priority order, so the first one for an account is the
    // most important thing to say about it.
    if (!byAccount.has(f.account)) byAccount.set(f.account, f);
    if (f.pairedWith && !byAccount.has(f.pairedWith)) {
      byAccount.set(f.pairedWith, { ...f, account: f.pairedWith, pairedWith: f.account });
    }
  }

  for (const r of rows) {
    const f = byAccount.get(r.account);
    if (f) {
      r.tone = f.kind === "moved" || f.kind === "reclassification" ? "watch" : "alert";
      r.note =
        f.kind === "reclassification"
          ? `Looks like a reclassification: ${money(Math.abs(r.delta))} moved ${r.delta < 0 ? "out of" : "into"} this account while ${f.pairedWith} moved the other way by a similar amount. Probably one event, not two.`
          : f.kind === "disappeared"
            ? `Nothing posted this month, against ${money(r.prior)} last month. Usually a closing issue rather than a real change — and it flatters the margin until it is posted.`
            : f.kind === "appeared"
              ? `First time this account has been used. Worth knowing what it is before it becomes part of the baseline.`
              : f.kind === "sign_flip"
                ? `Went from ${money(r.prior)} to ${money(r.current)} — a credit, a refund or a correction rather than ordinary spend.`
                : `${r.delta > 0 ? "Up" : "Down"} ${money(Math.abs(r.delta))}, ${Math.abs(r.deltaPercent ?? 0)}% on last month. Big enough to be deliberate; worth knowing which.`;
      continue;
    }
    if (r.delta === 0) {
      r.tone = "neutral";
      r.note = r.current === 0 ? "No activity in either month." : "Unchanged on last month.";
      continue;
    }
    r.tone = "neutral";
    const pct = r.deltaPercent === null ? "" : `, ${Math.abs(r.deltaPercent)}%`;
    r.note = `${r.delta > 0 ? "Up" : "Down"} ${money(Math.abs(r.delta))}${pct} — within normal movement.`;
  }
}

/**
 * Creator revenue sits in its own Xero accounts and has no HubSpot deal behind
 * it — it is talent billing, not a client retainer. Treating it as part of the
 * unexplained gap made Ad Creative look $69,422 adrift when the real figure is
 * $9,928.
 */
function isCreatorAccount(account: string): boolean {
  return /content creator/i.test(account);
}

/** Any Xero schedule expressed per month, so it compares to a HubSpot retainer. */
function monthlyFrom(subTotal: number, unit: string | null, interval: number | null): number {
  const i = interval ?? 1;
  if (unit === "WEEKLY") return (subTotal / i) * (52 / 12);
  if (unit === "YEARLY") return subTotal / (12 * i);
  return subTotal / i; // MONTHLY, and the safest default for anything unknown
}

/** The package type a one-off was sold as, mapped to the division that ran it. */
function divisionOfPackage(packageType: string): string {
  const p = packageType.toLowerCase();
  if (p.includes("social")) return "Social Media Management";
  if (p.includes("meta") || p.includes("ads")) return "Ads Management";
  return "Content Delivery";
}

/**
 * What is worth a second look, in the order it is worth looking.
 *
 * A disappeared account outranks a large movement: a line that simply stopped
 * being posted is usually a closing problem rather than a business event, and
 * it is the failure that silently flatters a margin.
 */
function detectFindings(rows: AccountRow[]): Finding[] {
  const out: Finding[] = [];

  for (const r of rows) {
    if (r.prior !== 0 && r.current === 0) {
      out.push({
        kind: "disappeared",
        account: r.account,
        section: r.section,
        delta: r.delta,
        detail: `posted ${money(r.prior)} last month and nothing this month`,
      });
      continue;
    }
    if (r.prior === 0 && Math.abs(r.current) >= MATERIAL_DOLLARS) {
      out.push({
        kind: "appeared",
        account: r.account,
        section: r.section,
        delta: r.delta,
        detail: `first appearance, at ${money(r.current)}`,
      });
      continue;
    }
    if (r.prior !== 0 && r.current !== 0 && Math.sign(r.prior) !== Math.sign(r.current)) {
      out.push({
        kind: "sign_flip",
        account: r.account,
        section: r.section,
        delta: r.delta,
        detail: `${money(r.prior)} to ${money(r.current)} — a credit or a correction`,
      });
      continue;
    }
    if (
      Math.abs(r.delta) >= MATERIAL_DOLLARS &&
      r.deltaPercent !== null &&
      Math.abs(r.deltaPercent) >= MATERIAL_PERCENT
    ) {
      out.push({
        kind: "moved",
        account: r.account,
        section: r.section,
        delta: r.delta,
        detail: `${money(r.prior)} to ${money(r.current)}, ${r.deltaPercent > 0 ? "up" : "down"} ${Math.abs(r.deltaPercent)}%`,
      });
    }
  }

  // Offsetting pairs within a section. Ad Creative +$35,033 against Content
  // Creator (Ad Creative) −$44,618 is one event, and reporting the two lines
  // separately invites chasing a change that never happened.
  const paired = new Set<string>();
  for (const section of ["revenue", "cost"] as Section[]) {
    const movers = rows.filter((r) => r.section === section && Math.abs(r.delta) >= PAIR_FLOOR);
    for (let i = 0; i < movers.length; i++) {
      const a = movers[i];
      if (paired.has(a.account)) continue;
      let best: { row: AccountRow; closeness: number } | null = null;
      for (let j = 0; j < movers.length; j++) {
        if (i === j) continue;
        const b = movers[j];
        if (paired.has(b.account)) continue;
        if (Math.sign(a.delta) === Math.sign(b.delta)) continue;
        // Money moving between accounts stays inside the division it belongs
        // to. Without this, two unrelated overheads drifting opposite ways
        // read as a reclassification.
        if (a.division !== b.division) continue;
        const closeness = Math.min(Math.abs(a.delta), Math.abs(b.delta)) / Math.max(Math.abs(a.delta), Math.abs(b.delta));
        if (closeness < 1 - PAIR_TOLERANCE) continue;
        if (!best || closeness > best.closeness) best = { row: b, closeness };
      }
      if (!best) continue;
      paired.add(a.account);
      paired.add(best.row.account);
      out.push({
        kind: "reclassification",
        account: a.account,
        pairedWith: best.row.account,
        section,
        delta: a.delta + best.row.delta,
        detail: `${a.account} ${signed(a.delta)} against ${best.row.account} ${signed(best.row.delta)} — net ${signed(a.delta + best.row.delta)}, so this may be one movement between accounts rather than two changes`,
      });
    }
  }

  const order: Record<FindingKind, number> = {
    disappeared: 0,
    sign_flip: 1,
    appeared: 2,
    reclassification: 3,
    moved: 4,
  };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || Math.abs(b.delta) - Math.abs(a.delta));
}

const money = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const signed = (n: number) =>
  `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString()}`;
