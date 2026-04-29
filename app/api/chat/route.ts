import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import {
  suggestQueriesFromGuide,
  buildExcludeSetFromUserQuestions,
  normalizeSuggestionKey,
} from "@/lib/guide-queries";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import { SQL_TOOLS, executeSqlTool } from "@/lib/chat/sql-tools";

export const dynamic = "force-dynamic";
/**
 * Chat answers come from running SELECTs against the Supabase mirrors via
 * Claude tool-calling. Most turns finish in a few seconds, but allow headroom.
 */
export const maxDuration = 120;

const CHAT_MODEL = "claude-sonnet-4-20250514";
const MAX_TOOL_ITERATIONS = 5;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

/* ── follow-up suggestion helpers (unchanged) ─────────────────────────── */

async function generateLlmFollowUps(
  lastUser: string,
  assistantSnippet: string,
  priorQuestions: string[],
  excludeNormalized: Set<string>
): Promise<string[]> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return [];
  try {
    const blocked =
      priorQuestions.length > 0
        ? priorQuestions
            .slice(-25)
            .map((q) => `- ${q.slice(0, 220)}`)
            .join("\n")
        : "(none)";
    const res = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content:
            `You assist users querying client/account data mirrored into Supabase ` +
            `(fido_clients, fido_client_address, wealthx_account_details, azure_profile_status, joined on fiduciary_id).\n` +
            `Suggest exactly 2 short NEW follow-up questions they might ask next.\n` +
            `Do not repeat or paraphrase questions already listed below.\n` +
            `Questions only.\n` +
            `Output ONLY a JSON array of 2 strings, e.g. ["Question one?","Question two?"]\n\n` +
            `Already asked in this conversation:\n${blocked}\n\n` +
            `Latest user message: ${lastUser.slice(0, 2500)}\n\n` +
            `Assistant (excerpt): ${assistantSnippet.slice(0, 2000)}`,
        },
      ],
    });
    const block = res.content[0];
    if (block.type !== "text") return [];
    const match = block.text.trim().match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim())
      .filter((s) => !excludeNormalized.has(normalizeSuggestionKey(s)))
      .slice(0, 2);
  } catch {
    return [];
  }
}

function mergeSuggestionLists(
  guidePart: string[],
  llmPart: string[],
  excludeNormalized: Set<string>,
  maxTotal: number
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...guidePart, ...llmPart]) {
    const k = normalizeSuggestionKey(q);
    if (!k || seen.has(k) || excludeNormalized.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
    if (out.length >= maxTotal) break;
  }
  return out;
}

async function getSessionUserQuestions(sessionId: string): Promise<string[]> {
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from(TABLES.messages)
    .select("content")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .order("created_at", { ascending: true });
  return (data ?? [])
    .map((row) => String((row as { content: unknown }).content ?? "").trim())
    .filter(Boolean);
}

async function generateSessionTitle(
  userMessage: string,
  assistantMessage: string
): Promise<string> {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  if (!k) {
    const t = userMessage.replace(/\n/g, " ").trim();
    return t.length <= 48 ? t : `${t.slice(0, 45)}…`;
  }
  const res = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 30,
    messages: [
      {
        role: "user",
        content: `Summarize this conversation in 4-6 words for a sidebar title. No quotes, no punctuation at the end.\n\nUser: ${userMessage}\nAssistant: ${assistantMessage.slice(0, 300)}`,
      },
    ],
  });
  const block = res.content[0];
  return block.type === "text" ? block.text.trim() : "New Conversation";
}

/* ── conversation history helpers ─────────────────────────────────────── */

/**
 * Load the conversation history from Supabase, normalize it, and merge any
 * accidental consecutive same-role messages so Claude doesn't reject the
 * payload (see 06-chat-support.mdc → "Consecutive-role merge").
 */
async function loadHistory(sessionId: string): Promise<Anthropic.MessageParam[]> {
  if (!supabaseAdmin) return [];
  const { data } = await supabaseAdmin
    .from(TABLES.messages)
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  type ChatRole = "user" | "assistant";
  const filtered: { role: ChatRole; content: string }[] = (data ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as ChatRole,
      content: String(m.content ?? "").trim(),
    }))
    // empty assistant messages are valid placeholders for tool-only turns;
    // we still keep them but skip empty user messages
    .filter((m) => m.role === "assistant" || m.content.length > 0);

  const merged: Anthropic.MessageParam[] = [];
  for (const msg of filtered) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content = `${last.content}\n\n${msg.content}`;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }
  return merged;
}

/* ── main route ───────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId, message } = body as { sessionId: string; message: string };

  if (!message || !sessionId) {
    return NextResponse.json({ error: "Missing sessionId or message" }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  // Persist the user's message immediately so loadHistory below sees it.
  if (supabaseAdmin) {
    await supabaseAdmin
      .from(TABLES.messages)
      .insert({ session_id: sessionId, role: "user", content: message });
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;
      const send = (data: Record<string, unknown>) => {
        if (streamClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          streamClosed = true;
        }
      };

      let fullAssistantResponse = "";

      try {
        const system = await buildSystemPrompt();
        const messages = await loadHistory(sessionId);

        // Tool loop: Claude streams text, may emit tool_use blocks; we run them
        // and feed the results back. Repeat until Claude finishes with text only
        // or we hit the iteration cap.
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          // Add a separator between iterations so pre- and post-tool text
          // don't run together in the saved transcript.
          if (iteration > 0 && fullAssistantResponse.length > 0) {
            fullAssistantResponse += "\n\n";
            send({ type: "text", content: "\n\n" });
          }

          const stream = anthropic.messages.stream({
            model: CHAT_MODEL,
            max_tokens: 2048,
            system,
            tools: SQL_TOOLS,
            messages,
          });

          stream.on("text", (text) => {
            fullAssistantResponse += text;
            send({ type: "text", content: text });
          });

          const finalMessage = await stream.finalMessage();

          // Collect any tool_use blocks the model emitted in this turn.
          const toolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );

          // If the model didn't ask to use any tool, the answer is done.
          if (toolUses.length === 0) {
            break;
          }

          // Append assistant turn to the running message list…
          messages.push({ role: "assistant", content: finalMessage.content });

          // …run each tool, stream a "tool_use"/"tool_result" event for the UI,
          // and queue the tool_result blocks for the next user turn.
          const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

          for (const tu of toolUses) {
            const toolInput = (tu.input ?? {}) as Record<string, unknown>;

            const purposeRaw = toolInput.purpose;
            const purpose =
              typeof purposeRaw === "string" && purposeRaw.trim().length > 0
                ? purposeRaw.trim()
                : tu.name;

            send({
              type: "tool_use",
              tool_name: tu.name,
              tool_input: { ...toolInput, purpose },
            });

            let result: string;
            try {
              result = await executeSqlTool(tu.name, toolInput);
            } catch (e) {
              result = `Tool error: ${e instanceof Error ? e.message : "unknown error"}`;
            }

            // Brief, user-visible status — don't dump full SQL results to the UI.
            send({
              type: "tool_result",
              tool_name: tu.name,
              content: summarizeToolResult(tu.name, result),
            });

            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: result,
            });
          }

          messages.push({ role: "user", content: toolResultBlocks });
        }

        // Persist the assistant response. Always insert (even empty) so we
        // don't end up with two consecutive user rows in Supabase.
        if (supabaseAdmin) {
          await supabaseAdmin
            .from(TABLES.messages)
            .insert({
              session_id: sessionId,
              role: "assistant",
              content: fullAssistantResponse || "",
            });
        }

        // Auto-title on the first exchange.
        if (supabaseAdmin) {
          const { count } = await supabaseAdmin
            .from(TABLES.messages)
            .select("*", { count: "exact", head: true })
            .eq("session_id", sessionId);

          if (count && count <= 3) {
            try {
              const title = await generateSessionTitle(message, fullAssistantResponse);
              await supabaseAdmin
                .from(TABLES.sessions)
                .update({ title, updated_at: new Date().toISOString() })
                .eq("id", sessionId);
              send({ type: "title", content: title });
            } catch {
              /* title generation is best-effort */
            }
          }
        }

        // Follow-up suggestions (guide-based + LLM-based).
        let priorQuestions = await getSessionUserQuestions(sessionId);
        if (priorQuestions.length === 0 && message.trim()) {
          priorQuestions = [message.trim()];
        }
        const excludeNormalized = buildExcludeSetFromUserQuestions(priorQuestions);

        const guidePart = suggestQueriesFromGuide(
          message,
          fullAssistantResponse || "",
          10,
          excludeNormalized
        );
        const llmPart = await generateLlmFollowUps(
          message,
          fullAssistantResponse || "",
          priorQuestions,
          excludeNormalized
        );
        const combined = mergeSuggestionLists(guidePart, llmPart, excludeNormalized, 6);
        if (combined.length > 0) {
          send({ type: "suggestions", items: combined });
        }

        send({ type: "done" });
      } catch (err) {
        console.error("[chat] Stream error:", err);
        try {
          send({
            type: "error",
            content: err instanceof Error ? err.message : "Unknown error",
          });
        } catch {
          /* closed */
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Render a short user-visible status message for a tool result. We don't want
 * to leak the full JSON payload into the UI status bar.
 */
function summarizeToolResult(toolName: string, raw: string): string {
  if (toolName === "describe_schema") {
    return "Schema loaded";
  }
  if (toolName === "run_sql") {
    if (raw.startsWith("SQL error:") || raw.startsWith("Tool error:")) {
      return raw.slice(0, 180);
    }
    try {
      const parsed = JSON.parse(raw) as { row_count?: number; truncated?: boolean };
      const n = parsed.row_count ?? 0;
      const more = parsed.truncated ? " (truncated)" : "";
      return `Query returned ${n} row${n === 1 ? "" : "s"}${more}`;
    } catch {
      return "Query completed";
    }
  }
  return `${toolName} completed`;
}
