"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";

interface DealRef {
  name: string;
  amount: number;
}

interface RevenuePoint {
  month: string;
  revenue: number;
  deals: DealRef[];
}

interface DealsPoint {
  month: string;
  deals: number;
  dealList: DealRef[];
}

interface Props {
  revenueData: RevenuePoint[];
  newRevenueData: { month: string; newRevenue: number }[];
  dealsCreatedData: DealsPoint[];
  mrrGoal: number;
  dealsGoal: number;
}

interface Selection {
  title: string;
  deals: DealRef[];
  formatAmount: boolean;
}

const PRIMARY = "#6366f1";
const GOAL = "#ef4444";

export function MichaelCharts({
  revenueData,
  newRevenueData,
  dealsCreatedData,
  mrrGoal,
  dealsGoal,
}: Props) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const drill = (
    <DrillPanel selected={selected} onClose={() => setSelected(null)} />
  );

  return (
    <div className="space-y-6">
      {/* MRR vs goal — clickable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Monthly Recurring Revenue vs Goal ({formatCurrency(mrrGoal)}/mo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <ReferenceLine y={mrrGoal} stroke={GOAL} strokeDasharray="4 4" label={{ value: "Goal", position: "right", fill: GOAL, fontSize: 11 }} />
              <Bar
                dataKey="revenue"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(_, index) => {
                  const d = revenueData[index];
                  if (d) setSelected({ title: `MRR — ${d.month}`, deals: d.deals ?? [], formatAmount: true });
                }}
              >
                {revenueData.map((d, i) => (
                  <Cell key={i} fill={d.revenue >= mrrGoal ? "#16a34a" : PRIMARY} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Click a bar to see the deals making up that month.</p>
        </CardContent>
      </Card>

      {/* New deals created vs goal — clickable */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            New Deals Created per Month vs Goal ({dealsGoal}/mo)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={dealsCreatedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={40} />
              <Tooltip />
              <ReferenceLine y={dealsGoal} stroke={GOAL} strokeDasharray="4 4" label={{ value: "Goal", position: "right", fill: GOAL, fontSize: 11 }} />
              <Bar
                dataKey="deals"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(_, index) => {
                  const d = dealsCreatedData[index];
                  if (d) setSelected({ title: `Deals created — ${d.month}`, deals: d.dealList ?? [], formatAmount: true });
                }}
              >
                {dealsCreatedData.map((d, i) => (
                  <Cell key={i} fill={d.deals >= dealsGoal ? "#16a34a" : PRIMARY} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Click a bar to see which deals were created that month.</p>
        </CardContent>
      </Card>

      {/* New revenue won per month */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Revenue Won per Month</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={newRevenueData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrency(v)} width={80} />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Bar dataKey="newRevenue" fill={PRIMARY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {drill}
    </div>
  );
}

function DrillPanel({ selected, onClose }: { selected: Selection | null; onClose: () => void }) {
  if (!selected) return null;
  const total = selected.deals.reduce((s, d) => s + d.amount, 0);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {selected.title} · {selected.deals.length} deals · {formatCurrency(total)}
          </CardTitle>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:underline">
            Close
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {selected.deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deals for this month.</p>
        ) : (
          <div className="space-y-1">
            {[...selected.deals]
              .sort((a, b) => b.amount - a.amount)
              .map((d, i) => (
                <div key={`${d.name}-${i}`} className="flex items-baseline justify-between text-sm border-b py-1 last:border-0">
                  <span className="truncate mr-2">{d.name}</span>
                  <span className="tabular-nums">{formatCurrency(d.amount)}</span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
