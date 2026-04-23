import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import {
  suggestQueriesFromGuide,
  buildExcludeSetFromUserQuestions,
  normalizeSuggestionKey,
} from "@/lib/guide-queries";
import { runQueryAssistant, chunkTextForStream } from "@/lib/query-assistant";

export const dynamic = "force-dynamic";
/** SQL Query Assistant runs can take several minutes. */
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

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
      model: "claude-sonnet-4-20250514",
      max_tokens: 220,
      messages: [
        {
          role: "user",
          content:
            `You assist users querying client/account databases (FIDO, WealthX, Profile Status linked by FIDUCIARY_ID).\n` +
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

async function generateSessionTitle(userMessage: string, assistantMessage: string): Promise<string> {
  const k = process.env.ANTHROPIC_API_KEY?.trim();
  if (!k) {
    const t = userMessage.replace(/\n/g, " ").trim();
    return t.length <= 48 ? t : `${t.slice(0, 45)}…`;
  }
  const res = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
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

export async function POST(request: Request) {
  const body = await request.json();
  const { sessionId, message } = body as { sessionId: string; message: string };

  if (!message || !sessionId) {
    return NextResponse.json({ error: "Missing sessionId or message" }, { status: 400 });
  }

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

      try {
        let fullAssistantResponse = "";

        send({
          type: "tool_use",
          tool_name: "query_assistant",
          tool_input: { question: message.slice(0, 200) },
        });

        /** Same as Query page: invoke Kognitos automation "SQL Query Generator" with `User Query` = chat text; block until result. */
        const outcome = await runQueryAssistant(message);

        send({
          type: "tool_result",
          tool_name: "query_assistant",
          content: outcome.ok
            ? `Run ${outcome.runId.slice(0, 8)}… completed`
            : (outcome.error || "Failed").slice(0, 180),
        });

        if (!outcome.ok) {
          fullAssistantResponse =
            "**Query Assistant** could not complete this question.\n\n" +
            `**Error:** ${outcome.error}\n\n` +
            (outcome.runId
              ? `_Run ID: \`${outcome.runId}\` (you can inspect this run in Kognitos or use the **Query** page to retry)._\n\n`
              : "") +
            "_Tip: rephrase the question, or run it from **Query** for the full 2-minute timeout UI._";
        } else {
          fullAssistantResponse = outcome.content;
        }

        for (const chunk of chunkTextForStream(fullAssistantResponse, 500)) {
          send({ type: "text", content: chunk });
        }

        if (supabaseAdmin) {
          await supabaseAdmin
            .from(TABLES.messages)
            .insert({ session_id: sessionId, role: "assistant", content: fullAssistantResponse || "" });
        }

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
          send({ type: "error", content: err instanceof Error ? err.message : "Unknown error" });
        } catch { /* closed */ }
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
