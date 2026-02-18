import { db } from "@/lib/db";
import { TeamActions } from "@/components/forms/team-actions";

export default async function TeamPage() {
  const members = await db.teamMember.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          timeEntries: true,
          deliverableAssignments: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <TeamActions members={members} />
    </div>
  );
}
