import { db } from "@/lib/db";

export const COST_REALLOCATION_PROVIDER = "cost_reallocation";

/**
 * One person whose pay sits in the wrong account.
 *
 * Swan's chart of accounts books some divisional staff to a shared salary line
 * — in September, three of the five Ads Management people were paid out of
 * "Salaries and wages - Overheads", leaving that division looking twice as
 * profitable as the others. The account itself is genuinely mixed, so an
 * account-level override can't help: moving the whole line would drag real
 * overhead into a division.
 *
 * So the reallocation is per PERSON. Their cost comes from the roster, which
 * means it tracks pay rises instead of freezing a number someone typed once,
 * and the destination is their own division rather than a second thing to keep
 * in sync.
 *
 * This moves money between divisions for reporting. It never changes a total:
 * what leaves the source account is exactly what arrives at the destination,
 * so the agency's cost base is identical before and after.
 */
export interface ReallocationEntry {
  teamMemberId: string;
  /** The Xero account their pay actually sits in. */
  fromAccount: string;
}

export interface ResolvedReallocation extends ReallocationEntry {
  memberName: string;
  /** The member's own division — where the cost belongs. */
  toDivision: string;
  monthlyCost: number;
}

/** Monthly cost of a roster member, salaried or hourly. */
export function monthlyCostOf(m: {
  annualSalary?: number | null;
  hourlyRate?: number | null;
  weeklyHours?: number | null;
}): number {
  if (m.annualSalary) return m.annualSalary / 12;
  return ((m.hourlyRate ?? 0) * (m.weeklyHours ?? 0) * 52) / 12;
}

export async function readReallocationEntries(): Promise<ReallocationEntry[]> {
  const row = await db.integrationConfig.findUnique({
    where: { provider: COST_REALLOCATION_PROVIDER },
  });
  if (!row?.configJson || row.configJson === "{}") return [];
  try {
    const parsed = JSON.parse(row.configJson) as { entries?: ReallocationEntry[] };
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

/**
 * The configured reallocations, priced from the current roster.
 *
 * Entries naming someone who has left, or who has no division, are dropped —
 * a reallocation to nowhere would silently delete cost from the agency total.
 */
export async function getResolvedReallocations(): Promise<ResolvedReallocation[]> {
  const entries = await readReallocationEntries();
  if (entries.length === 0) return [];

  const members = await db.teamMember.findMany({
    where: { id: { in: entries.map((e) => e.teamMemberId) } },
    select: {
      id: true, name: true, division: true, active: true,
      annualSalary: true, hourlyRate: true, weeklyHours: true,
    },
  });
  const byId = new Map(members.map((m) => [m.id, m]));

  const out: ResolvedReallocation[] = [];
  for (const e of entries) {
    const m = byId.get(e.teamMemberId);
    if (!m || !m.active || !m.division) continue;
    const cost = monthlyCostOf(m);
    if (cost <= 0) continue;
    out.push({
      ...e,
      memberName: m.name,
      toDivision: m.division,
      monthlyCost: cost,
    });
  }
  return out;
}

/**
 * Apply reallocations to one month's division cost map, in place.
 *
 * `divisionOfAccount` says which division the source account currently feeds,
 * so the money is taken from where it actually landed. A move is skipped when
 * the source division doesn't hold enough that month — a part-month of payroll,
 * or a month before the person joined — because taking more than is there would
 * invent a negative cost and quietly inflate the agency's margin.
 */
export function applyReallocations(
  costByDivision: Map<string, number>,
  reallocations: ResolvedReallocation[],
  divisionOfAccount: (account: string) => { division: string; weight: number }[]
): void {
  for (const r of reallocations) {
    if (r.toDivision === "Shared/Overhead") continue;
    for (const { division: from, weight } of divisionOfAccount(r.fromAccount)) {
      if (from === r.toDivision) continue;
      const move = r.monthlyCost * weight;
      const available = costByDivision.get(from) ?? 0;
      if (available < move) continue;
      costByDivision.set(from, available - move);
      costByDivision.set(r.toDivision, (costByDivision.get(r.toDivision) ?? 0) + move);
    }
  }
}
