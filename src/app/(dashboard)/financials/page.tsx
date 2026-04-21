import { Suspense } from "react";
import { db } from "@/lib/db";
import { getMonthRange } from "@/lib/utils";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { FinancialsActions } from "@/components/forms/financials-actions";

const typeColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  retainer: "default",
  project: "secondary",
  cost: "destructive",
  hours: "outline",
};

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function FinancialsPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "12", 10);
  const monthRange = getMonthRange(months);

  const [records, clients] = await Promise.all([
    db.financialRecord.findMany({
      where: { month: { in: monthRange } },
      orderBy: [{ month: "desc" }, { createdAt: "desc" }],
      include: {
        client: { select: { id: true, name: true } },
      },
    }),
    db.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Records</h1>
          <p className="text-muted-foreground mt-1">
            {records.length} records over the last {months} months.
          </p>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>
      <FinancialsActions records={records} clients={clients} typeColors={typeColors} />
    </div>
  );
}
