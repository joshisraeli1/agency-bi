import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { streamChatResponse } from "@/lib/ai/chat-service";
import { getSession } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authSession = await getSession();
  if (!authSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { message, sessionId } = body;

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: "message and sessionId are required" },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = await db.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Save user message
    await db.chatMessage.create({
      data: {
        sessionId,
        role: "user",
        content: message,
      },
    });

    // Update session title from first message
    const messageCount = await db.chatMessage.count({
      where: { sessionId },
    });
    if (messageCount === 1) {
      await db.chatSession.update({
        where: { id: sessionId },
        data: {
          title: message.slice(0, 100),
        },
      });
    }

    // Get conversation history
    const history = await db.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    const messages = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = await streamChatResponse(messages, sessionId);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
