import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, logAudit } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sessions = await db.chatSession.findMany({
    where: { userId: auth.session.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json(sessions);
}

export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const chatSession = await db.chatSession.create({
    data: {
      userId: auth.session.userId,
      title: "New Chat",
    },
  });

  await logAudit({ action: "chat_session_created", userId: auth.session.userId, entity: "chat_session", entityId: chatSession.id, details: "Created new chat session" });

  return NextResponse.json(chatSession);
}
