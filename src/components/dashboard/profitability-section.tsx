"use client";

import { PieChartCard } from "@/components/charts/pie-chart";
import { DivisionMarginsChart } from "@/components/dashboard/division-margins-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { DivisionProfitabilityRow, XeroMarginTrend } from "@/lib/analytics/types";

interface Props {
  hubspotProfitability: DivisionProfitabilityRow[];
  xeroProfitability: DivisionProfitabilityRow[];
  xeroMargin: XeroMarginTrend;
}

function DivisionSummaryBlock({
  title,
  subtitle,
  data,
  showPieChart = true,
}: {
  title: string;
  subtitle: string;
  data: DivisionProfitabilityRow[];
  showPieChart?: boolean;
}) {
  if (data.length === 0) return null;

  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalCost = data.reduce((s, d) => s + d.cost, 0);
  const totalMargin = totalRevenue - totalCost;
  const totalMarginPercent = totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(0)) : 0;
  const totalMultiple = totalCost > 0 ? Number((totalRevenue / totalCost).toFixed(1)) : 0;
  const totalClientCount = data.reduce((s, d) => s + d.clientCount, 0);

  // Charts show only revenue-bearing divisions — exclude the Shared/Overhead
  // bucket (it has no revenue; its unallocated cost stays in the table below).
  const revenueDivisions = data.filter((d) => d.revenue > 0);
  const pieData = revenueDivisions.map((d) => ({ name: d.division, value: d.revenue }));
  // Include the revenue/cost multiple in the bar label so it shows on the graph.
  const marginBarData = revenueDivisions.map((d) => ({
    name: d.division,
    marginPercent: d.marginPercent,
    ratio: d.ratio,
    label: `${d.marginPercent}% · ${d.ratio}x`,
  }));

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
                <tr className="border-b">
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
                <tr>
                  <td className="py-2 px-3 font-medium">Avg Deal Size</td>
                  {data.map((d) => (
                    <td key={d.division} className="text-right py-2 px-3">
                      {d.avgDealSize > 0 ? formatCurrency(d.avgDealSize) : "–"}
                    </td>
                  ))}
                  <td className="text-right py-2 px-3 font-semibold">
                    {totalClientCount > 0 ? formatCurrency(Math.round(totalRevenue / totalClientCount)) : "–"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className={`grid grid-cols-1 ${showPieChart ? "lg:grid-cols-2" : ""} gap-4`}>
        {showPieChart && (
          <PieChartCard
            title="Revenue Breakdown"
            data={pieData}
            donut
            formatValue={(v) => formatCurrency(v)}
          />
        )}
        <DivisionMarginsChart data={marginBarData} />
      </div>
    </>
  );
}

export function ProfitabilitySection({
  hubspotProfitability,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Division profitability: HubSpot deal revenue vs Xero P&L costs */}
      <DivisionSummaryBlock
        title="Profitability by Division"
        subtitle="Client deal revenue vs Xero costs by division"
        data={hubspotProfitability}
      />

    </div>
  );
}
