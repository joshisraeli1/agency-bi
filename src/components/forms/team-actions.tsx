"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeamMemberForm } from "./team-member-form";
import { formatCurrency, getAnnualRate, SALARY_MARKUP } from "@/lib/utils";
import { StatCard } from "@/components/charts/stat-card";
import { DollarSign } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  division: string | null;
  location: string | null;
  employmentType: string | null;
  costType: string | null;
  annualSalary: number | null;
  hourlyRate: number | null;
  weeklyHours: number | null;
  source: string;
  active: boolean;
  _count: { timeEntries: number };
}

const SERVICE_DIVISIONS = ["Content Delivery", "Paid Ads Management", "Social Media Management"];

function normaliseDivision(division: string | null): string {
  if (!division) return "Other";
  if (SERVICE_DIVISIONS.includes(division)) return division;
  return "Other";
}

function getMemberAnnualCost(member: TeamMember): number {
  if (member.annualSalary) {
    return member.annualSalary * SALARY_MARKUP;
  }
  if (member.hourlyRate) {
    return member.hourlyRate * (member.weeklyHours || 38) * 52;
  }
  return 0;
}

export function TeamActions({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeMembers = members.filter((m) => m.active);
  const totalTeamExpense = activeMembers.reduce((sum, m) => sum + getMemberAnnualCost(m), 0);

  const costByDivision = activeMembers.reduce<Record<string, { cost: number; count: number }>>((acc, m) => {
    const div = normaliseDivision(m.division);
    if (!acc[div]) acc[div] = { cost: 0, count: 0 };
    acc[div].cost += getMemberAnnualCost(m);
    acc[div].count++;
    return acc;
  }, {});

  const divisionRows = [...SERVICE_DIVISIONS, "Other"]
    .filter((d) => costByDivision[d])
    .map((d) => ({ division: d, ...costByDivision[d] }));

  function handleEdit(member: TeamMember) {
    setEditMember(member);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditMember(null);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteMember) return;
    setDeleting(true);
    await fetch(`/api/team/${deleteMember.id}`, { method: "DELETE" });
    setDeleteMember(null);
    setDeleting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground mt-1">
            {members.length} team members from all data sources.
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Team Member
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Team Members</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No team members yet. Add one or sync from Integrations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Annual Rate</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/team/${member.id}`}
                          className="font-medium hover:underline"
                        >
                          {member.name}
                        </Link>
                        {member.email && (
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{member.role || "\u2014"}</TableCell>
                    <TableCell>{member.division || "\u2014"}</TableCell>
                    <TableCell>
                      {member.employmentType ? (
                        <Badge variant="outline" className="text-xs">
                          {member.employmentType}
                        </Badge>
                      ) : (
                        "\u2014"
                      )}
                    </TableCell>
                    <TableCell>
                      {member.hourlyRate
                        ? `${formatCurrency(member.hourlyRate)}/hr`
                        : member.annualSalary
                        ? `${formatCurrency(member.annualSalary)}/yr`
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {member.annualSalary
                        ? `${formatCurrency(getAnnualRate(member.annualSalary)!)}/yr`
                        : member.hourlyRate
                        ? `${formatCurrency(member.hourlyRate)}/hr`
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {member.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.active ? "default" : "secondary"}>
                        {member.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {member._count.timeEntries}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(member)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteMember(member)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          title="Total Team Expense (Annual)"
          value={formatCurrency(totalTeamExpense)}
          description={`${activeMembers.length} active members`}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Cost by Division</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">Division</th>
                <th className="text-right py-2 px-3 font-medium">Members</th>
                <th className="text-right py-2 px-3 font-medium">Annual Cost</th>
              </tr>
            </thead>
            <tbody>
              {divisionRows.map((row) => (
                <tr key={row.division} className="border-b last:border-0">
                  <td className="py-2 px-3">{row.division}</td>
                  <td className="text-right py-2 px-3">{row.count}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(row.cost)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/50">
                <td className="py-2 px-3 font-semibold">Total</td>
                <td className="text-right py-2 px-3 font-semibold">{activeMembers.length}</td>
                <td className="text-right py-2 px-3 font-semibold">{formatCurrency(totalTeamExpense)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <TeamMemberForm
        key={editMember?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultValues={
          editMember
            ? {
                id: editMember.id,
                name: editMember.name,
                email: editMember.email ?? "",
                role: editMember.role ?? "",
                division: editMember.division ?? "",
                location: editMember.location ?? "",
                employmentType: editMember.employmentType ?? "",
                costType: editMember.costType ?? "",
                annualSalary: editMember.annualSalary,
                hourlyRate: editMember.hourlyRate,
                weeklyHours: editMember.weeklyHours,
                active: editMember.active,
              }
            : undefined
        }
        onSuccess={() => router.refresh()}
      />

      <Dialog open={!!deleteMember} onOpenChange={() => setDeleteMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteMember?.name}&quot;? Their time
              entries will be preserved but unlinked.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMember(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
