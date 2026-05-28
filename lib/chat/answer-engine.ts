import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import { SQL_TOOLS, executeSqlTool } from "@/lib/chat/sql-tools";

/**
 * Shared "answer engine" for the SQL Query Assistant.
 *
 * Runs the same Claude + SQL tool loop that powers the web chat
 * (`app/api/chat/route.ts`), but exposes it as a plain
 * `AsyncIterable<string>` of text chunks. This lets non-HTTP-SSE surfaces —
 * such as the Microsoft Teams bot (`lib/bot.ts`) — reuse the exact same
 * reasoning, schema, and tools by piping the stream straight into
 * `thread.post()`.
 *
 * The web SSE route is intentionally left untouched; this module is a
 * standalone consumer of the same building blocks.
 */

const CHAT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOOL_ITERATIONS = 5;
const MAX_TOKENS = 2048;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Stream an answer for a conversation. `history` is the prior turns (oldest
 * first); the latest user message must already be included as the final turn.
 * Yields text chunks as Claude produces them, transparently running any SQL
 * tools Claude invokes and feeding the results back until it finishes.
 */
export async function* streamAnswer(
  history: ChatTurn[]
): AsyncGenerator<string, void, unknown> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    yield "The assistant is not configured (missing ANTHROPIC_API_KEY).";
    return;
  }

  const system = await buildSystemPrompt();

  // Working message list Claude sees — grows as we append tool turns.
  const messages: Anthropic.MessageParam[] = history.map((t) => ({
    role: t.role,
    content: t.content,
  }));

  let producedText = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    // Separate this step's text from the previous step's so pre- and
    // post-tool prose don't run together.
    if (iteration > 0 && producedText) {
      yield "\n\n";
    }

    const stream = anthropic.messages.stream({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: SQL_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta" &&
        event.delta.text
      ) {
        producedText = true;
        yield event.delta.text;
      }
    }

    const finalMessage = await stream.finalMessage();

    const toolUses = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // No tool calls → Claude's text answer is complete.
    if (toolUses.length === 0) {
      return;
    }

    messages.push({ role: "assistant", content: finalMessage.content });

    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const input = (tu.input ?? {}) as Record<string, unknown>;
      let result: string;
      try {
        result = await executeSqlTool(tu.name, input);
      } catch (e) {
        result = `Tool error: ${e instanceof Error ? e.message : "unknown error"}`;
      }
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResultBlocks });
  }

  // Hit the iteration cap without a final text-only answer.
  if (!producedText) {
    yield "I wasn't able to complete that request — please try rephrasing it.";
  }
}

/**
 * Convenience helper: collect the full answer as a single string. Useful for
 * surfaces that don't stream (or for logging/persistence after streaming).
 */
export async function generateAnswer(history: ChatTurn[]): Promise<string> {
  let full = "";
  for await (const chunk of streamAnswer(history)) {
    full += chunk;
  }
  return full.trim();
}
