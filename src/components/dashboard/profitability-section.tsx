"use client";

import { BarChartCard } from "@/components/charts/bar-chart";
import { PieChartCard } from "@/components/charts/pie-chart";
import { ComboChartCard } from "@/components/charts/combo-chart";
import { StatCard } from "@/components/charts/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { DivisionProfitabilityRow, ClientEfficiencyData, XeroMarginTrend } from "@/lib/analytics/types";
import { Clock, MessageSquare } from "lucide-react";

interface Props {
  hubspotProfitability: DivisionProfitabilityRow[];
  xeroProfitability: DivisionProfitabilityRow[];
  clientEfficiency: ClientEfficiencyData;
  xeroMargin: XeroMarginTrend;
}

function DivisionSummaryBlock({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: DivisionProfitabilityRow[];
}) {
  if (data.length === 0) return null;

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalCost = data.reduce((s, d) => s + d.cost, 0);
  const totalMargin = totalRevenue - totalCost;
  const totalMarginPercent = totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(0)) : 0;
  const totalMultiple = totalCost > 0 ? Number((totalRevenue / totalCost).toFixed(1)) : 0;

  const pieData = data.map((d) => ({ name: d.division, value: d.revenue }));
  const marginBarData = data.map((d) => ({ name: d.division, marginPercent: d.marginPercent }));

  return (
    <>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Division Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium" />
                  {data.map((d) => (
                    <th key={d.division} className="text-right py-2 px-3 font-medium">
                      {d.division}
                    </th>
                  ))}
                  <th className="text-right py-2 px-3 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Revenue</td>
                  {data.map((d) => (
                    <td key={d.division} className="text-right py-2 px-3">
                      {formatCurrency(d.revenue)}
                    </td>
                  ))}
                  <td className="text-right py-2 px-3 font-semibold">
                    {formatCurrency(totalRevenue)}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Cost</td>
                  {data.map((d) => (
                    <td key={d.division} className="text-right py-2 px-3">
                      ({formatCurrency(d.cost)})
                    </td>
                  ))}
                  <td className="text-right py-2 px-3 font-semibold">
                    ({formatCurrency(totalCost)})
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 px-3 font-medium">Margin</td>
                  {data.map((d) => (
                    <td
                      key={d.division}
                      className={`text-right py-2 px-3 ${d.marginPercent < 0 ? "text-red-600" : ""}`}
                    >
                      {d.marginPercent}%
                    </td>
                  ))}
                  <td className="text-right py-2 px-3 font-semibold">
                    {totalMarginPercent}%
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium">Multiple</td>
                  {data.map((d) => (
                    <td key={d.division} className="text-right py-2 px-3">
                      {d.ratio}x
                    </td>
                  ))}
                  <td className="text-right py-2 px-3 font-semibold">
                    {totalMultiple}x
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard
          title="Revenue Breakdown"
          data={pieData}
          donut
          formatValue={(v) => formatCurrency(v)}
        />
        <BarChartCard
          title="Division Margins"
          data={marginBarData}
          xKey="name"
          yKeys={["marginPercent"]}
          yLabels={["Margin %"]}
          formatY={(v) => `${v}%`}
        />
      </div>
    </>
  );
}

export function ProfitabilitySection({
  hubspotProfitability,
  xeroProfitability,
  clientEfficiency,
  xeroMargin,
}: Props) {
  // Client efficiency — revenue per deliverable
  const topByDeliverable = clientEfficiency.topEfficient.map((c) => ({
    name: c.clientName,
    value: c.revenuePerDeliverable,
  }));

  const bottomByDeliverable = clientEfficiency.bottomEfficient.map((c) => ({
    name: c.clientName,
    value: c.revenuePerDeliverable,
  }));

  // Client efficiency — revenue per edit
  const topByEdit = clientEfficiency.topEfficient
    .filter((c) => c.revenuePerEdit > 0)
    .map((c) => ({
      name: c.clientName,
      value: c.revenuePerEdit,
    }));

  const bottomByEdit = clientEfficiency.bottomEfficient
    .filter((c) => c.revenuePerEdit > 0)
    .map((c) => ({
      name: c.clientName,
      value: c.revenuePerEdit,
    }));

  // Overhead context stats
  const allClients = [...clientEfficiency.topEfficient, ...clientEfficiency.bottomEfficient];
  const totalMeetingHours = allClients.reduce((s, c) => s + c.meetingHours, 0);
  const totalSlackMessages = allClients.reduce((s, c) => s + c.slackMessages, 0);

  // Xero margin trend
  const marginData = xeroMargin.monthlyData.map((m) => ({
    ...m,
    month: formatMonth(m.month),
  }));

  return (
    <div className="space-y-6">
      {/* HubSpot Profitability (revenue from HubSpot + team salary costs) */}
      <DivisionSummaryBlock
        title="Profitability by Division (HubSpot)"
        subtitle="HubSpot revenue vs team salary costs — based on time tracked per division"
        data={hubspotProfitability}
      />

      {/* Xero Profitability (revenue + costs from Xero, incl. contractors) */}
      <DivisionSummaryBlock
        title="Profitability by Division (Xero)"
        subtitle="Xero revenue vs actual costs including contractor and content creator expenses"
        data={xeroProfitability}
      />

      {/* Client Efficiency Rankings */}
      {(topByDeliverable.length > 0 || bottomByDeliverable.length > 0) && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Client Efficiency</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Revenue per deliverable and per edit — top and bottom 10 clients
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {topByDeliverable.length > 0 && (
              <BarChartCard
                title="Revenue / Deliverable (Top 10)"
                data={topByDeliverable}
                xKey="name"
                yKeys={["value"]}
                yLabels={["Revenue / Deliverable"]}
                horizontal
                formatY={(v) => formatCurrency(v)}
              />
            )}
            {bottomByDeliverable.length > 0 && (
              <BarChartCard
                title="Revenue / Deliverable (Bottom 10)"
                data={bottomByDeliverable}
                xKey="name"
                yKeys={["value"]}
                yLabels={["Revenue / Deliverable"]}
                horizontal
                formatY={(v) => formatCurrency(v)}
              />
            )}
            {topByEdit.length > 0 && (
              <BarChartCard
                title="Revenue / Edit (Top 10)"
                data={topByEdit}
                xKey="name"
                yKeys={["value"]}
                yLabels={["Revenue / Edit"]}
                horizontal
                formatY={(v) => formatCurrency(v)}
              />
            )}
            {bottomByEdit.length > 0 && (
              <BarChartCard
                title="Revenue / Edit (Bottom 10)"
                data={bottomByEdit}
                xKey="name"
                yKeys={["value"]}
                yLabels={["Revenue / Edit"]}
                horizontal
                formatY={(v) => formatCurrency(v)}
              />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              title="Total Meeting Hours (Top & Bottom 10)"
              value={`${totalMeetingHours.toFixed(1)}h`}
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Total Slack Messages (Top & Bottom 10)"
              value={String(totalSlackMessages)}
              icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        </>
      )}

      {/* Xero Margin Over Time */}
      {marginData.length > 0 && xeroMargin.totalRevenue > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Margin Over Time (Xero)</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Monthly revenue, cost, and margin % from Xero data — avg margin{" "}
              {xeroMargin.avgMarginPercent}%
            </p>
          </div>
          <ComboChartCard
            title="Xero Revenue & Margin Trend"
            data={marginData}
            xKey="month"
            barKeys={["revenue", "cost"]}
            barLabels={["Revenue", "Cost"]}
            lineKey="marginPercent"
            lineLabel="Margin %"
            stacked={false}
            formatBar={(v) => formatCurrency(v)}
            formatLine={(v) => `${v}%`}
          />
        </>
      )}
    </div>
  );
}
