import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import {
  answerPreviewOf,
  normalizeQuestion,
  questionIdOf,
} from "@/lib/run-groups";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Tables/columns for db_agent_run_verdicts are not up to date. Apply supabase/migrations/00000000000008_db_agent_run_verdicts.sql and 00000000000009_run_verdict_notes.sql in the Supabase Dashboard SQL Editor.";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "42703" || code === "PGRST205";
}

interface BootstrapInput {
  runId: string;
  question?: string | null;
  answer?: string | null;
  createdAt?: string | null;
  status?: string | null;
  recordCount?: number | null;
  databasesQueried?: string | null;
  stage?: string | null;
  stageVersion?: string | null;
}

interface ExistingRow {
  run_id: string;
}

/**
 * POST /api/ama-agent/runs/verdicts/bootstrap
 *
 * DB Agent twin of POST /api/query/runs/verdicts/bootstrap. Ensures every
 * run in the request has a row in db_agent_run_verdicts (default
 * verdict='correct'). Existing rows are left untouched.
 */
export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const payload = body as { runs?: unknown };
  if (!Array.isArray(payload.runs)) {
    return NextResponse.json(
      { error: "runs must be an array of { runId, question?, answer? }" },
      { status: 400 },
    );
  }

  const inputs: BootstrapInput[] = [];
  for (const item of payload.runs) {
    if (!item || typeof item !== "object") continue;
    const obj = item as {
      runId?: unknown;
      question?: unknown;
      answer?: unknown;
      createdAt?: unknown;
      status?: unknown;
      recordCount?: unknown;
      databasesQueried?: unknown;
      stage?: unknown;
      stageVersion?: unknown;
    };
    if (typeof obj.runId !== "string") continue;
    const runId = obj.runId.trim();
    if (runId.length === 0) continue;
    inputs.push({
      runId,
      question: typeof obj.question === "string" ? obj.question : null,
      answer: typeof obj.answer === "string" ? obj.answer : null,
      createdAt: typeof obj.createdAt === "string" ? obj.createdAt : null,
      status: typeof obj.status === "string" ? obj.status : null,
      recordCount:
        typeof obj.recordCount === "number" && Number.isFinite(obj.recordCount)
          ? obj.recordCount
          : null,
      databasesQueried:
        typeof obj.databasesQueried === "string" ? obj.databasesQueried : null,
      stage: typeof obj.stage === "string" ? obj.stage : null,
      stageVersion:
        typeof obj.stageVersion === "string" ? obj.stageVersion : null,
    });
  }

  if (inputs.length === 0) {
    return NextResponse.json({ inserted: 0, alreadyPresent: 0 });
  }

  const runIds = Array.from(new Set(inputs.map((i) => i.runId)));

  const { data: existingData, error: existingError } = await supabaseAdmin
    .from(TABLES.dbAgentRunVerdicts)
    .select("run_id")
    .in("run_id", runIds);

  if (existingError) {
    const code = (existingError as { code?: string }).code;
    const missing = isMissingTable(code);
    return NextResponse.json(
      {
        error: missing ? MIGRATION_HINT : existingError.message,
        code,
        needsMigration: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  const existing = new Set(
    ((existingData ?? []) as ExistingRow[]).map((r) => r.run_id),
  );

  const toInsert = inputs
    .filter((i) => !existing.has(i.runId))
    .filter(
      (i, idx, arr) => arr.findIndex((x) => x.runId === i.runId) === idx,
    )
    .map((i) => ({
      run_id: i.runId,
      question: i.question ?? null,
      answer: i.answer ?? null,
      verdict: "correct" as const,
      notes: null,
    }));

  if (toInsert.length === 0) {
    return NextResponse.json({
      inserted: 0,
      alreadyPresent: existing.size,
    });
  }

  const { error: insertError } = await supabaseAdmin
    .from(TABLES.dbAgentRunVerdicts)
    .insert(toInsert);

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    const missing = isMissingTable(code);
    if (code === "23505") {
      return NextResponse.json({
        inserted: 0,
        alreadyPresent: existing.size + toInsert.length,
        note: "all rows already existed (unique-violation race)",
      });
    }
    return NextResponse.json(
      {
        error: missing ? MIGRATION_HINT : insertError.message,
        code,
        needsMigration: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  await upsertRunIndex(inputs);

  return NextResponse.json({
    inserted: toInsert.length,
    alreadyPresent: existing.size,
  });
}

/**
 * Best-effort upsert into db_agent_run_index. Failures are swallowed (logged
 * to the server console) so that verdict bootstrap — the primary purpose of
 * this endpoint — never fails on missing index migration / transient errors.
 */
async function upsertRunIndex(inputs: BootstrapInput[]): Promise<void> {
  if (!supabaseAdmin) return;

  const rows = inputs
    .filter((i) => i.question && normalizeQuestion(i.question).length > 0)
    .map((i) => ({
      run_id: i.runId,
      question: i.question as string,
      question_norm: normalizeQuestion(i.question),
      question_id: questionIdOf(i.question),
      created_at: i.createdAt ?? new Date().toISOString(),
      status: i.status ?? "unknown",
      record_count: i.recordCount,
      databases_queried: i.databasesQueried,
      answer_preview: answerPreviewOf(i.answer),
      stage: i.stage,
      stage_version: i.stageVersion,
    }));

  if (rows.length === 0) return;

  // Try with stage_version first; fall back to a slimmer payload if migration
  // 00000000000011 hasn't been applied yet, so existing deployments keep
  // working until the operator runs the new SQL.
  const { error } = await supabaseAdmin
    .from(TABLES.dbAgentRunIndex)
    .upsert(rows, { onConflict: "run_id" });

  if (error) {
    const code = (error as { code?: string }).code;
    if (isMissingTable(code)) return;
    if (code === "PGRST204" || /stage_version/.test(error.message ?? "")) {
      const slim = rows.map(({ stage_version: _sv, ...rest }) => {
        void _sv;
        return rest;
      });
      const { error: retryError } = await supabaseAdmin
        .from(TABLES.dbAgentRunIndex)
        .upsert(slim, { onConflict: "run_id" });
      if (retryError && !isMissingTable((retryError as { code?: string }).code)) {
        console.warn(
          "[run-index] upsert failed (slim retry):",
          retryError.message,
        );
      }
      return;
    }
    console.warn("[run-index] upsert failed:", error.message);
  }
}
