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
import { FinancialsActions } from "@/components/forms/financials-actions";

const typeColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  retainer: "default",
  project: "secondary",
  cost: "destructive",
  hours: "outline",
};

export default async function FinancialsPage() {
  const records = await db.financialRecord.findMany({
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { id: true, name: true } },
    },
  });

  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <FinancialsActions records={records} clients={clients} typeColors={typeColors} />
    </div>
  );
}
