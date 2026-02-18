import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateTeamMemberSchema } from "@/lib/validations/team-member";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateTeamMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const member = await db.teamMember.update({
    where: { id },
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
    },
  });

  return NextResponse.json(member);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.teamMember.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
