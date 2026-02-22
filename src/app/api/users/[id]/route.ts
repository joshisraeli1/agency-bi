import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, hashPassword, logAudit } from "@/lib/auth";
import { updateUserSchema } from "@/lib/validations/user";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const data = parsed.data;

  const existing = await db.user.findFirst({
    where: { email: data.email, id: { not: id } },
  });
  if (existing) {
    return NextResponse.json({ error: { email: ["Email already in use"] } }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    name: data.name,
    email: data.email,
    role: data.role,
  };

  if (data.password && data.password.length > 0) {
    updateData.passwordHash = await hashPassword(data.password);
  }

  const user = await db.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  await logAudit({ action: "user_updated", userId: session.userId, entity: "user", entityId: user.id, details: `Updated user: ${user.name} (${user.email})` });

  return NextResponse.json(user);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  const { id } = await params;

  // Prevent deleting yourself
  if (session.userId === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  // Prevent deleting the last admin
  const adminCount = await db.user.count({ where: { role: "admin" } });
  const targetUser = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (targetUser?.role === "admin" && adminCount <= 1) {
    return NextResponse.json({ error: "Cannot delete the last admin user" }, { status: 400 });
  }

  await db.user.delete({ where: { id } });

  await logAudit({ action: "user_deleted", userId: session.userId, entity: "user", entityId: id, details: `Deleted user: ${id}` });

  return NextResponse.json({ success: true });
}
