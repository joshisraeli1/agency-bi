import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamMemberUtilization } from "@/lib/analytics/team-utilization";
import { formatHours, formatPercent, formatCurrency } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { TeamUtilizationCharts } from "@/components/dashboard/team-utilization-charts";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock, Target, DollarSign, Briefcase } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ months?: string }>;
}

export default async function TeamMemberDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);

  let data;
  try {
    data = await getTeamMemberUtilization(id, months);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/team">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{data.memberName}</h1>
              {data.role && <Badge variant="outline">{data.role}</Badge>}
              {data.division && <Badge variant="secondary">{data.division}</Badge>}
            </div>
            <p className="text-muted-foreground mt-1">Team Utilization Dashboard</p>
          </div>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Utilization Rate"
          value={formatPercent(data.utilizationRate)}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Hours"
          value={formatHours(data.totalHours)}
          description={`${formatHours(data.billableHours)} billable`}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Overhead Hours"
          value={formatHours(data.overheadHours)}
          icon={<Briefcase className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Effective Rate"
          value={data.effectiveRate ? `${formatCurrency(data.effectiveRate)}/hr` : "N/A"}
          description={data.employmentType || undefined}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <TeamUtilizationCharts data={data} />

      {data.clientAllocation.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Client Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.clientAllocation.map((client) => (
                <div
                  key={client.clientId}
                  className="flex items-center justify-between text-sm"
                >
                  <Link
                    href={`/clients/${client.clientId}`}
                    className="font-medium hover:underline"
                  >
                    {client.clientName}
                  </Link>
                  <span className="text-muted-foreground">
                    {formatHours(client.hours)} ({formatPercent(client.percent)})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
