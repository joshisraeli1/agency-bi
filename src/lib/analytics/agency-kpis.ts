import { db } from "@/lib/db";
import { getMonthRange, toMonthKey, formatMonth } from "@/lib/utils";
import { getExcludedClientIds } from "./excluded-clients";
import type { AgencyKPIs, DivisionProfitabilityRow } from "./types";

const EXCLUDED_DIVISIONS = ["Unassigned", "NA", "Sales"];
const EXCLUDED_ROLES = ["Director", "BDM"];

export async function getAgencyKPIs(months = 6): Promise<AgencyKPIs> {
  const monthRange = getMonthRange(months);
  const startDate = new Date(`${monthRange[0]}-01`);

  const [financials, timeEntries, teamMembers, activeClients, allClients, settings, clients, excludedIds] =
    await Promise.all([
      db.financialRecord.findMany({
        where: { month: { in: monthRange } },
      }),
      db.timeEntry.findMany({
        where: { date: { gte: startDate } },
        include: { teamMember: true },
      }),
      db.teamMember.findMany({ where: { active: true } }),
      db.client.count({ where: { status: "active", OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }] } }),
      db.client.count({ where: { status: { not: "prospect" }, OR: [{ hubspotDealId: { not: null } }, { hubspotCompanyId: { not: null } }] } }),
      db.appSettings.findFirst(),
      db.client.findMany({
        select: {
          id: true, name: true, industry: true, status: true,
          hubspotDealId: true, hubspotCompanyId: true, retainerValue: true,
          contentPackageType: true,
        },
      }),
      getExcludedClientIds(),
    ]);

  const productiveHoursPerDay = settings?.productiveHours || 6.5;
  const workingDaysPerMonth = 22;
  const availableHoursPerMonth = productiveHoursPerDay * workingDaysPerMonth;
  const totalTeamMembers = teamMembers.length;

  // Billable members: exclude offshore without a division, Directors, BDMs
  const billableMembers = teamMembers.filter((m) => {
    const div = m.division || "Unassigned";
    const role = m.role || "";
    return !EXCLUDED_DIVISIONS.includes(div) && !EXCLUDED_ROLES.includes(role);
  });

  // Full-time billable members for revenue-per-head
  const fullTimeBillable = billableMembers.filter(
    (m) => m.employmentType === "full-time"
  );

  // Filter out excluded clients (prospects + legacy)
  const filteredFinancials = financials.filter((f) => !excludedIds.has(f.clientId));

  // Helper: check if a time entry's team member should be excluded from division analytics
  function isDivisionExcluded(entry: { teamMember?: { division?: string | null; role?: string | null } | null }): boolean {
    const div = entry.teamMember?.division || "Unassigned";
    const role = entry.teamMember?.role || "";
    return EXCLUDED_DIVISIONS.includes(div) || EXCLUDED_ROLES.includes(role);
  }

  // Total revenue: sum of HubSpot financial records over the period (ex-GST)
  const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;
  const totalRevenue = filteredFinancials
    .filter((f) => (f.type === "retainer" || f.type === "project") && f.source === "hubspot")
    .reduce((sum, f) => sum + f.amount, 0);

  // Cost: billable team salary cost over the period
  let monthlyBillableSalaryCost = 0;
  for (const m of billableMembers) {
    if (m.annualSalary) {
      monthlyBillableSalaryCost += m.annualSalary / 12;
    } else if (m.hourlyRate && m.weeklyHours) {
      monthlyBillableSalaryCost += m.hourlyRate * m.weeklyHours * 52 / 12;
    }
  }
  const totalCost = monthlyBillableSalaryCost * months;

  const avgMargin =
    totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;
  const revenuePerHead =
    fullTimeBillable.length > 0 ? totalRevenue / fullTimeBillable.length : 0;

  // Utilization (only billable members in denominator)
  const billableHours = timeEntries
    .filter((e) => !e.isOverhead)
    .reduce((sum, e) => sum + e.hours, 0);

  const totalAvailableHours =
    billableMembers.length * availableHoursPerMonth * months;
  const avgUtilization =
    totalAvailableHours > 0 ? (billableHours / totalAvailableHours) * 100 : 0;

  // Client retention (active / total)
  const clientRetention =
    allClients > 0 ? (activeClients / allClients) * 100 : 0;

  // Hours by division (exclude Directors, BDMs, Unassigned, NA, Sales)
  const divisionMap = new Map<string, number>();
  for (const entry of timeEntries) {
    if (isDivisionExcluded(entry)) continue;
    const div = entry.teamMember?.division || "Unassigned";
    divisionMap.set(div, (divisionMap.get(div) || 0) + entry.hours);
  }

  const hoursByDivision = Array.from(divisionMap.entries())
    .map(([division, hours]) => ({ division, hours }))
    .sort((a, b) => b.hours - a.hours);

  // Monthly trend
  const monthlyTrend = monthRange.map((month) => {
    const monthFinancials = filteredFinancials.filter((f) => f.month === month);
    const rev = monthFinancials
      .filter((f) => f.type === "retainer" || f.type === "project")
      .reduce((s, f) => s + f.amount, 0);
    const cost = monthFinancials
      .filter((f) => f.type === "cost")
      .reduce((s, f) => s + f.amount, 0);

    const monthEntries = timeEntries.filter(
      (e) => toMonthKey(e.date) === month
    );
    const monthBillable = monthEntries
      .filter((e) => !e.isOverhead)
      .reduce((s, e) => s + e.hours, 0);

    const monthAvail = billableMembers.length * availableHoursPerMonth;
    const util = monthAvail > 0 ? (monthBillable / monthAvail) * 100 : 0;
    const marginPct = rev > 0 ? ((rev - cost) / rev) * 100 : 0;

    return {
      month,
      utilization: util,
      margin: marginPct,
      revenue: rev,
    };
  });

  // Build client lookup
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  // Per-client division hour proportions (for allocating financials to divisions)
  const clientDivisionHours = new Map<string, Map<string, number>>();
  for (const entry of timeEntries) {
    if (!entry.clientId) continue;
    if (isDivisionExcluded(entry)) continue;
    const div = entry.teamMember?.division || "Unassigned";
    if (!clientDivisionHours.has(entry.clientId)) {
      clientDivisionHours.set(entry.clientId, new Map());
    }
    const divMap = clientDivisionHours.get(entry.clientId)!;
    divMap.set(div, (divMap.get(div) || 0) + entry.hours);
  }

  // Margin by Division: allocate each client's revenue/cost to divisions proportionally
  const divRevenue = new Map<string, number>();
  const divCost = new Map<string, number>();

  for (const fin of filteredFinancials) {
    const divHours = clientDivisionHours.get(fin.clientId);
    if (!divHours || divHours.size === 0) continue;
    const totalH = Array.from(divHours.values()).reduce((a, b) => a + b, 0);
    if (totalH === 0) continue;

    for (const [div, hours] of divHours) {
      const proportion = hours / totalH;
      if (fin.type === "retainer" || fin.type === "project") {
        divRevenue.set(div, (divRevenue.get(div) || 0) + fin.amount * proportion);
      } else if (fin.type === "cost") {
        divCost.set(div, (divCost.get(div) || 0) + fin.amount * proportion);
      }
    }
  }

  const allDivisions = new Set([...divRevenue.keys(), ...divCost.keys()]);
  const marginByDivision = Array.from(allDivisions)
    .map((division) => {
      const rev = divRevenue.get(division) || 0;
      const cost = divCost.get(division) || 0;
      const margin = rev - cost;
      return {
        division,
        revenue: Math.round(rev),
        cost: Math.round(cost),
        margin: Math.round(margin),
        marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Division Margin Over Time: same allocation per month
  const divisionNames = Array.from(allDivisions).sort();
  const divisionMarginTrend = monthRange.map((month) => {
    const monthFin = filteredFinancials.filter((f) => f.month === month);
    // Per-client division hours for this month only
    const monthClientDivHours = new Map<string, Map<string, number>>();
    for (const entry of timeEntries) {
      if (!entry.clientId || toMonthKey(entry.date) !== month) continue;
      if (isDivisionExcluded(entry)) continue;
      const div = entry.teamMember?.division || "Unassigned";
      if (!monthClientDivHours.has(entry.clientId)) {
        monthClientDivHours.set(entry.clientId, new Map());
      }
      const dm = monthClientDivHours.get(entry.clientId)!;
      dm.set(div, (dm.get(div) || 0) + entry.hours);
    }

    const mDivRev = new Map<string, number>();
    const mDivCost = new Map<string, number>();
    for (const fin of monthFin) {
      const dh = monthClientDivHours.get(fin.clientId);
      if (!dh || dh.size === 0) continue;
      const totalH = Array.from(dh.values()).reduce((a, b) => a + b, 0);
      if (totalH === 0) continue;
      for (const [div, hours] of dh) {
        const proportion = hours / totalH;
        if (fin.type === "retainer" || fin.type === "project") {
          mDivRev.set(div, (mDivRev.get(div) || 0) + fin.amount * proportion);
        } else if (fin.type === "cost") {
          mDivCost.set(div, (mDivCost.get(div) || 0) + fin.amount * proportion);
        }
      }
    }

    const row: Record<string, unknown> = { month: formatMonth(month) };
    for (const div of divisionNames) {
      const rev = mDivRev.get(div) || 0;
      const cost = mDivCost.get(div) || 0;
      row[div] = rev > 0 ? Number((((rev - cost) / rev) * 100).toFixed(1)) : 0;
    }
    return row;
  });

  // Client LTV by Industry (active clients only, skip unknown industry)
  const industryRevMap = new Map<string, number>();
  for (const fin of filteredFinancials) {
    if (fin.type !== "retainer" && fin.type !== "project") continue;
    const client = clientMap.get(fin.clientId);
    if (!client || client.status !== "active") continue;
    if (!client.industry) continue;
    industryRevMap.set(client.industry, (industryRevMap.get(client.industry) || 0) + fin.amount);
  }
  const clientLTVByIndustry = Array.from(industryRevMap.entries())
    .map(([industry, revenue]) => ({ industry, revenue: Math.round(revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // Client LTV by Division (based on contentPackageType from HubSpot)
  const divisionRevMap = new Map<string, number>();
  for (const c of clients) {
    if (c.status !== "active" || !c.hubspotDealId) continue;
    if (excludedIds.has(c.id)) continue;
    const rv = c.retainerValue ?? 0;
    if (rv <= 0) continue;
    const pkg = (c.contentPackageType || "").toLowerCase();
    let div = "Content Delivery";
    if (pkg === "social media" || pkg === "social media management") div = "Social Media Management";
    else if (pkg === "meta ads" || pkg === "ads management") div = "Ads Management";
    else if (pkg === "social and ads management") {
      divisionRevMap.set("Social Media Management", (divisionRevMap.get("Social Media Management") || 0) + rv * 0.5);
      divisionRevMap.set("Ads Management", (divisionRevMap.get("Ads Management") || 0) + rv * 0.5);
      continue;
    }
    divisionRevMap.set(div, (divisionRevMap.get(div) || 0) + rv);
  }
  const clientLTVByDivision = Array.from(divisionRevMap.entries())
    .map(([division, revenue]) => ({ division, revenue: Math.round(revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── HubSpot Profitability (financial records + team salary costs) ──
  // Revenue: allocate HubSpot financial records to divisions based on client's contentPackageType
  const clientPkgMap = new Map<string, string>();
  const clientsInDivision = new Map<string, Set<string>>();
  for (const c of clients) {
    clientPkgMap.set(c.id, (c.contentPackageType || "").toLowerCase());
  }

  function allocateToDivision(clientId: string, amount: number, divRevMap: Map<string, number>) {
    const pkg = clientPkgMap.get(clientId) || "";
    if (pkg === "social media" || pkg === "social media management") {
      divRevMap.set("Social Media Management", (divRevMap.get("Social Media Management") || 0) + amount);
      if (!clientsInDivision.has("Social Media Management")) clientsInDivision.set("Social Media Management", new Set());
      clientsInDivision.get("Social Media Management")!.add(clientId);
    } else if (pkg === "social and ads management") {
      divRevMap.set("Social Media Management", (divRevMap.get("Social Media Management") || 0) + amount * 0.5);
      divRevMap.set("Ads Management", (divRevMap.get("Ads Management") || 0) + amount * 0.5);
      if (!clientsInDivision.has("Social Media Management")) clientsInDivision.set("Social Media Management", new Set());
      if (!clientsInDivision.has("Ads Management")) clientsInDivision.set("Ads Management", new Set());
      clientsInDivision.get("Social Media Management")!.add(clientId);
      clientsInDivision.get("Ads Management")!.add(clientId);
    } else if (pkg === "meta ads" || pkg === "ads management") {
      divRevMap.set("Ads Management", (divRevMap.get("Ads Management") || 0) + amount);
      if (!clientsInDivision.has("Ads Management")) clientsInDivision.set("Ads Management", new Set());
      clientsInDivision.get("Ads Management")!.add(clientId);
    } else {
      divRevMap.set("Content Delivery", (divRevMap.get("Content Delivery") || 0) + amount);
      if (!clientsInDivision.has("Content Delivery")) clientsInDivision.set("Content Delivery", new Set());
      clientsInDivision.get("Content Delivery")!.add(clientId);
    }
  }

  const hubspotDivRevenue = new Map<string, number>();
  for (const f of filteredFinancials) {
    if (!((f.type === "retainer" || f.type === "project") && f.source === "hubspot")) continue;
    allocateToDivision(f.clientId, f.amount, hubspotDivRevenue);
  }

  // Cost: monthly salary per billable team member, grouped by division
  const DIVISION_NAMES = new Set(["Content Delivery (Paid)", "Social Media Management", "Ads Management"]);
  const normalizeDivision = (div: string): string | null => {
    if (div === "Content Delivery (Paid)") return "Content Delivery";
    if (div === "Social Media Management") return "Social Media Management";
    if (div === "Ads Management") return "Ads Management";
    return null;
  };

  const hubspotDivCost = new Map<string, number>();
  for (const m of billableMembers) {
    const div = m.division || "Unassigned";
    const mappedDiv = normalizeDivision(div);
    if (!mappedDiv) continue; // skip divisions not mapped (directors, sales, etc.)
    let monthlyCost = 0;
    if (m.annualSalary) {
      monthlyCost = m.annualSalary / 12;
    } else if (m.hourlyRate && m.weeklyHours) {
      monthlyCost = m.hourlyRate * m.weeklyHours * 52 / 12;
    }
    if (monthlyCost > 0) {
      // Multiply by months to match revenue which is summed over the full period
      hubspotDivCost.set(mappedDiv, (hubspotDivCost.get(mappedDiv) || 0) + monthlyCost * monthRange.length);
    }
  }

  const hubspotDivisions = new Set([...hubspotDivRevenue.keys(), ...hubspotDivCost.keys()]);
  const hubspotProfitability: DivisionProfitabilityRow[] = Array.from(hubspotDivisions)
    .map((division) => {
      const rev = hubspotDivRevenue.get(division) || 0;
      const cost = hubspotDivCost.get(division) || 0;
      const margin = rev - cost;
      const divClientCount = clientsInDivision.get(division)?.size || 0;
      return {
        division,
        revenue: Math.round(rev),
        cost: Math.round(cost),
        ratio: cost > 0 ? Number((rev / cost).toFixed(1)) : 0,
        marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(0)) : 0,
        clientCount: divClientCount,
        avgDealSize: divClientCount > 0 ? Math.round(rev / divClientCount) : 0,
      };
    })
    .filter((d) => d.revenue > 0 || d.cost > 0)
    .sort((a, b) => b.revenue - a.revenue);

  // ── Xero Profitability by Division ──
  const xeroRecords = await db.financialRecord.findMany({
    where: { source: "xero", month: { in: monthRange } },
    select: { type: true, category: true, amount: true },
  });

  // Division mapping for Xero P&L accounts
  const xeroDivisionMap: Record<string, string> = {
    // Social Media Management
    "xero-pnl:Social Media Management": "Social Media Management",
    "xero-pnl:Content Delivery (Organic)": "Social Media Management",
    "xero-pnl:COS - Content Delivery (Organic)": "Social Media Management",
    "xero-pnl:Wages - Social Media Management": "Social Media Management",
    "xero-pnl:Superannuation - Social Media Management": "Social Media Management",
    "xero-pnl:Subscriptions - SMM": "Social Media Management",
    // Content Delivery (Paid)
    "xero-pnl:Content Delivery (Paid)": "Content Delivery",
    "xero-pnl:Content Delivery (Plus)": "Content Delivery",
    "xero-pnl:Content Creator": "Content Delivery",
    "xero-pnl:COS - Content Delivery (Paid)": "Content Delivery",
    "xero-pnl:Wages - Content Delivery": "Content Delivery",
    "xero-pnl:Superannuation - Content Delivery": "Content Delivery",
    "xero-pnl:Subscriptions - Content Delivery Paid": "Content Delivery",
    "xero-pnl:Contractor - Video Editor": "Content Delivery",
    "xero-pnl:Contractor - Talent": "Content Delivery",
    "xero-pnl:Contractor - Talent Manager": "Content Delivery",
    // Ads Management
    "xero-pnl:Ads Management": "Ads Management",
    "xero-pnl:Social Meda & Ads Management": "Ads Management",
    "xero-pnl:COS - Ads MGMT": "Ads Management",
    "xero-pnl:Wages - Ads Management": "Ads Management",
    "xero-pnl:Superannuation - Ads Management": "Ads Management",
    "xero-pnl:Subscriptions - Ads MGMT": "Ads Management",
    "xero-pnl:Contractor - Ads Management": "Ads Management",
  };

  const xeroDivRevenue = new Map<string, number>();
  const xeroDivCost = new Map<string, number>();

  for (const r of xeroRecords) {
    const division = r.category ? xeroDivisionMap[r.category] : null;
    if (!division) continue; // overhead — not allocated to a division

    if (r.type === "retainer") {
      xeroDivRevenue.set(division, (xeroDivRevenue.get(division) || 0) + r.amount);
    } else if (r.type === "cost") {
      xeroDivCost.set(division, (xeroDivCost.get(division) || 0) + r.amount);
    }
  }

  const xeroDivisions = new Set([...xeroDivRevenue.keys(), ...xeroDivCost.keys()]);
  const xeroProfitability: DivisionProfitabilityRow[] = Array.from(xeroDivisions)
    .map((division) => {
      const rev = xeroDivRevenue.get(division) || 0;
      const cost = xeroDivCost.get(division) || 0;
      const margin = rev - cost;
      return {
        division,
        revenue: Math.round(rev),
        cost: Math.round(cost),
        ratio: cost > 0 ? Number((rev / cost).toFixed(1)) : 0,
        marginPercent: rev > 0 ? Number(((margin / rev) * 100).toFixed(0)) : 0,
        clientCount: 0,
        avgDealSize: 0,
      };
    })
    .filter((d) => d.revenue > 0 || d.cost > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return {
    avgUtilization,
    avgMargin,
    revenuePerHead,
    totalRevenue,
    totalTeamMembers,
    activeClients,
    clientRetention,
    hoursByDivision,
    monthlyTrend,
    marginByDivision,
    divisionMarginTrend,
    clientLTVByIndustry,
    clientLTVByDivision,
    hubspotProfitability,
    xeroProfitability,
  };
}
