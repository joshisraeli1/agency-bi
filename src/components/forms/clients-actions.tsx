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
import { ClientForm } from "./client-form";
import { formatCurrency } from "@/lib/utils";

interface Client {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  website: string | null;
  retainerValue: number | null;
  dealStage: string | null;
  source: string;
  notes: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  _count: { timeEntries: number; deliverables: number; aliases: number };
}

function formatTenure(startDate: Date | string | null, endDate: Date | string | null, status: string): string {
  if (!startDate) return "\u2014";
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const totalMonths = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));

  let duration: string;
  if (totalMonths < 1) duration = "<1 mo";
  else if (totalMonths < 12) duration = `${totalMonths} mo`;
  else {
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    duration = months === 0 ? `${years}y` : `${years}y ${months}mo`;
  }

  if (status === "active") return `Current - ${duration}`;
  return duration;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  churned: "destructive",
  prospect: "outline",
};

type StatusFilter = "active" | "churned" | "all";

export function ClientsActions({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const filteredClients = statusFilter === "all"
    ? clients
    : clients.filter((c) => c.status === statusFilter);

  function handleEdit(client: Client) {
    setEditClient(client);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditClient(null);
    setFormOpen(true);
  }

  async function handleDelete() {
    if (!deleteClient) return;
    setDeleting(true);
    await fetch(`/api/clients/${deleteClient.id}`, { method: "DELETE" });
    setDeleteClient(null);
    setDeleting(false);
    router.refresh();
  }

  const activeCount = clients.filter((c) => c.status === "active").length;
  const churnedCount = clients.filter((c) => c.status === "churned").length;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Clients</h1>
          <p className="text-muted-foreground mt-1">
            {filteredClients.length} clients
            {statusFilter !== "all" && ` (${clients.length} total)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border">
            <Button
              variant={statusFilter === "active" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("active")}
              className="rounded-r-none"
            >
              Active ({activeCount})
            </Button>
            <Button
              variant={statusFilter === "churned" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("churned")}
              className="rounded-none border-x"
            >
              Churned ({churnedCount})
            </Button>
            <Button
              variant={statusFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className="rounded-l-none"
            >
              All
            </Button>
          </div>
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{statusFilter === "all" ? "All" : statusFilter === "active" ? "Active" : "Churned"} Clients</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredClients.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No {statusFilter === "all" ? "" : statusFilter + " "}clients found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Retainer</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Deliverables</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div>
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-medium hover:underline"
                        >
                          {client.name}
                        </Link>
                        {client._count.aliases > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (+{client._count.aliases} aliases)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusColors[client.status] || "outline"}>
                        {client.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTenure(client.startDate, client.endDate, client.status)}
                    </TableCell>
                    <TableCell>
                      {client.retainerValue
                        ? formatCurrency(client.retainerValue)
                        : "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={client.industry || ""}>
                      {client.industry || "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {client._count.timeEntries}
                    </TableCell>
                    <TableCell className="text-right">
                      {client._count.deliverables}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(client)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteClient(client)}
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

      <ClientForm
        key={editClient?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultValues={
          editClient
            ? {
                id: editClient.id,
                name: editClient.name,
                status: editClient.status as "active" | "paused" | "churned" | "prospect",
                industry: editClient.industry ?? "",
                website: editClient.website ?? "",
                retainerValue: editClient.retainerValue,
                dealStage: editClient.dealStage ?? "",
                notes: editClient.notes ?? "",
              }
            : undefined
        }
        onSuccess={() => router.refresh()}
      />

      <Dialog open={!!deleteClient} onOpenChange={() => setDeleteClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteClient?.name}&quot;? This will also
              delete all related financial records, time entries, and deliverables.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteClient(null)}>
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
