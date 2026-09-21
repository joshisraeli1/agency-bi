"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  LabelList,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Receipt, PieChart, Repeat, TrendingUp, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type {
  ClientSuccessDashboard,
  PortfolioMonth,
  PortfolioQuarter,
  TermConversion,
} from "@/lib/analytics/client-success";

// Validated against the chart surface in both modes: orange↔teal separate at
// ΔE 13.8 under protanopia and both clear 3:1 contrast, so the two revenue
// series stay distinguishable without relying on the legend.
const PORTFOLIO = "#ea580c";
const DIVISION = "#0d9488";
// Upsell green and churn red match the divisional dashboard so the two pages
// read as one system. That pair separates at only ΔE 7.4 under deuteranopia and
// green sits below 3:1 on the surface, so EVERY bar carries a direct label —
// the colour is never the only thing telling the two apart.
const UPSELL = "#22c55e";
const CHURN = "#ef4444";

const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}K` : `$${v}`);

function Tile({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-semibold tabular-nums mt-2">{value}</p>
        {note && <p className="text-muted-foreground text-xs mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}

/** Who sits behind a point on a chart. Named clients, not just a number. */
function Detail({
  month,
  kind,
  onClose,
}: {
  month: PortfolioMonth;
  kind: "churn" | "upsell";
  onClose: () => void;
}) {
  const rows = kind === "churn" ? month.churnedClients : month.upsells;
  const total = kind === "churn" ? month.churnedRevenue : month.upsellRevenue;
  return (
    <div className="rounded-lg border p-4 mt-4">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium text-sm">
          {kind === "churn" ? "Churned" : "Upsells"} — {month.label}
          {kind === "churn" && month.clientsAtStart > 0 && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {month.clientsRetained} of {month.clientsAtStart} kept
            </span>
          )}
        </p>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:underline shrink-0">
          Close
        </button>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map((c, i) => (
          <li key={`${c.id}-${i}`} className="flex justify-between gap-4">
            <span>{c.name}</span>
            <span className="tabular-nums">{formatCurrency(c.revenue)}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-muted-foreground">
            {kind === "churn" ? "Nobody left this month." : "No upsells this month."}
          </li>
        )}
      </ul>
      {rows.length > 1 && (
        <p className="mt-3 pt-2 border-t text-sm flex justify-between gap-4 font-medium">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </p>
      )}
    </div>
  );
}

function TermGroup({
  title,
  rows,
  empty,
  note,
}: {
  title: string;
  rows: TermConversion["survived"];
  empty: string;
  note?: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium">
        {title}
        <span className="text-muted-foreground font-normal"> · {rows.length}</span>
      </p>
      {note && <p className="text-muted-foreground text-xs mt-0.5">{note}</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((c, i) => (
          <li key={`${c.id}-${i}`} className="flex justify-between gap-4">
            <span>{c.name}</span>
            <span className="tabular-nums">{formatCurrency(c.revenue)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted-foreground text-sm">{empty}</li>}
      </ul>
    </div>
  );
}

export function ClientSuccessView({ data }: { data: ClientSuccessDashboard }) {
  // 18 months are fetched so the quarterly view has depth; the monthly charts
  // stay at 12 so they don't get unreadably dense.
  const months = data.months.slice(-12);
  const { clients, quarters, termConversions } = data;
  const latest = months[months.length - 1];
  const [selected, setSelected] = useState<{ month: PortfolioMonth; kind: "churn" | "upsell" } | null>(
    null
  );
  const [selectedMovement, setSelectedMovement] = useState<{
    month: PortfolioMonth;
    kind: "churn" | "upsell";
  } | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<PortfolioQuarter | null>(null);
  const [openTerm, setOpenTerm] = useState<string | null>(null);

  // A zero month must still be labelled, or a gap reads as missing data rather
  // than as nothing having happened — and a month with no churn is a result.
  const money = (value: unknown) => {
    const v = Number(value);
    if (v === 0) return "$0";
    if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
  };

  const step = months.length > 8 ? 2 : 1;
  const ticks = months.filter((_, i) => i % step === 0).map((m) => m.label);

  const retentionData = months
    .filter((m) => m.retentionPct !== null)
    .map((m) => ({
      month: m.month,
      label: m.label,
      Retention: m.retentionPct,
      kept: m.clientsRetained,
      carried: m.clientsAtStart,
    }));

  const movementData = months.map((m) => ({
    month: m.month,
    label: m.label,
    Upsells: m.upsellRevenue,
    "Churned Revenue": m.churnedRevenue,
  }));

  // Only the 3-month minimum is shown. The 6-month had a single client behind it,
  // which is a percentage that says nothing.
  const terms = termConversions.filter((t) => t.months === 3);

  const quarterData = quarters.map((q) => ({
    quarter: q.quarter,
    label: q.label,
    "Churn rate": q.churnRatePct,
    lost: q.clientsLost,
    carried: q.clientsAtStart,
    revenueLost: q.revenueLost,
  }));

  const tenureData = months.map((m) => ({
    label: m.label,
    "Average tenure": m.avgTenureMonths,
    clients: m.clientsAtStart || m.clientsRetained,
  }));

  const revenueData = months.map((m) => ({
    label: m.label,
    Portfolio: m.revenue,
    [data.baseLabel]: m.divisionRevenue,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data.label}</h1>
        <p className="text-muted-foreground mt-1">
          The clients you look after, drawn from {data.baseLabel}. All figures are recurring
          revenue, ex-GST.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          icon={<Receipt className="h-4 w-4" />}
          label="Revenue you look after"
          value={formatCurrency(data.currentRevenue)}
          note={`${data.currentClientCount} client${data.currentClientCount === 1 ? "" : "s"}`}
        />
        <Tile
          icon={<PieChart className="h-4 w-4" />}
          label={`Share of ${data.baseLabel}`}
          value={`${data.sharePct}%`}
          note={`of ${formatCurrency(data.divisionRevenue)} across the division`}
        />
        <Tile
          icon={<Repeat className="h-4 w-4" />}
          label="Retention — last 12 months"
          value={data.retentionPct === null ? "—" : `${data.retentionPct}%`}
          note="clients kept of those carried into each month"
        />
        <Tile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Average lifetime value"
          value={formatCurrency(data.avgLtv)}
          note="per client, across everything they have ever run"
        />
        <Tile
          icon={<Clock className="h-4 w-4" />}
          label="Average tenure"
          value={`${data.avgTenureMonths} mo`}
          note="across the live portfolio, as at today"
        />
        <Tile
          icon={<Users className="h-4 w-4" />}
          label={`Retention — ${latest?.label ?? ""}`}
          value={latest?.retentionPct === null ? "—" : `${latest?.retentionPct}%`}
          note={
            latest ? `${latest.clientsRetained} kept of ${latest.clientsAtStart} carried in` : undefined
          }
        />
      </div>

      {/* Retention is the KPI, so it leads. One series — the title names it, so
          no legend box is needed. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Portfolio retained each month</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Of the clients carried into a month, the share still here at the end of it. A client won
            during the month counts in neither half, so winning work never flatters the rate. Click a
            month to see who left.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={retentionData}
                margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                onClick={(state) => {
                  const label = (state as { activeLabel?: string })?.activeLabel;
                  const m = months.find((x) => x.label === label);
                  if (m) setSelected({ month: m, kind: "churn" });
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={44}
                />
                <Tooltip
                  formatter={(v, _n, p) => [
                    `${v ?? 0}% — ${p?.payload?.kept ?? 0} of ${p?.payload?.carried ?? 0} kept`,
                    "Retention",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="Retention"
                  stroke={DIVISION}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {selected && (
            <Detail month={selected.month} kind={selected.kind} onClose={() => setSelected(null)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upsells vs churned revenue</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Expansion you won against revenue lost when a client left altogether. New business is
            excluded — it isn&apos;t your work. A client dropping one deal while keeping others is a
            contraction, not a churn, so it isn&apos;t counted here either. Click a bar for the
            clients behind it.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={movementData} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} fontSize={12} width={54} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Bar
                  dataKey="Upsells"
                  fill={UPSELL}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                  minPointSize={2}
                  cursor="pointer"
                  onClick={(bar) => {
                    const key = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                    const m = months.find((x) => x.month === key);
                    if (m) setSelectedMovement({ month: m, kind: "upsell" });
                  }}
                >
                  <LabelList dataKey="Upsells" position="top" fontSize={11} formatter={money} />
                </Bar>
                <Bar
                  dataKey="Churned Revenue"
                  fill={CHURN}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={34}
                  minPointSize={2}
                  cursor="pointer"
                  onClick={(bar) => {
                    const key = (bar as unknown as { payload?: { month?: string } })?.payload?.month;
                    const m = months.find((x) => x.month === key);
                    if (m) setSelectedMovement({ month: m, kind: "churn" });
                  }}
                >
                  <LabelList dataKey="Churned Revenue" position="top" fontSize={11} formatter={money} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {selectedMovement && (
            <Detail
              month={selectedMovement.month}
              kind={selectedMovement.kind}
              onClose={() => setSelectedMovement(null)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Churn rate by quarter</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            The share of the clients carried into each quarter that left during it. A monthly
            retention rate rises on its own as a book grows — one client leaving out of 22 reads
            better than the same client leaving out of 5 — so this measures inside each quarter,
            where growth can&apos;t flatter it. Click a bar to see who left.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={quarterData} margin={{ top: 22, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={44}
                />
                <Tooltip
                  formatter={(v, _n, p) => [
                    `${v ?? 0}% — ${p?.payload?.lost ?? 0} of ${p?.payload?.carried ?? 0} clients, ${formatCurrency(
                      Number(p?.payload?.revenueLost ?? 0)
                    )}`,
                    "Churn rate",
                  ]}
                />
                <Bar
                  dataKey="Churn rate"
                  fill={CHURN}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  minPointSize={2}
                  cursor="pointer"
                  onClick={(bar) => {
                    const key = (bar as unknown as { payload?: { quarter?: string } })?.payload?.quarter;
                    const q = quarters.find((x) => x.quarter === key);
                    if (q) setSelectedQuarter(q);
                  }}
                >
                  {/* The rate is the axis; the absolutes ride on the label rather
                      than a second scale, which would be a dual axis. */}
                  <LabelList
                    dataKey="lost"
                    position="top"
                    fontSize={11}
                    formatter={(v: unknown) => `${Number(v)} lost`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {selectedQuarter && (
            <div className="rounded-lg border p-4 mt-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-medium text-sm">
                  Left during {selectedQuarter.label}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {selectedQuarter.clientsLost} of {selectedQuarter.clientsAtStart} carried in ·{" "}
                    {formatCurrency(selectedQuarter.revenueLost)}
                  </span>
                </p>
                <button
                  onClick={() => setSelectedQuarter(null)}
                  className="text-sm text-muted-foreground hover:underline shrink-0"
                >
                  Close
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {selectedQuarter.churnedClients.map((c, i) => (
                  <li key={`${c.id}-${i}`} className="flex justify-between gap-4">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{formatCurrency(c.revenue)}</span>
                  </li>
                ))}
                {selectedQuarter.churnedClients.length === 0 && (
                  <li className="text-muted-foreground">Nobody left this quarter.</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {terms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past the minimum term</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">
              Of the clients who signed a minimum term and have since reached the end of it, how many
              carried on. Clients still inside their minimum are counted separately — they
              haven&apos;t had the chance yet, and scoring them as failures would understate this.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {terms.map((t) => (
              <div key={t.term}>
                <button
                  type="button"
                  onClick={() => setOpenTerm(openTerm === t.term ? null : t.term)}
                  aria-expanded={openTerm === t.term}
                  className="w-full text-left group"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-sm font-medium group-hover:underline">
                      {t.term.replace(" - ", "-")} minimum
                    </p>
                    <p className="text-sm tabular-nums">
                      <span className="text-2xl font-semibold">{t.conversionPct}%</span>
                      <span className="text-muted-foreground ml-2">
                        {t.converted} of {t.eligible} carried on
                      </span>
                    </p>
                  </div>
                  <div className="relative h-3 rounded-full bg-muted overflow-hidden mt-2">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${t.conversionPct}%`, background: UPSELL }}
                    />
                  </div>
                  <p className="text-muted-foreground text-xs mt-2">
                    {t.tooEarly > 0 ? `${t.tooEarly} still inside the minimum · ` : ""}
                    {openTerm === t.term ? "Hide the clients" : "Show the clients"}
                  </p>
                </button>

                {openTerm === t.term && (
                  <div className="rounded-lg border p-4 mt-3 space-y-4">
                    <TermGroup
                      title={`Carried on past ${t.months} months`}
                      rows={t.survived}
                      empty="Nobody has carried on yet."
                    />
                    <TermGroup
                      title="Stopped at the minimum"
                      rows={t.lapsed}
                      empty="Nobody stopped at the minimum."
                    />
                    <TermGroup
                      title="Still inside the minimum"
                      rows={t.pending}
                      empty="Nobody is still inside their minimum."
                      note="Not counted either way — they haven't reached the decision point."
                    />
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Average tenure over time</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            How long the clients live in each month had been with us by then, in months. Measured as
            at that month rather than today, so the line shows the book ageing: it climbs as clients
            are kept, and falls when a long-standing one leaves or several new ones arrive. The final
            point therefore sits just below the tile above, which counts to today rather than to the
            first of the month.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tenureData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis
                  tickFormatter={(v) => `${v} mo`}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={54}
                />
                <Tooltip formatter={(v) => [`${v ?? 0} months`, "Average tenure"]} />
                <Line
                  type="monotone"
                  dataKey="Average tenure"
                  stroke={PORTFOLIO}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue over time</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            Your portfolio against the whole of {data.baseLabel}. Both are monthly recurring revenue
            on one scale, so the gap between the lines is the part of the division you don&apos;t
            look after.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
                <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={fmtAxis} tickLine={false} axisLine={false} fontSize={12} width={54} />
                <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey={data.baseLabel}
                  stroke={DIVISION}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="Portfolio"
                  stroke={PORTFOLIO}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients</CardTitle>
          <p className="text-muted-foreground text-sm mt-1">
            {clients.length} client{clients.length === 1 ? "" : "s"} in your portfolio, by monthly
            revenue ex-GST.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left font-medium py-2 px-3">Client</th>
                  <th className="text-right font-medium py-2 px-3">Revenue (MRR)</th>
                  <th className="text-right font-medium py-2 px-3">Share</th>
                  <th className="text-right font-medium py-2 px-3">Lifetime value</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2 px-3">{c.name}</td>
                    <td className="text-right py-2 px-3 tabular-nums">{formatCurrency(c.revenue)}</td>
                    <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
                      {data.currentRevenue > 0
                        ? `${((c.revenue / data.currentRevenue) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="text-right py-2 px-3 tabular-nums">
                      {c.ltv ? formatCurrency(c.ltv) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2 px-3">Total</td>
                  <td className="text-right py-2 px-3 tabular-nums">
                    {formatCurrency(data.currentRevenue)}
                  </td>
                  <td className="text-right py-2 px-3 tabular-nums">100%</td>
                  <td className="text-right py-2 px-3 tabular-nums text-muted-foreground">
                    {formatCurrency(data.avgLtv)} avg
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
