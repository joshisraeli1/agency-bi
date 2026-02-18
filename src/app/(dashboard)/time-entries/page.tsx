import { db } from "@/lib/db";
import { TimeEntriesActions } from "@/components/forms/time-entries-actions";

export default async function TimeEntriesPage() {
  const entries = await db.timeEntry.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { id: true, name: true } },
      teamMember: { select: { id: true, name: true } },
    },
  });

  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const teamMembers = await db.teamMember.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <TimeEntriesActions
        entries={entries}
        clients={clients}
        teamMembers={teamMembers}
      />
    </div>
  );
}
