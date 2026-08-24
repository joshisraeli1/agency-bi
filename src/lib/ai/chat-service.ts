import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { chatTools } from "./tools";
import { executeTool } from "./tool-executor";
import { getSystemPrompt } from "./system-prompt";

const anthropic = new Anthropic();

const CHAT_MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;
const MAX_TOOL_ROUNDS = 12;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Raw API errors carry billing state, request ids and key details — never put
// them in the chat. Log the real error, tell the user what can be done.
function userFacingError(err: unknown): string {
  if (
    err instanceof Anthropic.AuthenticationError ||
    err instanceof Anthropic.PermissionDeniedError
  ) {
    return "The AI service rejected our credentials. An administrator needs to check the Anthropic API key.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "The AI service is at capacity right now. Please try again in a moment.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return "The AI service could not accept this request — usually an API configuration or billing problem. An administrator will find the details in the server logs.";
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return "The AI service took too long to respond. Please try again.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Could not reach the AI service. Please check the connection and try again.";
  }
  if (err instanceof Anthropic.APIError) {
    return "The AI service is temporarily unavailable. Please try again shortly.";
  }
  return "Something went wrong while answering that. Please try again.";
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
        let rounds = 0;
        // Text streamed across every round, not just the last one — the reply
        // Claude writes before a tool call is part of the answer too.
        let fullText = "";
        const allChartData: unknown[] = [];
        const allToolCalls: { name: string; input: unknown }[] = [];

        const append = (text: string) => {
          if (!text) return;
          fullText += fullText ? `\n\n${text}` : text;
        };

        const say = (text: string) => {
          append(text);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "text", content: `\n\n${text}` })}\n\n`
            )
          );
        };

        while (continueLoop) {
          continueLoop = false;
          rounds += 1;

          const stream = anthropic.messages.stream({
            model: CHAT_MODEL,
            max_tokens: MAX_TOKENS,
            thinking: { type: "adaptive" },
            system: systemPrompt,
            messages: anthropicMessages,
            tools: chatTools,
          });

          let currentText = "";
          const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

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
          append(currentText);

          if (finalMessage.stop_reason === "refusal") {
            console.error("[chat] request refused", sessionId);
            say("I can't answer that one. Try rephrasing the question.");
            break;
          }

          for (const block of finalMessage.content) {
            if (block.type === "tool_use") {
              toolUseBlocks.push(block);
            }
          }

          if (toolUseBlocks.length > 0) {
            if (rounds >= MAX_TOOL_ROUNDS) {
              console.error(
                `[chat] hit the ${MAX_TOOL_ROUNDS}-round tool limit`,
                sessionId
              );
              say(
                "This question needed more steps than I'm allowed to take in one go. Try asking it in smaller parts."
              );
              break;
            }

            // Execute tools and continue conversation
            const toolResults: Anthropic.MessageParam = {
              role: "user",
              content: [],
            };

            for (const block of toolUseBlocks) {
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
                console.error(`[chat] tool ${block.name} failed`, err);
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
          }
        }

        if (fullText || allChartData.length > 0) {
          await db.chatMessage.create({
            data: {
              sessionId,
              role: "assistant",
              content: fullText,
              chartData:
                allChartData.length > 0 ? JSON.stringify(allChartData) : null,
              toolCalls:
                allToolCalls.length > 0 ? JSON.stringify(allToolCalls) : null,
            },
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        console.error("[chat] stream failed", sessionId, err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: userFacingError(err) })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}
