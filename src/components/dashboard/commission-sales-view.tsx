"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Target, Handshake, CalendarClock, Wallet, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { SalesActivityCharts } from "@/components/dashboard/sales-activity-charts";
import { CallActivityChart } from "@/components/dashboard/call-activity-chart";
import { MeetingsBookedChart } from "@/components/dashboard/meetings-booked-chart";
import type { CommissionSales } from "@/lib/analytics/commission-sales";
import type { SalesActivity } from "@/lib/analytics/sales-activity";
import type { CallActivity } from "@/lib/analytics/call-activity";
import type { MeetingsBooked } from "@/lib/analytics/meetings-booked";

const SIGNED = "#ea580c";
const PACE = "#0d9488";

function Tile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold tabular-nums mt-2">{value}</p>
        {note && <p className="text-muted-foreground text-xs mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}

const asDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

export function CommissionSalesView({
  data,
  activity,
  callActivity,
  meetings,
}: {
  data: CommissionSales;
  activity: SalesActivity;
  callActivity: CallActivity;
  meetings: MeetingsBooked;
}) {
  const { months, clients, milestones } = data;

  const paceData = months.map((m) => ({
    label: m.label,
    Signed: m.signingsToDate,
    "On pace": m.targetToDate,
  }));
  const monthlyData = months.map((m) => ({
    label: m.label,
    Signings: m.signings,
    "Qualified meetings": m.qualifiedMeetings,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.ownerName}</h1>
        <p className="text-muted-foreground mt-1">
          Commission year {asDate(data.yearStart)} – {asDate(data.yearEnd)}
          {data.notStarted ? " · starts soon" : ` · month ${data.monthsElapsed} of 12`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          icon={<Handshake className="h-4 w-4" />}
          label="Clients signed"
          value={`${data.signed} of ${data.target}`}
          note={
            data.signed >= data.target
              ? "Target reached — every further signing earns a higher rate"
              : `${data.neededPerMonth}/month needed from here`
          }
        />
        <Tile
          icon={<Target className="h-4 w-4" />}
          label="Pace"
          value={data.onPace ? "On track" : "Behind"}
          note={`${data.signed} signed against ${months[months.length - 1]?.targetToDate ?? 0} to be on pace by now`}
        />
        <Tile
          icon={<Wallet className="h-4 w-4" />}
          label="Commission earned"
          value={formatCurrency(data.commissionEarned)}
          note={`at ${(data.currentRate * 100).toFixed(2).replace(/\.00$/, "")}% — 6 months of retainer per client`}
        />
        <Tile
          icon={<CalendarClock className="h-4 w-4" />}
          label="Qualified meetings"
          value={String(data.qualifiedMeetings)}
          note={`${formatCurrency(data.meetingFees)} earned · $185 each, uncapped`}
        />
        <Tile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Pipeline"
          value={formatCurrency(data.pipelineValue)}
          note={`${data.pipelineCount} open deal${data.pipelineCount === 1 ? "" : "s"}`}
        />
        <Tile
          icon={<Wallet className="h-4 w-4" />}
          label="Total earned"
          value={formatCurrency(data.totalEarned)}
          note="commission plus meeting fees"
        />
      </div>

      {data.notStarted && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">
              The commission year opens on {asDate(data.yearStart)}. Targets and tiers are set;
              signings, meetings and commission start counting from that date.
            </p>
          </CardContent>
        </Card>
      )}

      {!data.notStarted && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signings against pace</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Running total of clients signed, against the straight line to 36 across the year. The
            pace line is where the total needs to be to finish on target.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={paceData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={32} allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v ?? 0} clients`, ""]} />
                <Legend />
                <Line type="monotone" dataKey="On pace" stroke={PACE} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                <Line type="monotone" dataKey="Signed" stroke={SIGNED} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      )}

      {!data.notStarted && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Each month</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Clients signed and qualified meetings held. A deal created in the CRM counts as the
            qualified meeting that produced it.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={32} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Qualified meetings" fill={PACE} radius={[4, 4, 0, 0]} maxBarSize={34} />
                <Bar dataKey="Signings" fill={SIGNED} radius={[4, 4, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Milestones</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            A milestone shows no verdict until its date falls — a target not yet due is not a target
            missed.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {milestones.map((m) => (
              <li key={m.label} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    {m.met === true && <Check className="h-4 w-4" style={{ color: PACE }} />}
                    {m.label}
                    <span className="text-muted-foreground font-normal">· by {asDate(m.due)}</span>
                  </p>
                  <p className="text-muted-foreground text-xs mt-0.5">{m.detail}</p>
                </div>
                <span
                  className="text-sm tabular-nums shrink-0"
                  style={{ color: m.met === false ? "#dc2626" : m.met === true ? PACE : undefined }}
                >
                  {m.progress}
                  {m.met === null && <span className="text-muted-foreground"> · not yet due</span>}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Outreach activity — weekly emails sent and calls logged */}
      <SalesActivityCharts weeks={activity.weeks} />

      <CallActivityChart data={callActivity} />

      <MeetingsBookedChart data={meetings} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients signed</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            {clients.length} in the commission year, newest first. The rate is set by where a client
            falls in the order — reaching 37 lifts that client to 5.25%, not the ones before it.
          </p>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              No clients signed yet in this commission year.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium py-2 px-3">#</th>
                    <th className="text-left font-medium py-2 px-3">Client</th>
                    <th className="text-left font-medium py-2 px-3">Signed</th>
                    <th className="text-right font-medium py-2 px-3">Retainer /mo</th>
                    <th className="text-right font-medium py-2 px-3">Rate</th>
                    <th className="text-right font-medium py-2 px-3">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="py-2 px-3 tabular-nums text-muted-foreground">{c.clientNumber}</td>
                      <td className="py-2 px-3">{c.name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{asDate(c.signedAt)}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(c.monthly)}</td>
                      <td className="text-right py-2 px-3 tabular-nums">
                        {(c.rate * 100).toFixed(2).replace(/\.00$/, "")}%
                      </td>
                      <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(c.commission)}</td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="py-2 px-3" colSpan={5}>
                      Total
                    </td>
                    <td className="text-right py-2 px-3 tabular-nums">
                      {formatCurrency(data.commissionEarned)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
