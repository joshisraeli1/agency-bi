export interface StreamEvent {
  type: "text" | "chart" | "tool_call" | "done" | "error";
  content?: string;
  name?: string;
  data?: unknown;
}

export function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  return reader.read().then(function process({ done, value }): Promise<void> {
    if (done) return Promise.resolve();

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // Skip malformed events
        }
      }
    }

    return reader.read().then(process);
  });
}
