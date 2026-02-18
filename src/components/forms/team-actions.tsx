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
import { formatCurrency } from "@/lib/utils";

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
  _count: { timeEntries: number; deliverableAssignments: number };
}

export function TeamActions({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);
  const [deleting, setDeleting] = useState(false);

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
                  <TableHead>Rate</TableHead>
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
