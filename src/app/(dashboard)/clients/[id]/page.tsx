import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientProfitability } from "@/lib/analytics/client-profitability";
import { db } from "@/lib/db";
import { formatCurrency, formatHours, formatPercent } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { MarginBadge } from "@/components/charts/margin-badge";
import { ClientProfitabilityCharts } from "@/components/dashboard/client-profitability-charts";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, DollarSign, Clock, TrendingUp, Users, MessageSquare, CalendarDays } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ months?: string }>;
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "6", 10);

  let data;
  try {
    data = await getClientProfitability(id, months);
  } catch {
    notFound();
  }

  const [commCount, recentComms, meetingCount, meetingHoursAgg, recentMeetings] = await Promise.all([
    db.communicationLog.count({ where: { clientId: id } }),
    db.communicationLog.findMany({
      where: { clientId: id },
      orderBy: { date: "desc" },
      take: 10,
    }),
    db.meetingLog.count({ where: { clientId: id } }),
    db.meetingLog.aggregate({ where: { clientId: id }, _sum: { duration: true } }),
    db.meetingLog.findMany({
      where: { clientId: id },
      orderBy: { date: "desc" },
      take: 10,
    }),
  ]);

  const meetingHours = ((meetingHoursAgg._sum.duration || 0) / 60).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/clients">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{data.clientName}</h1>
              <Badge>{data.status}</Badge>
              <MarginBadge marginPercent={data.marginPercent} />
            </div>
            <p className="text-muted-foreground mt-1">Client Profitability Dashboard</p>
          </div>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data.totalRevenue)}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Cost"
          value={formatCurrency(data.totalCost)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Hours"
          value={formatHours(data.totalHours)}
          description={`Effective rate: ${formatCurrency(data.effectiveRate)}/hr`}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Team Members"
          value={String(data.teamBreakdown.length)}
          description={`${data.deliverableStats.total} deliverables`}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <ClientProfitabilityCharts data={data} />

      {data.teamBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.teamBreakdown.map((member) => (
                <div
                  key={member.memberId}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium">{member.memberName}</span>
                  <span className="text-muted-foreground">
                    {formatHours(member.hours)} &middot;{" "}
                    {formatCurrency(member.cost)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {commCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Communication ({commCount} messages)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentComms.map((msg) => (
                <div
                  key={msg.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium truncate max-w-[60%]">
                    {msg.subject || msg.summary || "Message"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {msg.date.toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {meetingCount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Meetings ({meetingCount} meetings &middot; {meetingHours}h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentMeetings.map((mtg) => (
                <div
                  key={mtg.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium truncate max-w-[60%]">
                    {mtg.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {mtg.date.toLocaleDateString()}
                    {mtg.duration ? ` · ${mtg.duration}min` : ""}
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
