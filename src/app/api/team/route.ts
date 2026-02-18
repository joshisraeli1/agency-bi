import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createTeamMemberSchema } from "@/lib/validations/team-member";

export async function GET() {
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

  return NextResponse.json(member, { status: 201 });
}
