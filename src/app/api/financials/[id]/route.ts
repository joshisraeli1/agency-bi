import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateFinancialSchema } from "@/lib/validations/financial";
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
  const parsed = updateFinancialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const record = await db.financialRecord.update({
    where: { id },
    data: {
      clientId: data.clientId,
      month: data.month,
      type: data.type,
      category: data.category || null,
      amount: data.amount,
      hours: data.hours ?? null,
      description: data.description || null,
    },
  });

  return NextResponse.json(record);
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
  await db.financialRecord.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
