"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface AccountRow {
  account: string;
  monthlyAmount: number;
  autoDivision: string;
  division: string;
}

export default function CostAllocationPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [divisions, setDivisions] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/cost-allocation");
      const data = await res.json();
      setRows(data.accounts ?? []);
      setDivisions(data.divisions ?? []);
      setMonth(data.month ?? null);
    } catch {
      toast.error("Failed to load cost accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setDivision(account: string, division: string) {
    setRows((prev) => prev.map((r) => (r.account === account ? { ...r, division } : r)));
  }

  async function save() {
    setSaving(true);
    const overrides: Record<string, string> = {};
    for (const r of rows) overrides[r.account] = r.division;
    try {
      const res = await fetch("/api/settings/cost-allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      if (!res.ok) throw new Error();
      toast.success("Cost allocation saved — divisional margins will update.");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/settings" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Settings
          </Link>
          <h1 className="text-3xl font-bold mt-1">Cost Allocation</h1>
          <p className="text-muted-foreground mt-1">
            Assign each Xero P&amp;L expense line to a division. Division-named lines are
            auto-mapped; reassign anything in Shared/Overhead here.
            {month && <span className="ml-1">Amounts shown for {month}.</span>}
          </p>
        </div>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Expense lines</CardTitle>
          <CardDescription>{rows.length} accounts from the Xero P&amp;L</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                  <TableHead className="w-[240px]">Division</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.account}>
                    <TableCell className="font-medium">
                      {r.account}
                      {r.division !== r.autoDivision && (
                        <Badge variant="outline" className="ml-2 text-xs">overridden</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.monthlyAmount)}</TableCell>
                    <TableCell>
                      <Select value={r.division} onValueChange={(v) => setDivision(r.account, v)}>
                        <SelectTrigger className="w-[220px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {divisions.map((d) => (
                            <SelectItem key={d} value={d}>{d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
