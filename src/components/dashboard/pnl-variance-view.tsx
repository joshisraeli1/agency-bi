"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { AccountRow, PnlVariance, DivisionReconciliation } from "@/lib/analytics/pnl-variance";

const TONE: Record<AccountRow["tone"], string> = {
  neutral: "text-muted-foreground",
  watch: "text-amber-700 dark:text-amber-500",
  alert: "text-red-600 dark:text-red-500",
};

const signed = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;

function Rows({
  rows,
  showAll,
}: {
  rows: AccountRow[];
  showAll: boolean;
}) {
  // Quiet accounts are kept but collapsed: a page that hides them cannot be
  // reconciled against the P&L, and a page that leads with them buries the
  // movements worth reading.
  const shown = showAll ? rows : rows.filter((r) => r.tone !== "neutral" || Math.abs(r.delta) > 0);
  return (
    <>
      {shown.map((r) => (
        <tr key={r.account} className="border-b align-top">
          <td className="py-2 px-3">
            <div className="font-medium">{r.account}</div>
            {r.division !== "Shared/Overhead" && (
              <div className="text-xs text-muted-foreground">{r.division}</div>
            )}
          </td>
          <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(r.current)}</td>
          <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
            {formatCurrency(r.prior)}
          </td>
          <td
            className={`text-right py-2 px-3 tabular-nums ${
              r.delta === 0 ? "text-muted-foreground" : r.delta > 0 ? "" : ""
            }`}
          >
            {signed(r.delta)}
            {r.deltaPercent !== null && r.delta !== 0 && (
              <div className="text-xs text-muted-foreground">
                {r.deltaPercent > 0 ? "+" : "−"}
                {Math.abs(r.deltaPercent)}%
              </div>
            )}
          </td>
          <td className={`py-2 px-3 text-sm max-w-[34em] ${TONE[r.tone]}`}>{r.note}</td>
        </tr>
      ))}
    </>
  );
}

function ReconciliationRow({ r }: { r: DivisionReconciliation }) {
  const direction = r.gap >= 0 ? "more than" : "less than";
  return (
    <tr className="border-b bg-muted/40">
      <td className="py-2 px-3 font-medium">{r.division}</td>
      <td className="text-right py-2 px-3 tabular-nums font-medium">
        {formatCurrency(r.xeroRevenue)}
      </td>
      <td className="text-right py-2 px-3 tabular-nums text-muted-foreground" colSpan={2}>
        HubSpot {formatCurrency(r.hubspotMrr)}
      </td>
      <td className="py-2 px-3 text-sm max-w-[34em] space-y-1">
        {Math.abs(r.gap) < 500 ? (
          <p className="text-muted-foreground">
            Xero and HubSpot agree to within {formatCurrency(Math.abs(r.gap))}. Nothing to chase.
          </p>
        ) : (
          <p className={Math.abs(r.unexplained) > 20000 ? "text-amber-700 dark:text-amber-500" : "text-muted-foreground"}>
            Xero billed {formatCurrency(Math.abs(r.gap))} {direction} HubSpot has under contract.
            {r.oneOff > 0 && ` ${formatCurrency(r.oneOff)} of that is one-off project work, which HubSpot never counts as recurring.`}
            {` That leaves ${formatCurrency(Math.abs(r.unexplained))} unexplained.`}
          </p>
        )}
        {(r.won.length > 0 || r.lost.length > 0) && (
          <p className="text-muted-foreground">
            {r.won.length > 0 && (
              <>
                Won: {r.won.map((c) => `${c.name} ${formatCurrency(c.amount)}`).join(", ")}.{" "}
              </>
            )}
            {r.lost.length > 0 && (
              <>Lost: {r.lost.map((c) => `${c.name} ${formatCurrency(c.amount)}`).join(", ")}.</>
            )}
          </p>
        )}
        {r.won.length === 0 && r.lost.length === 0 && (
          <p className="text-muted-foreground">No client moved in or out this month.</p>
        )}
      </td>
    </tr>
  );
}

export function PnlVarianceView({ data }: { data: PnlVariance }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const needsLook = [...data.revenue, ...data.costs].filter((r) => r.tone !== "neutral").length;

  // Revenue is grouped by division so the HubSpot comparison can sit with the
  // accounts it is actually about, rather than in a table of its own.
  const divisions = [...new Set(data.revenue.map((r) => r.division))];
  const reconByDivision = new Map(data.reconciliation.map((r) => [r.division, r]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">P&amp;L Analysis</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Every Xero account for {data.monthLabel} against {data.priorLabel}, with what the
            movement looks like — and, for revenue, whether Xero and HubSpot agree.
          </p>
        </div>
        <select
          value={data.month}
          onChange={(e) => router.push(`/pnl?month=${e.target.value}`)}
          className="h-9 rounded-md border bg-background px-3 text-sm shrink-0"
        >
          {data.available.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
              {m.likelyOpen ? " — still open" : ""}
            </option>
          ))}
        </select>
      </div>

      {data.health.likelyOpen && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {data.monthLabel} is not closed yet
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {data.health.reason}. Every figure below is partial, and the margin it implies is not
            real. Compare a closed month unless you are specifically checking what has posted so
            far.
          </p>
        </div>
      )}

      {data.priorHealth.likelyOpen && !data.health.likelyOpen && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">The comparison month is incomplete</p>
          <p className="text-muted-foreground text-sm mt-1">
            {data.priorLabel} {data.priorHealth.reason}, so every movement below is measured against
            a partial month and will overstate the change.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm">
          <span className="text-2xl font-semibold tabular-nums">{needsLook}</span>
          <span className="text-muted-foreground ml-2">
            account{needsLook === 1 ? "" : "s"} worth a look · {data.revenue.length + data.costs.length}{" "}
            in total
          </span>
        </p>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-sm rounded-md border px-3 py-1.5 hover:bg-muted"
        >
          {showAll ? "Hide unchanged accounts" : "Show every account"}
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Grouped by the division each account belongs to in Xero. The shaded row compares that
            division&apos;s billed revenue against what HubSpot has under contract.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-2 px-3">Account</th>
                  <th className="text-right font-medium py-2 px-3">{data.monthLabel}</th>
                  <th className="text-right font-medium py-2 px-3">{data.priorLabel}</th>
                  <th className="text-right font-medium py-2 px-3">Change</th>
                  <th className="text-left font-medium py-2 px-3">What it looks like</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((division) => {
                  const rows = data.revenue.filter((r) => r.division === division);
                  const recon = reconByDivision.get(division);
                  return (
                    <>
                      <Rows key={division} rows={rows} showAll={showAll} />
                      {recon && <ReconciliationRow key={`${division}-recon`} r={recon} />}
                    </>
                  );
                })}
                <tr className="font-semibold">
                  <td className="py-2 px-3">Total revenue</td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {formatCurrency(data.totals.revenue.current)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
                    {formatCurrency(data.totals.revenue.prior)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {signed(data.totals.revenue.current - data.totals.revenue.prior)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Costs</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Ranked by how much each account moved, largest first — a 500% swing on a $240 account is
            noise, and a 4% slip on payroll is not.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-2 px-3">Account</th>
                  <th className="text-right font-medium py-2 px-3">{data.monthLabel}</th>
                  <th className="text-right font-medium py-2 px-3">{data.priorLabel}</th>
                  <th className="text-right font-medium py-2 px-3">Change</th>
                  <th className="text-left font-medium py-2 px-3">What it looks like</th>
                </tr>
              </thead>
              <tbody>
                <Rows rows={data.costs} showAll={showAll} />
                <tr className="font-semibold">
                  <td className="py-2 px-3">Total cost</td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {formatCurrency(data.totals.cost.current)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
                    {formatCurrency(data.totals.cost.prior)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {signed(data.totals.cost.current - data.totals.cost.prior)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data.unmatchedXero.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Billed in Xero, not in HubSpot</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              {data.unmatchedXero.length} active repeating invoices with no HubSpot deal behind
              them, worth{" "}
              {formatCurrency(data.unmatchedXero.reduce((s2, c) => s2 + c.monthly, 0))} a month.
              Either the CRM is missing a deal, or the Xero contact name does not match one and
              needs an alias — the two look identical from here, so both are listed rather than
              guessed between.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.unmatchedXero.map((c) => (
                <li key={`${c.name}-${c.monthly}`} className="flex justify-between gap-4">
                  <span>{c.name}</span>
                  <span className="tabular-nums shrink-0">{formatCurrency(c.monthly)}/mo</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-muted-foreground text-xs flex items-center gap-1.5">
        <ArrowRight className="h-3 w-3" />
        Costs are the Xero figure for each account, so every row ties to the P&amp;L line. Nothing
        here is allocated or interpreted.
      </p>
    </div>
  );
}
