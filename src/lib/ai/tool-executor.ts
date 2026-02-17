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
        },
      });
      return clients;
    }

    case "query_financials": {
      const months = (input.months as number) || 6;
      const monthRange = getMonthRange(months);
      const where: Record<string, unknown> = {
        month: { in: monthRange },
      };
      if (input.clientId) where.clientId = input.clientId;
      if (input.type) where.type = input.type;

      const records = await db.financialRecord.findMany({
        where,
        include: { client: { select: { name: true } } },
        orderBy: { month: "desc" },
      });

      const summary = {
        totalAmount: records.reduce((s, r) => s + r.amount, 0),
        recordCount: records.length,
        byType: {} as Record<string, number>,
        records: records.slice(0, 50).map((r) => ({
          clientName: r.client.name,
          month: r.month,
          type: r.type,
          category: r.category,
          amount: r.amount,
        })),
      };

      for (const r of records) {
        summary.byType[r.type] = (summary.byType[r.type] || 0) + r.amount;
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
          hourlyRate: true,
          annualSalary: true,
          active: true,
        },
      });
      return members;
    }

    case "query_deliverables": {
      const where: Record<string, unknown> = {};
      if (input.clientId) where.clientId = input.clientId;
      if (input.status) where.status = input.status;

      const deliverables = await db.deliverable.findMany({
        where,
        take: (input.limit as number) || 30,
        orderBy: { createdAt: "desc" },
        include: {
          client: { select: { name: true } },
          assignments: {
            include: { teamMember: { select: { name: true } } },
          },
        },
      });

      return deliverables.map((d) => ({
        id: d.id,
        name: d.name,
        clientName: d.client?.name || "No client",
        status: d.status,
        revisionCount: d.revisionCount,
        dueDate: d.dueDate?.toISOString().split("T")[0],
        assignments: d.assignments.map((a) => ({
          role: a.role,
          memberName: a.teamMember?.name || "Unassigned",
        })),
      }));
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
