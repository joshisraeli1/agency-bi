import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { chatTools } from "./tools";
import { executeTool } from "./tool-executor";
import { getSystemPrompt } from "./system-prompt";

const anthropic = new Anthropic();

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamChatResponse(
  messages: ChatMessage[],
  sessionId: string
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = await getSystemPrompt();

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        let anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        let continueLoop = true;
        const allChartData: unknown[] = [];
        const allToolCalls: { name: string; input: unknown }[] = [];

        while (continueLoop) {
          continueLoop = false;

          const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-5-20250929",
            max_tokens: 4096,
            system: systemPrompt,
            messages: anthropicMessages,
            tools: chatTools,
          });

          let currentText = "";
          const toolUseBlocks: Anthropic.ContentBlock[] = [];

          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              currentText += event.delta.text;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text", content: event.delta.text })}\n\n`
                )
              );
            }
          }

          const finalMessage = await stream.finalMessage();

          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              toolUseBlocks.push(block);
            }
          }

          if (toolUseBlocks.length > 0) {
            // Execute tools and continue conversation
            const toolResults: Anthropic.MessageParam = {
              role: "user",
              content: [],
            };

            for (const block of toolUseBlocks) {
              if (block.type !== "tool_use") continue;

              allToolCalls.push({ name: block.name, input: block.input });

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "tool_call", name: block.name })}\n\n`
                )
              );

              try {
                const result = await executeTool(
                  block.name,
                  block.input as Record<string, unknown>
                );

                // Check if result is a chart
                if (
                  result &&
                  typeof result === "object" &&
                  (result as Record<string, unknown>)._chart
                ) {
                  allChartData.push(result);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "chart", data: result })}\n\n`
                    )
                  );
                }

                (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : "Tool execution failed";
                (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: `Error: ${msg}`,
                  is_error: true,
                });
              }
            }

            anthropicMessages = [
              ...anthropicMessages,
              { role: "assistant", content: finalMessage.content },
              toolResults,
            ];
            continueLoop = true;
          } else {
            // No more tool calls — save final message
            await db.chatMessage.create({
              data: {
                sessionId,
                role: "assistant",
                content: currentText,
                chartData:
                  allChartData.length > 0
                    ? JSON.stringify(allChartData)
                    : null,
                toolCalls:
                  allToolCalls.length > 0
                    ? JSON.stringify(allToolCalls)
                    : null,
              },
            });
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: msg })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}
