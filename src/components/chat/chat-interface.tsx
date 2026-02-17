"use client";

import { useState, useEffect, useCallback } from "react";
import { SessionSidebar } from "./session-sidebar";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { parseSSEStream, type StreamEvent } from "@/lib/ai/chat-stream-parser";

interface ChartData {
  _chart: boolean;
  chartType: "line" | "bar" | "pie" | "area";
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  yLabels?: string[];
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  charts?: ChartData[];
}

interface Session {
  id: string;
  title: string;
  createdAt: string;
  _count?: { messages: number };
}

export function ChatInterface() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  async function loadSessions() {
    const res = await fetch("/api/chat/sessions");
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
    }
  }

  async function loadMessages(sessionId: string) {
    const res = await fetch(`/api/chat/sessions/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(
        data.map((m: { id: string; role: string; content: string; chartData?: string }) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          charts: m.chartData ? JSON.parse(m.chartData) : undefined,
        }))
      );
    }
  }

  async function handleCreateSession() {
    const res = await fetch("/api/chat/sessions", { method: "POST" });
    if (res.ok) {
      const session = await res.json();
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
    }
  }

  async function handleDeleteSession(id: string) {
    await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }

  function handleSelectSession(id: string) {
    setActiveSessionId(id);
    loadMessages(id);
  }

  const handleSend = useCallback(
    async (message: string) => {
      if (!activeSessionId || isLoading) return;

      const userMsg: Message = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setCurrentToolCall(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, sessionId: activeSessionId }),
        });

        if (!res.ok) {
          throw new Error("Failed to get response");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        let assistantContent = "";
        const charts: ChartData[] = [];
        const assistantId = `assistant-${Date.now()}`;

        // Add empty assistant message
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        await parseSSEStream(reader, (event: StreamEvent) => {
          switch (event.type) {
            case "text":
              assistantContent += event.content || "";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: assistantContent }
                    : m
                )
              );
              break;
            case "chart":
              if (event.data) {
                charts.push(event.data as ChartData);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, charts: [...charts] } : m
                  )
                );
              }
              break;
            case "tool_call":
              setCurrentToolCall(event.name || null);
              break;
            case "done":
              setCurrentToolCall(null);
              break;
            case "error":
              assistantContent += `\n\nError: ${event.content}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: assistantContent }
                    : m
                )
              );
              break;
          }
        });

        // Update session title
        loadSessions();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to send";
        setMessages((prev) => [
          ...prev,
          { id: `error-${Date.now()}`, role: "assistant", content: `Error: ${msg}` },
        ]);
      } finally {
        setIsLoading(false);
        setCurrentToolCall(null);
      }
    },
    [activeSessionId, isLoading]
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={handleSelectSession}
        onCreate={handleCreateSession}
        onDelete={handleDeleteSession}
      />
      <div className="flex-1 flex flex-col">
        {activeSessionId ? (
          <>
            <MessageList
              messages={messages}
              isLoading={isLoading}
              currentToolCall={currentToolCall}
            />
            <ChatInput onSend={handleSend} disabled={isLoading} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center space-y-4">
              <p className="text-lg font-medium">Select or create a chat session</p>
              <button
                onClick={handleCreateSession}
                className="text-primary hover:underline"
              >
                Start a new conversation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
