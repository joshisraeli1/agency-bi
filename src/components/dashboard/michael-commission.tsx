"use client";

import { Fragment, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { MichaelCommission } from "@/lib/analytics/michael-sales";
import { DollarSign } from "lucide-react";

export function MichaelCommissionSection({ data }: { data: MichaelCommission }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              Commission
            </CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              $185/meeting booked (June $175) + 9% of each &ldquo;Owned&rdquo; deal&apos;s monthly value for 6 months. Click a month for detail.
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">This month</div>
            <div className="text-3xl font-bold tabular-nums">{formatCurrency(data.currentMonthTotal)}</div>
            <div className="text-xs text-muted-foreground mt-1">{formatCurrency(data.total)} total (from May 2026)</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">Month</th>
                <th className="text-right py-2 px-3 font-medium">Meetings</th>
                <th className="text-right py-2 px-3 font-medium">Meeting $</th>
                <th className="text-right py-2 px-3 font-medium">Deal 9% $</th>
                <th className="text-right py-2 px-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.months.map((m) => {
                const expandable = m.ownedDeals.length > 0;
                const isOpen = open === m.month;
                return (
                  <Fragment key={m.month}>
                    <tr
                      className={`border-b last:border-0 ${expandable ? "cursor-pointer hover:bg-muted/40" : ""}`}
                      onClick={() => expandable && setOpen(isOpen ? null : m.month)}
                    >
                      <td className="py-2 px-3 font-medium">
                        {formatMonth(m.month)}
                        {expandable && <span className="text-muted-foreground ml-1">{isOpen ? "▾" : "▸"}</span>}
                      </td>
                      <td className="text-right py-2 px-3 tabular-nums">{m.meetingsBooked}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(m.meetingCommission)}</td>
                      <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(m.dealCommission)}</td>
                      <td className="text-right py-2 px-3 font-semibold tabular-nums">{formatCurrency(m.total)}</td>
                    </tr>
                    {isOpen &&
                      m.ownedDeals.map((d, i) => (
                        <tr key={`${m.month}-${d.name}-${i}`} className="bg-muted/30 text-xs">
                          <td className="py-1 px-3 pl-8 text-muted-foreground" colSpan={4}>
                            {d.name} <span className="text-muted-foreground">(9% / mo)</span>
                          </td>
                          <td className="text-right py-1 px-3 tabular-nums text-muted-foreground">{formatCurrency(d.monthly)}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
