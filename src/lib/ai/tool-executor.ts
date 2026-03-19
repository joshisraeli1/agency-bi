import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";
import { getClientProfitability } from "@/lib/analytics/client-profitability";
import { getTeamMemberUtilization } from "@/lib/analytics/team-utilization";
import { getRevenueOverview } from "@/lib/analytics/revenue-overview";
import { getAgencyKPIs } from "@/lib/analytics/agency-kpis";

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "query_clients": {
      const where: Record<string, unknown> = {};
      if (input.status) where.status = input.status;
      if (input.search) {
        where.name = { contains: input.search as string };
      }
      const clients = await db.client.findMany({
        where,
        take: (input.limit as number) || 20,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          retainerValue: true,
          industry: true,
          source: true,
          startDate: true,
          endDate: true,
          dealStage: true,
          serviceType: true,
        },
      });
      return clients;
    }

    case "query_financials": {
      const months = (input.months as number) || 6;
      const monthRange = getMonthRange(months);

      // Fetch prospect client IDs to exclude
      const prospectClients = await db.client.findMany({
        where: { status: "prospect" },
        select: { id: true },
      });
      const prospectIds = new Set(prospectClients.map((c) => c.id));

      // Fetch GST settings
      const settings = await db.appSettings.findFirst();
      const gstDivisor = 1 + (settings?.gstRate ?? 10) / 100;

      const where: Record<string, unknown> = {
        month: { in: monthRange },
        source: "hubspot", // HubSpot is the single source of truth for revenue
      };
      if (input.clientId) where.clientId = input.clientId;
      if (input.type) where.type = input.type;

      const records = await db.financialRecord.findMany({
        where,
        include: { client: { select: { name: true } } },
        orderBy: { month: "desc" },
      });

      // Filter out prospect clients and apply GST conversion
      const filtered = records.filter((r) => !prospectIds.has(r.clientId));

      const totalRevenue = filtered
        .filter((r) => r.type === "retainer" || r.type === "project")
        .reduce((s, r) => s + r.amount / gstDivisor, 0);
      const totalCost = filtered
        .filter((r) => r.type === "cost")
        .reduce((s, r) => s + r.amount, 0);
      const grossProfit = totalRevenue - totalCost;

      const summary = {
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        grossProfit: Math.round(grossProfit),
        marginPercent: totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0,
        recordCount: filtered.length,
        byType: {} as Record<string, number>,
        records: filtered.slice(0, 50).map((r) => ({
          clientName: r.client.name,
          month: r.month,
          type: r.type,
          category: r.category,
          amount: Math.round(r.amount / gstDivisor),
          source: r.source,
        })),
      };

      for (const r of filtered) {
        const exGst = (r.type === "retainer" || r.type === "project")
          ? r.amount / gstDivisor
          : r.amount;
        summary.byType[r.type] = (summary.byType[r.type] || 0) + exGst;
      }

      // Round byType values
      for (const key of Object.keys(summary.byType)) {
        summary.byType[key] = Math.round(summary.byType[key]);
      }

      return summary;
    }

    case "query_time_entries": {
      const months = (input.months as number) || 3;
      const monthRange = getMonthRange(months);
      const startDate = new Date(`${monthRange[0]}-01`);
      const where: Record<string, unknown> = {
        date: { gte: startDate },
      };
      if (input.clientId) where.clientId = input.clientId;
      if (input.teamMemberId) where.teamMemberId = input.teamMemberId;

      const entries = await db.timeEntry.findMany({
        where,
        take: (input.limit as number) || 50,
        orderBy: { date: "desc" },
        include: {
          client: { select: { name: true } },
          teamMember: { select: { name: true } },
        },
      });

      return entries.map((e) => ({
        date: e.date.toISOString().split("T")[0],
        hours: e.hours,
        clientName: e.client?.name || "No client",
        teamMemberName: e.teamMember?.name || "Unassigned",
        description: e.description,
        isOverhead: e.isOverhead,
      }));
    }

    case "query_team_members": {
      const where: Record<string, unknown> = {};
      if (input.division) where.division = input.division;
      if (input.active !== undefined) where.active = input.active;
      if (input.search) {
        where.name = { contains: input.search as string };
      }

      const members = await db.teamMember.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          division: true,
          employmentType: true,
          annualSalary: true,
          hourlyRate: true,
          weeklyHours: true,
          active: true,
        },
      });

      // Strip individual compensation fields — expose only an aggregated monthly cost
      return members.map((m) => {
        let monthlyCost: number | null = null;
        if (m.annualSalary != null) {
          monthlyCost = Math.round(m.annualSalary / 12);
        } else if (m.hourlyRate != null) {
          const weeklyHrs = m.weeklyHours ?? 40;
          monthlyCost = Math.round(m.hourlyRate * weeklyHrs * 52 / 12);
        }
        return {
          id: m.id,
          name: m.name,
          role: m.role,
          division: m.division,
          employmentType: m.employmentType,
          monthlyCost,
          active: m.active,
        };
      });
    }

    case "get_client_profitability": {
      return await getClientProfitability(
        input.clientId as string,
        (input.months as number) || 6
      );
    }

    case "get_team_utilization": {
      return await getTeamMemberUtilization(
        input.memberId as string,
        (input.months as number) || 6
      );
    }

    case "get_revenue_overview": {
      return await getRevenueOverview((input.months as number) || 6);
    }

    case "get_agency_kpis": {
      return await getAgencyKPIs((input.months as number) || 6);
    }

    case "generate_chart": {
      return {
        _chart: true,
        chartType: input.chartType,
        title: input.title,
        data: input.data,
        xKey: input.xKey,
        yKeys: input.yKeys,
        yLabels: input.yLabels,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
