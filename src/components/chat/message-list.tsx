"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { Loader2 } from "lucide-react";

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

interface Props {
  messages: Message[];
  isLoading: boolean;
  currentToolCall?: string | null;
}

export function MessageList({ messages, isLoading, currentToolCall }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  return (
    <div className="flex-1 overflow-y-auto px-4">
      {messages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">Ask me anything about your agency data</p>
            <div className="text-sm space-y-1">
              <p>&quot;What are our most profitable clients?&quot;</p>
              <p>&quot;Show me team utilization this quarter&quot;</p>
              <p>&quot;Which clients have margins below 20%?&quot;</p>
            </div>
          </div>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          role={msg.role}
          content={msg.content}
          charts={msg.charts}
        />
      ))}
      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {currentToolCall
            ? `Calling ${currentToolCall}...`
            : "Thinking..."}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
