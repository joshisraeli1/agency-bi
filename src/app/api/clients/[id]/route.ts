import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateClientSchema } from "@/lib/validations/client";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const client = await db.client.update({
    where: { id },
    data: {
      name: data.name,
      status: data.status,
      industry: data.industry || null,
      website: data.website || null,
      retainerValue: data.retainerValue ?? null,
      dealStage: data.dealStage || null,
      notes: data.notes || null,
    },
  });

  return NextResponse.json(client);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.client.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
