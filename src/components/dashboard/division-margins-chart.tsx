"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Row {
  name: string;
  marginPercent: number;
  ratio: number;
  label: string; // "59% · 2.5x"
}

export function DivisionMarginsChart({ data }: { data: Row[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Division Margins</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}%`} width={48} />
            <Tooltip formatter={(v) => `${Number(v)}%`} />
            <Bar dataKey="marginPercent" fill="#6366f1" radius={[4, 4, 0, 0]}>
              <LabelList dataKey="label" position="top" style={{ fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
