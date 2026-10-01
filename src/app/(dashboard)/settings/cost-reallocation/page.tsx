"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface MemberRow {
  id: string;
  name: string;
  role: string | null;
  division: string | null;
  monthlyCost: number;
  fromAccount: string | null;
}

const NONE = "__none__";

export default function CostReallocationPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [month, setMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/cost-reallocation");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setMembers(data.members ?? []);
      setAccounts(data.accounts ?? []);
      setMonth(data.month ?? null);
    } catch {
      toast.error("Could not load the roster");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setAccountFor(id: string, account: string) {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, fromAccount: account === NONE ? null : account } : m))
    );
  }

  async function save() {
    setSaving(true);
    try {
      const entries = members
        .filter((m) => m.fromAccount)
        .map((m) => ({ teamMemberId: m.id, fromAccount: m.fromAccount }));
      const res = await fetch("/api/settings/cost-reallocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) throw new Error("save failed");
      const body = await res.json();
      toast.success(`${body.saved} reallocation${body.saved === 1 ? "" : "s"} saved`);
      load();
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  // What the saved set does to each division, so the effect is visible before
  // anyone goes looking for it on the analytics page.
  const moved = members.filter((m) => m.fromAccount && m.division);
  const net = new Map<string, number>();
  for (const m of moved) {
    net.set(m.division!, (net.get(m.division!) ?? 0) + m.monthlyCost);
  }

  const grouped = members.reduce<Record<string, MemberRow[]>>((acc, m) => {
    const k = m.division ?? "No division";
    (acc[k] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <h1 className="text-3xl font-bold mt-2">Salary reallocation</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">
          Some divisional staff are paid out of a shared salary account, which leaves their
          division looking cheaper than it is and overstates overhead. Name the account a person is
          actually paid from and their cost is counted against their own division instead.
        </p>
        <p className="text-muted-foreground text-sm mt-2 max-w-3xl">
          This changes reporting only — nothing is written back to Xero, and no total moves: what
          leaves the shared account is exactly what arrives at the division. Costs come from the
          roster, so a pay rise follows automatically.
        </p>
      </div>

      {moved.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What this moves each month</CardTitle>
            <CardDescription>
              {moved.length} {moved.length === 1 ? "person" : "people"}
              {month ? ` · priced on the ${month} roster` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {[...net.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([division, amount]) => (
                  <li key={division} className="flex justify-between gap-4 max-w-md">
                    <span>{division}</span>
                    <span className="tabular-nums">+{formatCurrency(Math.round(amount))}/mo</span>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Roster</CardTitle>
            <CardDescription>
              Leave someone unset when their pay is already in their own division&apos;s account.
            </CardDescription>
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Cost /mo</TableHead>
                  <TableHead>Paid out of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(grouped).map(([division, people]) => (
                  <>
                    <TableRow key={division} className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={3} className="font-medium text-sm py-2">
                        {division}
                      </TableCell>
                    </TableRow>
                    {people.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          {m.role && (
                            <div className="text-xs text-muted-foreground">{m.role}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(m.monthlyCost)}
                        </TableCell>
                        <TableCell>
                          {m.division === "Shared/Overhead" || !m.division ? (
                            <Badge variant="outline" className="text-xs">
                              n/a — already overhead
                            </Badge>
                          ) : (
                            <select
                              value={m.fromAccount ?? NONE}
                              onChange={(e) => setAccountFor(m.id, e.target.value)}
                              className="h-8 rounded-md border bg-background px-2 text-sm max-w-[22rem] w-full"
                            >
                              <option value={NONE}>Their own division&apos;s account</option>
                              {accounts.map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
