import { Suspense } from "react";
import { getAgencyKPIs } from "@/lib/analytics/agency-kpis";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { KpiCharts } from "@/components/dashboard/kpi-charts";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Target, TrendingUp, DollarSign, Users, Building, UserCheck } from "lucide-react";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);
  const data = await getAgencyKPIs(months);

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
    </div>
  );
}
