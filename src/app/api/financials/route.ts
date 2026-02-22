import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createFinancialSchema } from "@/lib/validations/financial";
import { requireAuth, requireRole, logAudit } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const records = await db.financialRecord.findMany({
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    include: {
      client: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(records);
}

export async function POST(request: Request) {
  const auth = await requireRole("manager");
  if (auth.error) return auth.error;
  const session = auth.session;

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

  await logAudit({ action: "financial_record_created", userId: session.userId, entity: "financial_record", entityId: record.id, details: `Created financial record: ${data.type} $${data.amount}` });

  return NextResponse.json(record, { status: 201 });
}
