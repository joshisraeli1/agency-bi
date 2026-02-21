import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateTimeEntrySchema } from "@/lib/validations/time-entry";
import { getSession } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const entry = await db.timeEntry.update({
    where: { id },
    data: {
      clientId: data.clientId || null,
      teamMemberId: data.teamMemberId || null,
      date: new Date(data.date),
      hours: data.hours,
      description: data.description || null,
      isOverhead: data.isOverhead,
    },
  });

  return NextResponse.json(entry);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await db.timeEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
