import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateTimeEntrySchema } from "@/lib/validations/time-entry";
import { requireRole, logAudit } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("manager");
  if (auth.error) return auth.error;
  const session = auth.session;

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

  await logAudit({ action: "time_entry_updated", userId: session.userId, entity: "time_entry", entityId: entry.id, details: `Updated time entry: ${data.hours}h on ${data.date}` });

  return NextResponse.json(entry);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("manager");
  if (auth.error) return auth.error;
  const session = auth.session;

  const { id } = await params;
  await db.timeEntry.delete({ where: { id } });

  await logAudit({ action: "time_entry_deleted", userId: session.userId, entity: "time_entry", entityId: id, details: `Deleted time entry: ${id}` });

  return NextResponse.json({ success: true });
}
