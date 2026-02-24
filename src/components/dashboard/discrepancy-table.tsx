"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatMonth } from "@/lib/utils";
import type { DiscrepancyReport } from "@/lib/analytics/advanced-analytics";

interface Props {
  data: DiscrepancyReport;
}

export function DiscrepancyTable({ data }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">HubSpot Revenue</div>
            <div className="text-xl font-bold">{formatCurrency(data.totalHubspot)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Xero Revenue</div>
            <div className="text-xl font-bold">{formatCurrency(data.totalXero)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Difference</div>
            <div className={`text-xl font-bold ${data.totalDifference > 0 ? "text-green-600" : data.totalDifference < 0 ? "text-red-600" : ""}`}>
              {data.totalDifference > 0 ? "+" : ""}{formatCurrency(data.totalDifference)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="flex gap-1 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs">{data.summary.matched} matched</Badge>
              {data.summary.mismatched > 0 && (
                <Badge variant="destructive" className="text-xs">{data.summary.mismatched} mismatched</Badge>
              )}
              {data.summary.hubspotOnly > 0 && (
                <Badge variant="secondary" className="text-xs">{data.summary.hubspotOnly} HS only</Badge>
              )}
              {data.summary.xeroOnly > 0 && (
                <Badge variant="secondary" className="text-xs">{data.summary.xeroOnly} Xero only</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {data.byClient.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Discrepancies (&gt;5% difference)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Client</th>
                    <th className="pb-2 font-medium">Month</th>
                    <th className="pb-2 font-medium text-right">HubSpot</th>
                    <th className="pb-2 font-medium text-right">Xero</th>
                    <th className="pb-2 font-medium text-right">Diff</th>
                    <th className="pb-2 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClient.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">
                        <Link
                          href={`/clients/${row.clientId}`}
                          className="font-medium hover:underline"
                        >
                          {row.clientName}
                        </Link>
                      </td>
                      <td className="py-2 text-muted-foreground">{formatMonth(row.month)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.hubspotRevenue)}</td>
                      <td className="py-2 text-right">{formatCurrency(row.xeroRevenue)}</td>
                      <td className={`py-2 text-right font-medium ${row.difference > 0 ? "text-green-600" : "text-red-600"}`}>
                        {row.difference > 0 ? "+" : ""}{formatCurrency(row.difference)}
                      </td>
                      <td className={`py-2 text-right ${Math.abs(row.percentDiff) > 20 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {row.percentDiff > 0 ? "+" : ""}{row.percentDiff}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
