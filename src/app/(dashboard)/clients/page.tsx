import Link from "next/link";
import { db } from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  paused: "secondary",
  churned: "destructive",
  prospect: "outline",
};

export default async function ClientsPage() {
  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          timeEntries: true,
          deliverables: true,
          aliases: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Clients</h1>
        <p className="text-muted-foreground mt-1">
          {clients.length} clients synced from all data sources.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Clients</CardTitle>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No clients yet. Sync data from Integrations to populate this list.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Retainer</TableHead>
                  <TableHead>Deal Stage</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Deliverables</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
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
                    <TableCell>
                      {client.retainerValue
                        ? formatCurrency(client.retainerValue)
                        : "—"}
                    </TableCell>
                    <TableCell>{client.dealStage || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {client.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {client._count.timeEntries}
                    </TableCell>
                    <TableCell className="text-right">
                      {client._count.deliverables}
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
