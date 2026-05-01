import { invokeAutomation, pollRun } from "@/lib/kognitos";
import { getSqlQueryGeneratorAutomationId } from "@/lib/query-assistant";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import { sseFrame } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Hard concurrency cap. Body input is clamped into [1, 25]; values
 * above 25 are silently lowered. The cap protects Kognitos rate
 * limits and keeps total batch wall time bounded.
 */
const HARD_CONCURRENCY = 25;
const POLL_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 2_000;

// The Test button always exercises the production stage so results match
// what real users would see, regardless of any in-progress draft work on the
// SQL Query Generator. The interactive /query chat keeps using its own stage.
const TEST_BUTTON_STAGE = "AUTOMATION_STAGE_PUBLISHED" as const;

interface RequestBody {
  concurrency?: number;
  questionIds?: string[];
}

export async function POST(request: Request): Promise<Response> {
  if (!supabaseAdmin) {
    return jsonError(500, "Supabase admin client not configured");
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    body = {};
  }

  const concurrency = Math.max(
    1,
    Math.min(
      HARD_CONCURRENCY,
      Math.floor(body.concurrency ?? HARD_CONCURRENCY),
    ),
  );

  const select = supabaseAdmin
    .from(TABLES.queryTestQuestions)
    .select("id, question");
  const filtered =
    body.questionIds && body.questionIds.length > 0
      ? select.in("id", body.questionIds)
      : select;

  const { data: rows, error: fetchError } = await filtered;

  if (fetchError) {
    const code = (fetchError as { code?: string }).code;
    const isMissingTable = code === "42P01" || code === "PGRST205";
    if (isMissingTable) {
      return jsonError(
        412,
        "Table query_test_questions does not exist. Apply migration 00000000000006_query_test_questions.sql, then click 'Load questions'.",
        { code, needsMigration: true },
      );
    }
    return jsonError(500, fetchError.message, { code });
  }

  const questions = (rows ?? [])
    .map((r) => (r as { question: string }).question.trim())
    .filter((q): q is string => q.length > 0);

  const automationId = getSqlQueryGeneratorAutomationId();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown): void => {
        try {
          controller.enqueue(sseFrame(event, data));
        } catch {
          // Stream already closed (client disconnected) — workers
          // continue running but stop publishing.
        }
      };

      const startedAt = Date.now();
      let completed = 0;
      let failed = 0;

      emit("init", {
        total: questions.length,
        concurrency,
        stage: TEST_BUTTON_STAGE,
        hardConcurrency: HARD_CONCURRENCY,
      });

      if (questions.length === 0) {
        emit("done", {
          total: 0,
          completed: 0,
          failed: 0,
          durationMs: Date.now() - startedAt,
        });
        controller.close();
        return;
      }

      let next = 0;
      async function worker(): Promise<void> {
        while (true) {
          const idx = next++;
          if (idx >= questions.length) return;
          const question = questions[idx];
          const t0 = Date.now();

          // SQL Query Generator only takes a single `User Query` input —
          // no requester email field, unlike the DB Agent automation.
          const inv = await invokeAutomation(
            automationId,
            { "User Query": { text: question } },
            TEST_BUTTON_STAGE,
          );
          if (!inv.runId) {
            failed++;
            emit("result", {
              question,
              status: "invoke_failed",
              error: inv.error ?? "Failed to start run",
              durationMs: Date.now() - t0,
            });
            continue;
          }

          emit("started", { question, runId: inv.runId });

          let r;
          try {
            r = await pollRun(
              automationId,
              inv.runId,
              POLL_TIMEOUT_MS,
              POLL_INTERVAL_MS,
            );
          } catch (e) {
            failed++;
            emit("result", {
              question,
              runId: inv.runId,
              status: "poll_error",
              error: e instanceof Error ? e.message : String(e),
              durationMs: Date.now() - t0,
            });
            continue;
          }

          if (r.status === "completed") completed++;
          else failed++;

          emit("result", {
            question,
            runId: inv.runId,
            status: r.status,
            responseText: String(r.outputs.response_text ?? ""),
            recordCount: Number(r.outputs.record_count ?? 0),
            queryType: String(r.outputs.query_type ?? ""),
            error: r.error,
            durationMs: Date.now() - t0,
          });
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(concurrency, questions.length) }, () =>
          worker(),
        ),
      );

      emit("done", {
        total: questions.length,
        completed,
        failed,
        durationMs: Date.now() - startedAt,
      });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ error: message, ...extra }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
