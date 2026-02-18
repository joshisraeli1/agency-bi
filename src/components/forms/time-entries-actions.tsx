"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
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
import { TimeEntryForm } from "./time-entry-form";

interface TimeEntry {
  id: string;
  clientId: string | null;
  teamMemberId: string | null;
  date: string | Date;
  hours: number;
  description: string | null;
  isOverhead: boolean;
  source: string;
  client: { id: string; name: string } | null;
  teamMember: { id: string; name: string } | null;
}

interface Props {
  entries: TimeEntry[];
  clients: { id: string; name: string }[];
  teamMembers: { id: string; name: string }[];
}

export function TimeEntriesActions({ entries, clients, teamMembers }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleEdit(entry: TimeEntry) {
    setEditEntry(entry);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditEntry(null);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteEntry) return;
    setDeleting(true);
    await fetch(`/api/time-entries/${deleteEntry.id}`, { method: "DELETE" });
    setDeleteEntry(null);
    setDeleting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time Entries</h1>
          <p className="text-muted-foreground mt-1">
            {entries.length} time entries logged.
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Entry
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Time Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No time entries yet. Add one or sync from Integrations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{entry.teamMember?.name || "\u2014"}</TableCell>
                    <TableCell>{entry.client?.name || "\u2014"}</TableCell>
                    <TableCell className="text-right">{entry.hours}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {entry.description || "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.isOverhead ? "secondary" : "outline"}>
                        {entry.isOverhead ? "Overhead" : "Billable"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {entry.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(entry)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteEntry(entry)}
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

      <TimeEntryForm
        key={editEntry?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        clients={clients}
        teamMembers={teamMembers}
        defaultValues={
          editEntry
            ? {
                id: editEntry.id,
                clientId: editEntry.clientId ?? "",
                teamMemberId: editEntry.teamMemberId ?? "",
                date: format(new Date(editEntry.date), "yyyy-MM-dd"),
                hours: editEntry.hours,
                description: editEntry.description ?? "",
                isOverhead: editEntry.isOverhead,
              }
            : undefined
        }
        onSuccess={() => router.refresh()}
      />

      <Dialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Time Entry</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this time entry?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEntry(null)}>
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
