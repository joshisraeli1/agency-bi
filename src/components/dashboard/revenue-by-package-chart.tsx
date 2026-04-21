import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { PackageTypeRow } from "@/lib/analytics/active-revenue";

interface Props {
  data: PackageTypeRow[];
  totalDeals: number;
  totalRevenue: number;
}

export function RevenueByPackageChart({ data, totalDeals, totalRevenue }: Props) {
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
          {data.map((row) => (
            <div key={row.packageType}>
              <div className="flex items-baseline justify-between text-sm mb-1">
                <span className="font-medium">{row.packageType}</span>
                <span className="tabular-nums">
                  <span className="text-muted-foreground mr-2">{row.count} deals</span>
                  <span className="font-semibold">{formatCurrency(row.revenue)}</span>
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${(row.revenue / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
