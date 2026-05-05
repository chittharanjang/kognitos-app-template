import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Table db_agent_run_index does not exist yet. Apply supabase/migrations/00000000000010_db_agent_run_index.sql in the Supabase Dashboard SQL Editor, then click 'Build index' on the Run History Groups page.";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

interface IndexRow {
  run_id: string;
  question: string;
  question_id: string;
  created_at: string;
  status: string;
  record_count: number | null;
  databases_queried: string | null;
  answer_preview: string | null;
  stage: string | null;
  stage_version: string | null;
}

interface VerdictRow {
  run_id: string;
  verdict: "correct" | "incorrect" | null;
  notes: string | null;
}

export interface RunGroupDetailRun {
  runId: string;
  createdAt: string;
  status: string;
  recordCount: number | null;
  databasesQueried: string | null;
  answerPreview: string | null;
  stage: string | null;
  /** Automation version snapshot for this run (e.g. "5.8"). */
  stageVersion: string | null;
  verdict: "correct" | "incorrect" | null;
  notes: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  const { questionId } = await params;
  if (!questionId) {
    return NextResponse.json(
      { error: "questionId is required" },
      { status: 400 },
    );
  }

  let { data: rawRows, error } = await supabaseAdmin
    .from(TABLES.dbAgentRunIndex)
    .select(
      "run_id, question, question_id, created_at, status, record_count, databases_queried, answer_preview, stage, stage_version",
    )
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1000);

  // Tolerate environments where migration 11 hasn't been applied yet.
  if (
    error &&
    ((error as { code?: string }).code === "42703" ||
      /stage_version/.test(error.message ?? ""))
  ) {
    const { data: retryRows, error: retryError } = await supabaseAdmin
      .from(TABLES.dbAgentRunIndex)
      .select(
        "run_id, question, question_id, created_at, status, record_count, databases_queried, answer_preview, stage",
      )
      .eq("question_id", questionId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (retryError) {
      error = retryError;
    } else {
      rawRows = (retryRows ?? []).map((r) => ({
        ...(r as Omit<IndexRow, "stage_version">),
        stage_version: null,
      }));
      error = null;
    }
  }

  if (error) {
    const code = (error as { code?: string }).code;
    const missing = isMissingTable(code);
    return NextResponse.json(
      {
        error: missing ? MIGRATION_HINT : error.message,
        code,
        runs: [],
        question: null,
        needsMigration: missing,
      },
      { status: missing ? 200 : 500 },
    );
  }

  const rows = (rawRows ?? []) as IndexRow[];
  if (rows.length === 0) {
    return NextResponse.json({
      questionId,
      question: null,
      runs: [],
    });
  }

  // All rows share the same question_id; expose the canonical question text
  // (use the most recent variant — they should match modulo whitespace anyway).
  const question = rows[0].question;

  // Pull verdicts in one round-trip.
  let verdictMap = new Map<string, VerdictRow>();
  const runIds = rows.map((r) => r.run_id);
  const { data: verdictRows, error: vErr } = await supabaseAdmin
    .from(TABLES.dbAgentRunVerdicts)
    .select("run_id, verdict, notes")
    .in("run_id", runIds);
  if (!vErr && verdictRows) {
    for (const v of verdictRows as VerdictRow[]) {
      verdictMap.set(v.run_id, v);
    }
  }

  const runs: RunGroupDetailRun[] = rows.map((r) => {
    const v = verdictMap.get(r.run_id);
    return {
      runId: r.run_id,
      createdAt: r.created_at,
      status: r.status,
      recordCount: r.record_count,
      databasesQueried: r.databases_queried,
      answerPreview: r.answer_preview,
      stage: r.stage,
      stageVersion: r.stage_version,
      verdict: v?.verdict ?? "correct",
      notes: v?.notes ?? null,
    };
  });

  return NextResponse.json({
    questionId,
    question,
    runs,
  });
}
