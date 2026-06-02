import { db } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/charts/stat-card";
import { ReconciliationRowActions } from "@/components/dashboard/reconciliation-row-actions";
import { ReconciliationRefresh } from "@/components/dashboard/reconciliation-refresh";
import { ReconciliationAliases } from "@/components/dashboard/reconciliation-aliases";
import { getReconciliationAliases } from "@/lib/reconciliation/aliases";
import { AlertTriangle, AlertCircle, CheckCircle2, Shuffle } from "lucide-react";

type Recon = Awaited<ReturnType<typeof getReconciliations>>[number];

async function getReconciliations() {
  return db.reconciliation.findMany({
    include: {
      hubspotDeal: {
        select: {
          id: true,
          name: true,
          ownerName: true,
          client: { select: { name: true } },
        },
      },
      xeroRepeatingInvoice: {
        select: { id: true, xeroContactName: true, subTotal: true, scheduleUnit: true, status: true },
      },
    },
    orderBy: [{ status: "asc" }, { amountDelta: "desc" }],
  });
}

function Section({
  title,
  icon,
  rows,
  emptyHint,
  showXero,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Recon[];
  emptyHint: string;
  showXero: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {icon} {title} <Badge variant="outline">0</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title} <Badge variant="outline">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client / Deal</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">HubSpot (ex-GST)</TableHead>
              {showXero && (
                <>
                  <TableHead className="text-right">Xero (monthly)</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                </>
              )}
              <TableHead>Match</TableHead>
              <TableHead>Last checked</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className={r.reviewStatus !== "open" ? "opacity-50" : ""}
              >
                <TableCell className="max-w-sm">
                  <div className="font-medium">
                    {r.hubspotDeal.client?.name ?? r.hubspotDeal.name}
                  </div>
                  {r.hubspotDeal.client?.name && r.hubspotDeal.client.name !== r.hubspotDeal.name && (
                    <div className="text-xs text-muted-foreground">deal: {r.hubspotDeal.name}</div>
                  )}
                  {r.reason && r.status !== "aligned" && (
                    <div className="mt-1 text-xs leading-snug text-muted-foreground whitespace-normal">
                      {r.reason}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.hubspotDeal.ownerName ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.hubspotAmount != null ? formatCurrency(r.hubspotAmount) : "—"}
                </TableCell>
                {showXero && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {r.xeroAmount != null ? formatCurrency(r.xeroAmount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.amountDelta != null ? (
                        <span className={r.amountDelta > 0 ? "text-amber-600" : "text-blue-600"}>
                          {r.amountDelta > 0 ? "+" : ""}
                          {formatCurrency(r.amountDelta)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-xs">
                  {r.matchMethod ? (
                    <Badge variant="secondary">{r.matchMethod.replace(/_/g, " ")}</Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(r.lastCheckedAt)}
                </TableCell>
                <TableCell>
                  <ReconciliationRowActions
                    id={r.id}
                    reviewStatus={r.reviewStatus}
                    notes={r.notes}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function ReconciliationPage() {
  const [all, xeroCount, aliases] = await Promise.all([
    getReconciliations(),
    db.xeroRepeatingInvoice.count(),
    getReconciliationAliases(),
  ]);

  // Split by status; collapse resolved/ignored under open status
  const open = all.filter((r) => r.reviewStatus === "open");
  const closed = all.filter((r) => r.reviewStatus !== "open");

  const missing = open.filter((r) => r.status === "missing_in_xero");
  const mismatch = open.filter((r) => r.status === "amount_mismatch");
  const aligned = open.filter((r) => r.status === "aligned");

  const hubspotTotal = open.reduce((s, r) => s + (r.hubspotAmount ?? 0), 0);
  const xeroTotal = open.reduce((s, r) => s + (r.xeroAmount ?? 0), 0);
  const gap = hubspotTotal - xeroTotal;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reconciliation</h1>
          <p className="text-muted-foreground mt-1">
            HubSpot active retainers vs. Xero repeating invoices
          </p>
        </div>
        <ReconciliationRefresh />
      </div>

      {xeroCount === 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-medium">No Xero repeating invoices in the database.</p>
            <p className="text-sm text-muted-foreground">
              Connect Xero at <code>/integrations/xero</code>, then click{" "}
              <strong>Re-run reconciliation</strong> above. The sync pulls Xero
              repeating invoice templates and matches them against active
              closed-won HubSpot deals.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Missing in Xero"
          value={String(missing.length)}
          description="No matching repeating invoice"
          icon={<AlertCircle className="h-4 w-4 text-red-500" />}
        />
        <StatCard
          title="Amount mismatch"
          value={String(mismatch.length)}
          description="Outside 5% tolerance"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        />
        <StatCard
          title="Aligned"
          value={String(aligned.length)}
          description="Within tolerance"
          icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
        />
        <StatCard
          title="Open gap"
          value={formatCurrency(gap)}
          description={`HubSpot ${formatCurrency(hubspotTotal)} − Xero ${formatCurrency(xeroTotal)}`}
          icon={<Shuffle className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <ReconciliationAliases initial={aliases} />

      <Section
        title="Missing in Xero"
        icon={<AlertCircle className="h-5 w-5 text-red-500" />}
        rows={missing}
        emptyHint="Every active deal has a matching repeating invoice."
        showXero={false}
      />

      <Section
        title="Amount mismatch"
        icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
        rows={mismatch}
        emptyHint="No deals are outside the 5% tolerance band."
        showXero={true}
      />

      <Section
        title="Aligned"
        icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
        rows={aligned}
        emptyHint="No deals reconciled yet — run the engine."
        showXero={true}
      />

      {closed.length > 0 && (
        <Section
          title="Resolved / ignored"
          icon={<CheckCircle2 className="h-5 w-5 text-muted-foreground" />}
          rows={closed}
          emptyHint=""
          showXero={true}
        />
      )}
    </div>
  );
}
