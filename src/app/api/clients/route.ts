import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClientSchema } from "@/lib/validations/client";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { timeEntries: true, deliverables: true, aliases: true },
      },
    },
  });
  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const client = await db.client.create({
    data: {
      name: data.name,
      status: data.status,
      industry: data.industry || null,
      website: data.website || null,
      retainerValue: data.retainerValue ?? null,
      dealStage: data.dealStage || null,
      notes: data.notes || null,
      source: "manual",
    },
  });

  return NextResponse.json(client, { status: 201 });
}
