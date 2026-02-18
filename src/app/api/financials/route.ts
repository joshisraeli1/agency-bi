import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createFinancialSchema } from "@/lib/validations/financial";

export async function GET() {
  const records = await db.financialRecord.findMany({
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(records);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createFinancialSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;
  const record = await db.financialRecord.create({
    data: {
      clientId: data.clientId,
      month: data.month,
      type: data.type,
      category: data.category || null,
      amount: data.amount,
      hours: data.hours ?? null,
      description: data.description || null,
      source: "manual",
    },
  });

  return NextResponse.json(record, { status: 201 });
}
