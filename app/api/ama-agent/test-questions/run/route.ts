import { NextResponse } from "next/server";
import { invokeAutomation } from "@/lib/kognitos";
import { getAmaAgentAutomationId } from "@/lib/ama-agent";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_CONCURRENCY = 25;
const MAX_CONCURRENCY = 50;
const REQUESTER_EMAIL = "ama-runs-test@kognitos-demo.local";

// The Test button always exercises the production stage so results match
// what real users would see, regardless of any in-progress draft work on the
// DB Agent automation. The chat (/ama-agent) keeps using its own stage.
const TEST_BUTTON_STAGE = "AUTOMATION_STAGE_PUBLISHED" as const;

interface RunStarted {
  question: string;
  runId: string;
}

interface RunFailed {
  question: string;
  error: string;
}

async function startOne(
  automationId: string,
  question: string,
): Promise<{ runId?: string; error?: string }> {
  const inputs = {
    "User Query": { text: question },
    "Requester Email": { text: REQUESTER_EMAIL },
  };
  const { runId, error } = await invokeAutomation(
    automationId,
    inputs,
    TEST_BUTTON_STAGE,
  );
  if (!runId) return { error: error ?? "Failed to start run" };
  return { runId };
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  let body: { concurrency?: number; questionIds?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const concurrency = Math.max(
    1,
    Math.min(MAX_CONCURRENCY, Math.floor(body.concurrency ?? DEFAULT_CONCURRENCY)),
  );

  const select = supabaseAdmin
    .from(TABLES.dbAgentTestQuestions)
    .select("id, question");
  const filtered =
    body.questionIds && body.questionIds.length > 0
      ? select.in("id", body.questionIds)
      : select;

  const { data: rows, error: fetchError } = await filtered;

  if (fetchError) {
    const code = (fetchError as { code?: string }).code;
    const isMissingTable = code === "42P01" || code === "PGRST205";
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Table db_agent_test_questions does not exist. Apply migration 00000000000005_db_agent_test_questions.sql, then click 'Load questions'."
          : fetchError.message,
        code,
        needsMigration: isMissingTable,
      },
      { status: isMissingTable ? 412 : 500 },
    );
  }

  const questions = (rows ?? [])
    .map((r) => (r as { question: string }).question.trim())
    .filter((q): q is string => q.length > 0);

  if (questions.length === 0) {
    return NextResponse.json({
      total: 0,
      started: 0,
      failed: 0,
      stage: TEST_BUTTON_STAGE,
      runs: [],
      errors: [],
    });
  }

  const automationId = getAmaAgentAutomationId();
  const started: RunStarted[] = [];
  const failed: RunFailed[] = [];

  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= questions.length) return;
      const q = questions[idx];
      const r = await startOne(automationId, q);
      if (r.runId) {
        started.push({ question: q, runId: r.runId });
      } else {
        failed.push({ question: q, error: r.error ?? "unknown error" });
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, questions.length) }, () =>
      worker(),
    ),
  );

  return NextResponse.json({
    total: questions.length,
    started: started.length,
    failed: failed.length,
    stage: TEST_BUTTON_STAGE,
    runs: started,
    errors: failed,
  });
}
