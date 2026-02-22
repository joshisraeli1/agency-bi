import { NextRequest, NextResponse } from "next/server";
import { requireAuth, logAudit } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  // Verify the chat session belongs to the current user
  const chatSession = await db.chatSession.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!chatSession || chatSession.userId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await db.chatMessage.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      chartData: true,
      toolCalls: true,
      createdAt: true,
    },
  });

  return NextResponse.json(messages);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;

  // Verify the chat session belongs to the current user
  const chatSession = await db.chatSession.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!chatSession || chatSession.userId !== auth.session.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.chatSession.delete({
    where: { id },
  });

  await logAudit({
    action: "chat_session.delete",
    userId: auth.session.userId,
    entity: "chatSession",
    entityId: id,
  });

  return NextResponse.json({ success: true });
}
