import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createTeamMemberSchema } from "@/lib/validations/team-member";
import { requireAuth, requireRole, logAudit } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const members = await db.teamMember.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { timeEntries: true, deliverableAssignments: true },
      },
    },
  });
  return NextResponse.json(members);
}

export async function POST(request: Request) {
  const auth = await requireRole("manager");
  if (auth.error) return auth.error;
  const session = auth.session;

  const body = await request.json();
  const parsed = createTeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const member = await db.teamMember.create({
    data: {
      name: data.name,
      email: data.email || null,
      role: data.role || null,
      division: data.division || null,
      location: data.location || null,
      employmentType: data.employmentType || null,
      costType: data.costType || null,
      annualSalary: data.annualSalary ?? null,
      hourlyRate: data.hourlyRate ?? null,
      weeklyHours: data.weeklyHours ?? null,
      active: data.active,
      source: "manual",
    },
  });

  await logAudit({ action: "team_member_created", userId: session.userId, entity: "team_member", entityId: member.id, details: `Created team member: ${member.name}` });

  return NextResponse.json(member, { status: 201 });
}
