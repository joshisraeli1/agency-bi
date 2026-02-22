import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, hashPassword, logAudit } from "@/lib/auth";
import { createUserSchema } from "@/lib/validations/user";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const users = await db.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
      totpEnabled: true,
    },
  });
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: { email: ["Email already in use"] } }, { status: 400 });
  }

  const passwordHash = await hashPassword(data.password);
  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  await logAudit({ action: "user_created", userId: session.userId, entity: "user", entityId: user.id, details: `Created user: ${user.name} (${user.email})` });

  return NextResponse.json(user, { status: 201 });
}
