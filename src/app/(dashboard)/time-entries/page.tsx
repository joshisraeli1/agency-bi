import { Suspense } from "react";
import { db } from "@/lib/db";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { TimeEntriesActions } from "@/components/forms/time-entries-actions";

interface Props {
  searchParams: Promise<{ months?: string }>;
}

export default async function TimeEntriesPage({ searchParams }: Props) {
  const { months: monthsParam } = await searchParams;
  const months = parseInt(monthsParam || "12", 10);
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);

  const [entries, clients, teamMembers] = await Promise.all([
    db.timeEntry.findMany({
      where: { date: { gte: startDate } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        client: { select: { id: true, name: true } },
        teamMember: { select: { id: true, name: true } },
      },
    }),
    db.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.teamMember.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Time Entries</h1>
          <p className="text-muted-foreground mt-1">
            {entries.length} entries over the last {months} months.
          </p>
        </div>
        <Suspense>
          <DateRangePicker />
        </Suspense>
      </div>
      <TimeEntriesActions
        entries={entries}
        clients={clients}
        teamMembers={teamMembers}
      />
    </div>
  );
}
