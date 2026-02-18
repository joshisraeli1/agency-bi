"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { FinancialForm } from "./financial-form";
import { formatCurrency } from "@/lib/utils";

interface FinancialRecord {
  id: string;
  clientId: string;
  month: string;
  type: string;
  category: string | null;
  amount: number;
  hours: number | null;
  description: string | null;
  source: string;
  client: { id: string; name: string };
}

interface Props {
  records: FinancialRecord[];
  clients: { id: string; name: string }[];
  typeColors: Record<string, "default" | "secondary" | "destructive" | "outline">;
}

export function FinancialsActions({ records, clients, typeColors }: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FinancialRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<FinancialRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleEdit(record: FinancialRecord) {
    setEditRecord(record);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditRecord(null);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) return;
    setDeleting(true);
    await fetch(`/api/financials/${deleteRecord.id}`, { method: "DELETE" });
    setDeleteRecord(null);
    setDeleting(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Records</h1>
          <p className="text-muted-foreground mt-1">
            {records.length} financial records across all clients.
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Add Record
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Financial Records</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No financial records yet. Add one or sync from Integrations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.client.name}</TableCell>
                    <TableCell>{record.month}</TableCell>
                    <TableCell>
                      <Badge variant={typeColors[record.type] || "outline"}>
                        {record.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{record.category || "\u2014"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(record.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {record.hours ?? "\u2014"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {record.source}
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
                          <DropdownMenuItem onClick={() => handleEdit(record)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteRecord(record)}
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

      <FinancialForm
        key={editRecord?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        clients={clients}
        defaultValues={
          editRecord
            ? {
                id: editRecord.id,
                clientId: editRecord.clientId,
                month: editRecord.month,
                type: editRecord.type as "retainer" | "project" | "cost" | "hours",
                category: editRecord.category ?? "",
                amount: editRecord.amount,
                hours: editRecord.hours,
                description: editRecord.description ?? "",
              }
            : undefined
        }
        onSuccess={() => router.refresh()}
      />

      <Dialog open={!!deleteRecord} onOpenChange={() => setDeleteRecord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Financial Record</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteRecord?.type} record for{" "}
              {deleteRecord?.client.name} ({deleteRecord?.month})?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRecord(null)}>
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
