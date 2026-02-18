import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createTimeEntrySchema } from "@/lib/validations/time-entry";

export async function GET() {
  const entries = await db.timeEntry.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { id: true, name: true } },
      teamMember: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createTimeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const entry = await db.timeEntry.create({
    data: {
      clientId: data.clientId || null,
      teamMemberId: data.teamMemberId || null,
      date: new Date(data.date),
      hours: data.hours,
      description: data.description || null,
      isOverhead: data.isOverhead,
      source: "manual",
    },
  });

  return NextResponse.json(entry, { status: 201 });
}
