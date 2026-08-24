import Anthropic from "@anthropic-ai/sdk";

export const MAX_STREAM_ATTEMPTS = 3;

const BACKOFF_MS = [500, 1000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A 529 "Overloaded" arrives as an error event inside the stream body, so it
 * has no HTTP status for the SDK's own retry logic to act on — read the type
 * off the parsed error body instead.
 */
export function isOverloaded(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  const body = err.error as { error?: { type?: string } } | undefined;
  return body?.error?.type === "overloaded_error";
}

export function isTransientApiError(err: unknown): boolean {
  return (
    isOverloaded(err) ||
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError
  );
}

/**
 * Stream one model turn, retrying transient API failures with backoff.
 *
 * Retries stop the moment any text has reached the caller — replaying a turn
 * that already streamed would duplicate it in the user's chat.
 */
export async function streamWithRetry(
  client: Anthropic,
  params: Anthropic.MessageStreamParams,
  onText: (text: string) => void
): Promise<Anthropic.Message> {
  for (let attempt = 1; ; attempt++) {
    let streamedText = false;

    try {
      const stream = client.messages.stream(params);

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          streamedText = true;
          onText(event.delta.text);
        }
      }

      return await stream.finalMessage();
    } catch (err) {
      const canRetry =
        !streamedText &&
        attempt < MAX_STREAM_ATTEMPTS &&
        isTransientApiError(err);

      if (!canRetry) throw err;

      console.error(
        `[chat] transient API failure on attempt ${attempt}/${MAX_STREAM_ATTEMPTS}`,
        err instanceof Error ? err.message : err
      );
      await sleep(BACKOFF_MS[attempt - 1] ?? 2000);
    }
  }
}
