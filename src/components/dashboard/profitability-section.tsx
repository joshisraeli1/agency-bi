"use client";

import { useState } from "react";
import { PieChartCard } from "@/components/charts/pie-chart";
import { DivisionMarginsChart } from "@/components/dashboard/division-margins-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { DivisionProfitabilityRow } from "@/lib/analytics/types";
import type { DivisionSummary } from "@/lib/analytics/division-summary";

interface Props {
  divisionSummary: DivisionSummary;
}

function DivisionSummaryBlock({
  title,
  subtitle,
  data,
  showPieChart = true,
  monthControl,
  notice,
}: {
  title: string;
  subtitle: string;
  data: DivisionProfitabilityRow[];
  showPieChart?: boolean;
  monthControl?: React.ReactNode;
  notice?: string;
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
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">Division Summary</CardTitle>
            {monthControl}
          </div>
          {notice && <p className="text-amber-600 text-sm mt-1">{notice}</p>}
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
                    <td
                      key={d.division}
                      className="text-right py-2 px-3"
                    >
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

export function ProfitabilitySection({ divisionSummary }: Props) {
  const { months, defaultMonth } = divisionSummary;
  const [month, setMonth] = useState<string>(defaultMonth ?? months[months.length - 1]?.month ?? "");

  if (months.length === 0) return null;
  const activeMonth = months.find((m) => m.month === month) ?? months[months.length - 1];

  // Report the three delivery divisions only. Shared/Overhead is not a profit
  // centre — it holds unallocated overhead (rent, overhead salaries, software)
  // against incidental income, so it has no meaningful margin of its own. The
  // total below is therefore divisional contribution BEFORE overhead, not
  // company profit; the Net Profit chart on the overview is the bottom line.
  const active = {
    ...activeMonth,
    rows: activeMonth.rows.filter((r) => r.division !== "Shared/Overhead"),
  };

  // The current calendar month's costs are still being booked, so its margins
  // read far too high — say so rather than let the number be taken at face value.
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isPartial = active.month === currentKey;

  return (
    <div className="space-y-6">
      {/* Division profitability — revenue and cost both from the Xero P&L */}
      <DivisionSummaryBlock
        title="Profitability by Division"
        subtitle={`Xero P&L revenue and costs by division — ${active.label}. Contribution before shared overhead.`}
        data={active.rows}
        notice={
          isPartial
            ? `${active.label} is still in progress — costs aren't fully booked yet, so margins are overstated.`
            : undefined
        }
        monthControl={
          <select
            value={active.month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label="Month"
          >
            {[...months].reverse().map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
              </option>
            ))}
          </select>
        }
      />
    </div>
  );
}
