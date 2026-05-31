"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import type { PackageTypeRow } from "@/lib/analytics/active-revenue";

interface Props {
  data: PackageTypeRow[];
  totalDeals: number;
  totalRevenue: number;
}

export function RevenueByPackageChart({ data, totalDeals, totalRevenue }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.revenue), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-base">Revenue by Package Type</CardTitle>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Active Monthly Revenue (ex-GST)
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(totalRevenue)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · {totalDeals} deals
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((row) => {
            const isOpen = expanded === row.packageType;
            return (
              <div key={row.packageType}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.packageType)}
                  className="w-full text-left group"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="font-medium flex items-center gap-1">
                      <ChevronRight
                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {row.packageType}
                    </span>
                    <span className="tabular-nums">
                      <span className="text-muted-foreground mr-2">{row.count} deals</span>
                      <span className="font-semibold">{formatCurrency(row.revenue)}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary group-hover:opacity-80 transition-opacity"
                      style={{ width: `${(row.revenue / max) * 100}%` }}
                    />
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-2 ml-5 border-l pl-3 space-y-1">
                    {row.deals.map((deal, i) => (
                      <div key={`${deal.name}-${i}`} className="flex items-baseline justify-between text-sm">
                        <span className="text-muted-foreground truncate mr-2">{deal.name}</span>
                        <span className="tabular-nums">{formatCurrency(deal.revenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
