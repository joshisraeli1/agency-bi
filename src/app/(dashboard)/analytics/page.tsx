import { Suspense } from "react";
import { getAgencyKPIs } from "@/lib/analytics/agency-kpis";
import { getCommunicationOverview } from "@/lib/analytics/communication-overhead";
import { getMeetingOverview } from "@/lib/analytics/meeting-overhead";
import {
  getLTVData,
  getRevenueByServiceType,
  getClientHealthData,
  getTeamUtilizationData,
  getSourceDiscrepancy,
  getIndustryBreakdown,
} from "@/lib/analytics/advanced-analytics";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { KpiCharts } from "@/components/dashboard/kpi-charts";
import { AdvancedCharts } from "@/components/dashboard/advanced-charts";
import { DiscrepancyTable } from "@/components/dashboard/discrepancy-table";
import { CommunicationCharts } from "@/components/charts/communication-charts";
import { MeetingCharts } from "@/components/charts/meeting-charts";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Target, TrendingUp, DollarSign, Users, Building, UserCheck, MessageSquare, CalendarDays, Clock } from "lucide-react";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);
  const [data, comms, meetings, ltv, revenueByType, clientHealth, teamUtilization, discrepancy, industryBreakdown] = await Promise.all([
    getAgencyKPIs(months),
    getCommunicationOverview(months),
    getMeetingOverview(months),
    getLTVData(),
    getRevenueByServiceType(months),
    getClientHealthData(months),
    getTeamUtilizationData(months),
    getSourceDiscrepancy(months),
    getIndustryBreakdown(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Agency-wide KPIs and performance metrics</p>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Avg Utilization"
          value={formatPercent(data.avgUtilization)}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg Margin"
          value={formatPercent(data.avgMargin)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Revenue / Head"
          value={formatCurrency(data.revenuePerHead)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Clients"
          value={String(data.activeClients)}
          icon={<Building className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Client Retention"
          value={formatPercent(data.clientRetention)}
          description={`${data.totalTeamMembers} team members`}
          icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <KpiCharts data={data} />

      <AdvancedCharts
        ltv={ltv}
        revenueByType={revenueByType}
        clientHealth={clientHealth}
        teamUtilization={teamUtilization}
        industryBreakdown={industryBreakdown}
      />

      {(discrepancy.totalHubspot > 0 || discrepancy.totalXero > 0) && (
        <>
          <div>
            <h2 className="text-xl font-semibold">HubSpot vs Xero Reconciliation</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Revenue comparison between sources (ex GST)
            </p>
          </div>
          <DiscrepancyTable data={discrepancy} />
        </>
      )}

      {comms.totalMessages > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Communication Overhead</h2>
            <p className="text-muted-foreground text-sm mt-1">Slack message analytics</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Total Messages"
              value={String(comms.totalMessages)}
              icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Clients Contacted"
              value={String(comms.totalClients)}
              description={`${comms.unattributedCount} unattributed`}
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Avg Messages / Client"
              value={comms.avgMessagesPerClient.toFixed(1)}
              icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <CommunicationCharts data={comms} />
        </>
      )}

      {meetings.totalMeetings > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Meeting Overhead</h2>
            <p className="text-muted-foreground text-sm mt-1">Google Calendar meeting analytics</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Total Meetings"
              value={String(meetings.totalMeetings)}
              icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Meeting Hours"
              value={`${meetings.totalHours}h`}
              description={`${meetings.unattributedCount} unattributed`}
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Avg Duration"
              value={`${meetings.avgDuration} min`}
              description={`${meetings.totalClients} clients`}
              icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          <MeetingCharts data={meetings} />
        </>
      )}
    </div>
  );
}
