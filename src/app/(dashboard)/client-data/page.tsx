import { Suspense } from "react";
import { db } from "@/lib/db";
import { getNewClientDealSize } from "@/lib/analytics/advanced-analytics";
import { getTimesheetClientMargin } from "@/lib/analytics/margin-analytics";
import { TimesheetMarginSection } from "@/components/dashboard/timesheet-margin-section";
import { ClientMovementTables } from "@/components/dashboard/client-movement-tables";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function ClientDataPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "12", 10);

  const [newClientDealSize, timesheetMargin] = await Promise.all([
    getNewClientDealSize(months),
    getTimesheetClientMargin(months),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Client Data</h1>
          <p className="text-muted-foreground mt-1">
            Client-specific revenue, churn, and margin breakdowns
          </p>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>

      <TimesheetMarginSection data={timesheetMargin} />

      <ClientMovementTables newClientDealSize={newClientDealSize} />
    </div>
  );
}
