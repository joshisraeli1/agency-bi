import { db } from "@/lib/db";
import { foldUpsells, isUpsell, isOneOff } from "./upsells";
import { getExcludedClientIds } from "./excluded-clients";

export const DIVISION_GOALS_PROVIDER = "division_goals";

// Monthly revenue goals per package/division (editable in-app)
export const DEFAULT_DIVISION_GOALS: Record<string, number> = {
  "Content Delivery Paid": 400_000,
  "Social Media Management": 100_000,
  "Ads Management": 100_000,
};

export async function getDivisionGoals(): Promise<Record<string, number>> {
  const row = await db.integrationConfig.findUnique({ where: { provider: DIVISION_GOALS_PROVIDER } });
  const goals = { ...DEFAULT_DIVISION_GOALS };
  if (row?.configJson && row.configJson !== "{}") {
    try {
      const g = JSON.parse(row.configJson) as Record<string, unknown>;
      for (const k of Object.keys(goals)) {
        if (typeof g[k] === "number" && (g[k] as number) > 0) goals[k] = g[k] as number;
      }
    } catch {
      // defaults
    }
  }
  return goals;
}

export interface PackageDeal {
  name: string;
  revenue: number; // monthly ex-GST
}

export interface PackageTypeRow {
  packageType: string;
  count: number;
  revenue: number; // monthly, ex-GST
  deals: PackageDeal[]; // deals under this package type (for drill-down)
}

export interface ActiveRevenueSnapshot {
  dealCount: number;
  monthlyRevenueIncGst: number; // sum of closed-won deal Amount (inc-GST) — matches HubSpot
  monthlyRevenueExGst: number; // sum of closed-won deal ex-GST property
  byPackageType: PackageTypeRow[];
}

export interface RevenueCompositionRow {
  packageType: string;
  total: number;
  existing: number;
  newRevenue: number;
  upsell: number;
  newDeals: { name: string; revenue: number; month: string }[];
  upsellDeals: { name: string; revenue: number }[];
}

export interface RevenueCompositionFY {
  fy: string; // label, e.g. "FY26/27"
  rows: RevenueCompositionRow[];
}

// AU financial year (Jul–Jun): the FY-start calendar year of a given month.
function fyStartYearOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return m >= 7 ? y : y - 1;
}
const fyLabelOf = (startYear: number): string =>
  `FY${String(startYear).slice(2)}/${String(startYear + 1).slice(2)}`;

/**
 * Composition of each package type's closed-won revenue (ex-GST) split into
 * established base vs new deals won during a financial year vs upsells
 * (expansion), computed for every FY that has activity. The consumer picks a FY
 * via a toggle: "new" = deals whose start month falls in that FY, "existing" =
 * the rest of the recurring book, "upsell" = expansion (constant across FYs).
 * One-off / ad-hoc deals are excluded. Totals equal the current book regardless
 * of the selected FY. Newest FY first.
 */
export async function getRevenueComposition(): Promise<{ byFY: RevenueCompositionFY[] }> {
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { stage: "closed_won" },
      select: { clientId: true, name: true, contentPackageType: true, packageDescription: true, amount: true, amountExGst: true, startDate: true, closeDate: true },
    }),
  ]);

  const monthOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
  // Ad-hoc shoots etc. are one-time work — treat as non-recurring even when
  // they're mistagged "Upsell" in HubSpot.
  const isAdHoc = (name: string) => /ad[\s-]?hoc/i.test(name);

  // First pass: keep only recurring deals, tag each with pkg, ex-GST, upsell,
  // and (for non-upsells) the FY its start month belongs to. Collect FY options.
  type Tagged = { pkg: string; name: string; ex: number; month: string; upsell: boolean; fy: number | null };
  const tagged: Tagged[] = [];
  const fyYears = new Set<number>();
  const now = new Date();
  const currentFy = fyStartYearOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  fyYears.add(currentFy);

  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    if (isOneOff(d) || isAdHoc(d.name)) continue;
    const ex = d.amountExGst ?? 0;
    if (ex <= 0) continue;
    const pkg = classifyPackageType(d.contentPackageType);
    const month = monthOf(d.startDate ?? d.closeDate) ?? "";
    const upsell = isUpsell(d);
    const fy = upsell || !month ? null : fyStartYearOf(month);
    if (fy !== null) fyYears.add(fy);
    tagged.push({ pkg, name: d.name, ex, month, upsell, fy });
  }

  const order = ["Content Delivery Paid", "Social Media Management", "Ads Management"];
  const fyList = Array.from(fyYears).sort((a, b) => b - a); // newest first

  const byFY: RevenueCompositionFY[] = fyList.map((selYear) => {
    const byPkg = new Map<string, RevenueCompositionRow>();
    for (const t of tagged) {
      const row = byPkg.get(t.pkg) ?? { packageType: t.pkg, total: 0, existing: 0, newRevenue: 0, upsell: 0, newDeals: [], upsellDeals: [] };
      row.total += t.ex;
      if (t.upsell) {
        row.upsell += t.ex;
        row.upsellDeals.push({ name: t.name, revenue: Math.round(t.ex) });
      } else if (t.fy === selYear) {
        row.newRevenue += t.ex;
        row.newDeals.push({ name: t.name, revenue: Math.round(t.ex), month: t.month });
      } else {
        row.existing += t.ex;
      }
      byPkg.set(t.pkg, row);
    }
    const rows = Array.from(byPkg.values())
      .map((r) => ({
        ...r,
        total: Math.round(r.total),
        existing: Math.round(r.existing),
        newRevenue: Math.round(r.newRevenue),
        upsell: Math.round(r.upsell),
        newDeals: r.newDeals.sort((a, b) => b.revenue - a.revenue),
        upsellDeals: r.upsellDeals.sort((a, b) => b.revenue - a.revenue),
      }))
      .sort((a, b) => order.indexOf(a.packageType) - order.indexOf(b.packageType));
    return { fy: fyLabelOf(selYear), rows };
  });

  return { byFY };
}

/**
 * Average tenure (in months) of the agency's currently-active clients — how
 * long each active client has been with us, from their earliest active deal's
 * start date to now, averaged across clients (deduped by client, so a client
 * with several deals counts once). Excludes excluded clients.
 */
export async function getAvgClientTenureMonths(): Promise<{ months: number; clientCount: number }> {
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { stage: "closed_won" },
      select: { id: true, clientId: true, startDate: true, closeDate: true, churnDate: true },
    }),
  ]);
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

  // Earliest active-deal start per client (fall back to deal id when a deal has
  // no linked client).
  const startByClient = new Map<string, Date>();
  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const start = d.startDate ?? d.closeDate;
    if (!start) continue;
    const startKey = monthOf(start)!;
    const churnKey = monthOf(d.churnDate);
    const active = curKey >= startKey && (!churnKey || curKey < churnKey);
    if (!active) continue;
    const key = d.clientId ?? `deal:${d.id}`;
    const existing = startByClient.get(key);
    if (!existing || start < existing) startByClient.set(key, start);
  }

  const tenures = Array.from(startByClient.values()).map(
    (start) => (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  );
  const clientCount = tenures.length;
  const months = clientCount > 0 ? Math.round((tenures.reduce((s, t) => s + t, 0) / clientCount) * 10) / 10 : 0;
  return { months, clientCount };
}

/**
 * Revenue (ex-GST) by package type for deals ACTIVE in a given month, using the
 * historically-correct deal set — closed-won OR since-churned — so past months
 * aren't understated by survivorship (a client active last July that has since
 * churned still counts for last July). Excludes excluded clients and folds
 * upsells. Powers the "compare to last year" toggle.
 */
export async function getPackageRevenueByMonth(
  monthKey: string
): Promise<{ packageType: string; revenue: number; count: number }[]> {
  const [excludedIds, rawDeals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { OR: [{ stage: "closed_won" }, { churnDate: { not: null } }] },
      select: { clientId: true, name: true, stage: true, amount: true, amountExGst: true, contentPackageType: true, packageDescription: true, startDate: true, closeDate: true, churnDate: true },
    }),
  ]);
  const monthOf = (d: Date | null | undefined): string | null =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;
  const active = rawDeals.filter((d) => {
    if (d.clientId && excludedIds.has(d.clientId)) return false;
    const start = monthOf(d.startDate ?? d.closeDate);
    if (!start) return false;
    const churn = monthOf(d.churnDate);
    return monthKey >= start && (!churn || monthKey < churn);
  });
  const { deals } = foldUpsells(active);
  const byPkg = new Map<string, { revenue: number; count: number }>();
  for (const d of deals) {
    const pkg = classifyPackageType(d.contentPackageType);
    const r = byPkg.get(pkg) ?? { revenue: 0, count: 0 };
    r.revenue += d.amountExGst ?? 0;
    r.count += 1;
    byPkg.set(pkg, r);
  }
  return Array.from(byPkg.entries())
    .map(([packageType, r]) => ({ packageType, revenue: Math.round(r.revenue), count: r.count }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Maps raw HubSpot contentPackageType values to the three canonical service-line buckets used
 * across the app (matching HubSpot's Revenue by Package Type grouping). One-off / null /
 * unrecognized types all fall into "Content Delivery Paid".
 */
export function classifyPackageType(raw: string | null | undefined): string {
  const p = (raw || "").toLowerCase().trim();
  if (p === "social media" || p === "social media management") return "Social Media Management";
  if (p === "meta ads" || p === "ads management") return "Ads Management";
  if (p === "social and ads management") return "Ads Management"; // lean to Ads for the bar; split shown elsewhere
  return "Content Delivery Paid";
}

/**
 * Current snapshot of closed-won HubSpot deals — mirrors HubSpot's "Revenue Summary" +
 * "Revenue by Package Type". Source of truth is the deal-level amounts (matching HubSpot
 * exactly), NOT a flat GST multiplier:
 *   - inc-GST = sum of each deal's Amount property (`amount`)
 *   - ex-GST  = sum of each deal's ex-GST property (`amountExGst`)
 * Counts every closed-won deal in the pipeline (HubSpot's closed-won total).
 */
export async function getActiveRevenueSnapshot(): Promise<ActiveRevenueSnapshot> {
  const rawDeals = await db.hubspotDeal.findMany({
    where: { stage: "closed_won" },
    select: { name: true, stage: true, amount: true, amountExGst: true, contentPackageType: true, packageDescription: true },
  });
  // Count the full closed-won book (matching HubSpot's "Revenue by Package
  // Type" / Revenue Summary) — inc-GST $642,059 / ex-GST $583,646. We do NOT
  // filter by churn here: a deal in the closed-won stage is treated as current
  // revenue even if it carries a churn date (churn-date-based exclusion belongs
  // on the time-series charts, not the headline book).
  // Fold upsells onto their base deal — an upsell is extra revenue for an
  // existing company, not a separate deal in the count / package breakdown.
  const { deals } = foldUpsells(rawDeals);

  const byPkg = new Map<string, { count: number; revenue: number; deals: PackageDeal[] }>();
  let totalInc = 0;
  let totalEx = 0;
  for (const d of deals) {
    const inc = d.amount ?? 0;
    const ex = d.amountExGst ?? 0;
    totalInc += inc;
    totalEx += ex;
    const pkg = classifyPackageType(d.contentPackageType);
    const row = byPkg.get(pkg) ?? { count: 0, revenue: 0, deals: [] };
    row.count++;
    row.revenue += ex;
    row.deals.push({ name: d.name, revenue: Math.round(ex) });
    byPkg.set(pkg, row);
  }

  const byPackageType = Array.from(byPkg.entries())
    .map(([packageType, r]) => ({
      packageType,
      count: r.count,
      revenue: Math.round(r.revenue),
      deals: r.deals.sort((a, b) => b.revenue - a.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    dealCount: deals.length,
    monthlyRevenueIncGst: Math.round(totalInc),
    monthlyRevenueExGst: Math.round(totalEx),
    byPackageType,
  };
}
