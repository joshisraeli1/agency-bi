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
  contentRetainer: number | null;
  smRetainer: number | null;
  growthRetainer: number | null;
  productionRetainer: number | null;
  dealStage: string | null;
  source: string;
  notes: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  ltv?: number | null;
  division: string;
  _count: { timeEntries: number; aliases: number };
}

type ServiceFilter = "all" | "content" | "social" | "ads";

const SERVICE_LABELS: Record<Exclude<ServiceFilter, "all">, string> = {
  content: "Content Delivery",
  social: "Social Media Management",
  ads: "Ads Management",
};

// Deal-based: a client belongs to one division; its amount is the full
// (deal-derived) retainer. Matches the Revenue by Package Type grouping.
function serviceAmount(client: Client, filter: ServiceFilter): number {
  if (filter === "all") return client.retainerValue ?? 0;
  return client.division === SERVICE_LABELS[filter] ? (client.retainerValue ?? 0) : 0;
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
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");

  const filteredClients = (() => {
    let list = statusFilter === "all" ? clients : clients.filter((c) => c.status === statusFilter);
    if (serviceFilter !== "all") {
      list = list.filter((c) => serviceAmount(c, serviceFilter) > 0);
    }
    return [...list].sort((a, b) => serviceAmount(b, serviceFilter) - serviceAmount(a, serviceFilter));
  })();

  const divisionTotal = serviceFilter === "all"
    ? 0
    : filteredClients.reduce((sum, c) => sum + serviceAmount(c, serviceFilter), 0);

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

      <div className="flex items-center rounded-md border w-fit">
        <Button
          variant={serviceFilter === "all" ? "default" : "ghost"}
          size="sm"
          onClick={() => setServiceFilter("all")}
          className="rounded-r-none"
        >
          All Services
        </Button>
        <Button
          variant={serviceFilter === "content" ? "default" : "ghost"}
          size="sm"
          onClick={() => setServiceFilter("content")}
          className="rounded-none border-l"
        >
          Content Delivery
        </Button>
        <Button
          variant={serviceFilter === "social" ? "default" : "ghost"}
          size="sm"
          onClick={() => setServiceFilter("social")}
          className="rounded-none border-l"
        >
          Social Media Management
        </Button>
        <Button
          variant={serviceFilter === "ads" ? "default" : "ghost"}
          size="sm"
          onClick={() => setServiceFilter("ads")}
          className="rounded-l-none border-l"
        >
          Ads Management
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {serviceFilter === "all"
                ? `${statusFilter === "all" ? "All" : statusFilter === "active" ? "Active" : "Churned"} Clients`
                : SERVICE_LABELS[serviceFilter]}
            </CardTitle>
            {serviceFilter !== "all" && (
              <div className="text-right">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Divisional Revenue
                </div>
                <div className="text-2xl font-bold tabular-nums">
                  {formatCurrency(divisionTotal)}
                </div>
              </div>
            )}
          </div>
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
                  <TableHead className="text-right">
                    {serviceFilter === "all" ? "Deal Size" : "Amount"}
                  </TableHead>
                  <TableHead className="text-right">LTV</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
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
                    <TableCell className="text-right tabular-nums">
                      {(() => {
                        const amt = serviceAmount(client, serviceFilter);
                        return amt > 0 ? formatCurrency(amt) : "\u2014";
                      })()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {client.ltv ? formatCurrency(client.ltv) : "\u2014"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={client.industry || ""}>
                      {client.industry || "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      {client._count.timeEntries}
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
              delete all related financial records and time entries.
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
