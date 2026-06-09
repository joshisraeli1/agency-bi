import { Suspense } from "react";
import { getNewClientDealSize } from "@/lib/analytics/advanced-analytics";
import { ClientMovementTables } from "@/components/dashboard/client-movement-tables";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function ClientDataPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  // Default must match DateRangePicker's default ("6"); otherwise the dropdown
  // shows "Last 6 months" while the table renders 12.
  const months = parseInt(monthsParam || "6", 10);

  const newClientDealSize = await getNewClientDealSize(months);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Client Data</h1>
          <p className="text-muted-foreground mt-1">
            Client movement and new-client deal size
          </p>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      <ClientMovementTables newClientDealSize={newClientDealSize} />
    </div>
  );
}
