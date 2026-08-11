import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { HeldOutDownsell } from "@/lib/analytics/downsells";

/**
 * Unpaired downsells are held out of every revenue figure until their HubSpot
 * data is complete, so they must be visible — otherwise revenue goes missing
 * with nothing to explain it.
 */
export function DownsellsAttentionCard({ heldOut }: { heldOut: HeldOutDownsell[] }) {
  if (heldOut.length === 0) return null;
  const total = heldOut.reduce((s, d) => s + d.amountExGst, 0);

  return (
    <Card className="border-yellow-500/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          Downsells needing attention
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {heldOut.length} downsell{heldOut.length === 1 ? "" : "s"} worth {formatCurrency(total)}/mo
          {" "}excluded from all revenue figures until paired to the deal each replaces. Set the
          superseded deal&apos;s Churn Date and Reasons for Churn = &ldquo;Downsell&rdquo; in HubSpot.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {heldOut.map((d) => (
            <div key={d.id} className="flex items-start justify-between gap-4 text-sm">
              <div>
                <span className="font-medium">{d.name}</span>
                <p className="text-muted-foreground">{d.reason}</p>
              </div>
              <span className="whitespace-nowrap font-medium">{formatCurrency(d.amountExGst)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
