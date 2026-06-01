"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { NewClientDealSizeData } from "@/lib/analytics/types";

interface Props {
  data: NewClientDealSizeData;
}

interface ClientRef {
  clientName: string;
  dealSize: number;
}

const PRIMARY = "#ea580c";

export function DealSizeChart({ data }: Props) {
  const [division, setDivision] = useState<string>("all");
  const [selected, setSelected] = useState<{ title: string; clients: ClientRef[] } | null>(null);

  const divisions = useMemo(() => {
    const set = new Set<string>();
    for (const m of data.months) for (const c of m.clients) if (c.division) set.add(c.division);
    return Array.from(set).sort();
  }, [data.months]);

  // Per-month new clients (the "won per month" series)
  const monthly = useMemo(() => {
    return data.months.map((m) => {
      const clients = (division === "all" ? m.clients : m.clients.filter((c) => c.division === division)).filter((c) => c.dealSize > 0);
      const avg = clients.length ? Math.round(clients.reduce((s, c) => s + c.dealSize, 0) / clients.length) : 0;
      return { monthKey: m.month, month: formatMonth(m.month), avgDealSize: avg, clients: clients.map((c) => ({ clientName: c.clientName, dealSize: c.dealSize })) };
    });
  }, [data.months, division]);

  // Rolling = cumulative average across every client acquired up to each month
  // (includes clients that later churned, since they're counted in their start
  // month). Smoother + reflects the whole book, not just the latest month.
  const rolling = useMemo(() => {
    const cum: ClientRef[] = [];
    return monthly.map((pt) => {
      cum.push(...pt.clients);
      const avg = cum.length ? Math.round(cum.reduce((s, c) => s + c.dealSize, 0) / cum.length) : 0;
      return { month: pt.month, avgDealSize: avg, clients: [...cum] };
    });
  }, [monthly]);

  if (monthly.every((m) => m.clients.length === 0)) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Average Deal Size Over Time</h2>
          <p className="text-muted-foreground text-sm mt-1">Rolling (cumulative, incl. churned) vs new clients won each month</p>
        </div>
        <Select value={division} onValueChange={setDivision}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Divisions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Divisions</SelectItem>
            {divisions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Avg Deal Size (Rolling)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart
              data={rolling}
              onClick={(state) => {
                const i = state?.activeTooltipIndex;
                if (typeof i === "number" && rolling[i]) setSelected({ title: `Through ${rolling[i].month}`, clients: rolling[i].clients });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line dataKey="avgDealSize" stroke={PRIMARY} strokeWidth={2} dot={{ r: 4, cursor: "pointer" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Click a point to see the clients counted up to that month.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Avg Deal Size Won per Month</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar
                dataKey="avgDealSize"
                fill={PRIMARY}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(_, index) => {
                  const m = monthly[index];
                  if (m) setSelected({ title: `New clients — ${m.month}`, clients: m.clients });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Click a bar to see that month&apos;s new clients.</p>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selected.title} · {selected.clients.length} clients</CardTitle>
              <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:underline">Close</button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {[...selected.clients].sort((a, b) => b.dealSize - a.dealSize).map((c, i) => (
                <div key={`${c.clientName}-${i}`} className="flex items-baseline justify-between text-sm border-b py-1 last:border-0">
                  <span className="truncate mr-2">{c.clientName}</span>
                  <span className="tabular-nums">{formatCurrency(c.dealSize)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
