import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Table query_run_index does not exist yet. Apply supabase/migrations/00000000000012_query_run_index.sql in the Supabase Dashboard SQL Editor, then click 'Build index' on the Query Run Groups page.";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

interface IndexRow {
  run_id: string;
  question: string;
  question_id: string;
  created_at: string;
  status: string;
  result_row_count: number | null;
  applied_where_clause_count: number | null;
  answer_preview: string | null;
  stage: string | null;
  stage_version: string | null;
}

interface VerdictRow {
  run_id: string;
  verdict: "correct" | "incorrect" | null;
  notes: string | null;
}

export interface QueryRunGroupDetailRun {
  runId: string;
  createdAt: string;
  status: string;
  resultRowCount: number | null;
  appliedWhereClauseCount: number | null;
  answerPreview: string | null;
  stage: string | null;
  stageVersion: string | null;
  verdict: "correct" | "incorrect" | null;
  notes: string | null;
}

/**
 * GET /api/query/run-groups/[questionId]
 *
 * Returns every run for the given question_id (newest first), enriched with
 * verdict + notes. Mirror of the DB Agent equivalent.
 */
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

  const { data: rawRows, error } = await supabaseAdmin
    .from(TABLES.queryRunIndex)
    .select(
      "run_id, question, question_id, created_at, status, result_row_count, applied_where_clause_count, answer_preview, stage, stage_version",
    )
    .eq("question_id", questionId)
    .order("created_at", { ascending: false })
    .limit(1000);

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
  // (use the most recent variant — they should match modulo whitespace).
  const question = rows[0].question;

  // Pull verdicts in one round-trip.
  let verdictMap = new Map<string, VerdictRow>();
  const runIds = rows.map((r) => r.run_id);
  const { data: verdictRows, error: vErr } = await supabaseAdmin
    .from(TABLES.queryRunVerdicts)
    .select("run_id, verdict, notes")
    .in("run_id", runIds);
  if (!vErr && verdictRows) {
    for (const v of verdictRows as VerdictRow[]) {
      verdictMap.set(v.run_id, v);
    }
  }

  const runs: QueryRunGroupDetailRun[] = rows.map((r) => {
    const v = verdictMap.get(r.run_id);
    return {
      runId: r.run_id,
      createdAt: r.created_at,
      status: r.status,
      resultRowCount: r.result_row_count,
      appliedWhereClauseCount: r.applied_where_clause_count,
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
