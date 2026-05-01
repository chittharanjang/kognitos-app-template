/**
 * Tiny Server-Sent-Events helpers shared by the test-batch routes
 * (server) and the run-history pages (client).
 *
 * Format used: `event: <name>\ndata: <json>\n\n`. JSON is single-line
 * to keep parsing trivial.
 */

/* ------------------------------------------------------------------ */
/*  Server-side                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build a single SSE frame as a UTF-8 byte array, suitable for
 * pushing into a `ReadableStream` controller.
 */
export function sseFrame(event: string, data: unknown): Uint8Array {
  const json = JSON.stringify(data);
  const text = `event: ${event}\ndata: ${json}\n\n`;
  return new TextEncoder().encode(text);
}

/* ------------------------------------------------------------------ */
/*  Client-side                                                        */
/* ------------------------------------------------------------------ */

export interface SseMessage<T = unknown> {
  event: string;
  data: T;
}

/**
 * Consume an SSE response body and yield parsed messages one-by-one.
 *
 * - Tolerant to chunk boundaries inside the same frame.
 * - Skips heartbeat lines (`:keepalive\n\n`) and unrecognized fields.
 * - Stops when the server closes the stream.
 */
export async function* readSseStream<T = unknown>(
  res: Response,
): AsyncGenerator<SseMessage<T>> {
  if (!res.body) {
    throw new Error("readSseStream: response has no body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line (\n\n). Process every
    // complete frame currently in the buffer; keep the trailing
    // partial frame for the next chunk.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);

      let event = "message";
      let dataLine = "";
      for (const rawLine of frame.split("\n")) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        if (colon === -1) continue;
        const field = line.slice(0, colon);
        const value = line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event = value;
        else if (field === "data") dataLine = value;
      }

      if (!dataLine) continue;
      try {
        const parsed = JSON.parse(dataLine) as T;
        yield { event, data: parsed };
      } catch {
        // Skip frames whose data line isn't valid JSON.
      }
    }
  }
}
