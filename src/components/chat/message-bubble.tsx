"use client";

import { cn } from "@/lib/utils";
import { ChatChartRenderer } from "./chat-chart-renderer";
import { User, Bot } from "lucide-react";

interface ChartData {
  _chart: boolean;
  chartType: "line" | "bar" | "pie" | "area";
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKeys?: string[];
  yLabels?: string[];
}

interface Props {
  role: "user" | "assistant";
  content: string;
  charts?: ChartData[];
}

export function MessageBubble({ role, content, charts }: Props) {
  const isUser = role === "user";

  return (
    <div
      className={cn("flex gap-3 py-4", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("flex-1 space-y-3", isUser ? "text-right" : "text-left")}>
        <div
          className={cn(
            "inline-block px-4 py-2 rounded-lg text-sm whitespace-pre-wrap max-w-[85%]",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground"
          )}
        >
          {content}
        </div>
        {charts && charts.length > 0 && (
          <div className="space-y-3 max-w-[85%]">
            {charts.map((chart, i) => (
              <ChatChartRenderer key={i} chart={chart} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
