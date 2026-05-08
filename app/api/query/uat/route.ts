import { invokeAutomation, pollRun } from "@/lib/kognitos";
import { getSqlQueryGeneratorAutomationId } from "@/lib/query-assistant";
import { UAT_QUESTIONS } from "@/lib/uat-questions";
import { sseFrame } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * UAT questions are labelled `source: "uat"` and are exclusively read from
 * `lib/uat-questions.ts`. They are NEVER mixed with the general test-question
 * library that powers the "Test" button on the flat run-history page.
 *
 * Body (all optional):
 *   categories   number[]   — run only these category numbers (default: all)
 *   concurrency  number     — parallel workers, clamped to [1, 10] (default 5)
 *
 * Streams SSE events:
 *   init    { total, concurrency, stage, categories }
 *   started { question, runId, category, categoryName }
 *   result  { question, runId?, status, responseText?, resultRowCount?,
 *             error?, durationMs, category, categoryName }
 *   done    { total, completed, failed, durationMs }
 */

const HARD_CONCURRENCY = 10;
const DEFAULT_CONCURRENCY = 5;
const POLL_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 2_000;

// UAT always runs against PUBLISHED so results reflect what real users see.
const UAT_STAGE = "AUTOMATION_STAGE_PUBLISHED" as const;

interface RequestBody {
  concurrency?: number;
  /** Run only questions whose category matches one of these numbers. */
  categories?: number[];
}

export async function POST(request: Request): Promise<Response> {
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
      Math.floor(body.concurrency ?? DEFAULT_CONCURRENCY),
    ),
  );

  const categoryFilter =
    Array.isArray(body.categories) && body.categories.length > 0
      ? new Set(body.categories.map(Number))
      : null;

  const questions =
    categoryFilter !== null
      ? UAT_QUESTIONS.filter((q) => categoryFilter.has(q.category))
      : UAT_QUESTIONS;

  const automationId = getSqlQueryGeneratorAutomationId();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, data: unknown): void => {
        try {
          controller.enqueue(sseFrame(event, data));
        } catch {
          // Client disconnected — workers keep running but stop publishing.
        }
      };

      const startedAt = Date.now();
      let completed = 0;
      let failed = 0;

      emit("init", {
        total: questions.length,
        concurrency,
        stage: UAT_STAGE,
        categories: categoryFilter ? Array.from(categoryFilter).sort() : null,
      });

      if (questions.length === 0) {
        emit("done", {
          total: 0,
          completed: 0,
          failed: 0,
          durationMs: 0,
        });
        controller.close();
        return;
      }

      let next = 0;

      async function worker(): Promise<void> {
        while (true) {
          const idx = next++;
          if (idx >= questions.length) return;

          const q = questions[idx];
          const t0 = Date.now();

          const inv = await invokeAutomation(
            automationId,
            { user_query: { text: q.question } },
            UAT_STAGE,
          );

          if (!inv.runId) {
            failed++;
            emit("result", {
              question: q.question,
              category: q.category,
              categoryName: q.categoryName,
              status: "invoke_failed",
              error: inv.error ?? "Failed to start run",
              durationMs: Date.now() - t0,
            });
            continue;
          }

          emit("started", {
            question: q.question,
            runId: inv.runId,
            category: q.category,
            categoryName: q.categoryName,
          });

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
              question: q.question,
              runId: inv.runId,
              category: q.category,
              categoryName: q.categoryName,
              status: "poll_error",
              error: e instanceof Error ? e.message : String(e),
              durationMs: Date.now() - t0,
            });
            continue;
          }

          if (r.status === "completed") completed++;
          else failed++;

          emit("result", {
            question: q.question,
            runId: inv.runId,
            category: q.category,
            categoryName: q.categoryName,
            status: r.status,
            responseText: String(r.outputs?.response_text ?? ""),
            resultRowCount:
              typeof r.outputs?.result_row_count === "number"
                ? r.outputs.result_row_count
                : null,
            error: r.error ?? null,
            durationMs: Date.now() - t0,
          });
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, questions.length) },
          () => worker(),
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
