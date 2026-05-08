import { NextResponse } from "next/server";
import { req, ORG_ID, WORKSPACE_ID, parseOutputValue } from "@/lib/kognitos";
import { getSqlQueryGeneratorAutomationId } from "@/lib/query-assistant";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import {
  answerPreviewOf,
  normalizeQuestion,
  questionIdOf,
} from "@/lib/run-groups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HARD_RUN_CAP = 5000;
const PAGE_SIZE = 100;
const UPSERT_BATCH = 500;

interface RawRun {
  name: string;
  create_time?: string;
  stage?: string;
  stage_version?: string;
  user_inputs?: Record<string, Record<string, unknown>>;
  state?: {
    completed?: { outputs?: Record<string, Record<string, unknown>> };
    failed?: { error?: { description?: string } };
    awaiting_guidance?: { exception?: string; description?: string };
    [key: string]: unknown;
  };
}

interface IndexRow {
  run_id: string;
  question: string;
  question_norm: string;
  question_id: string;
  created_at: string;
  status: string;
  result_row_count: number | null;
  applied_where_clause_count: number | null;
  answer_preview: string | null;
  stage: string | null;
  stage_version: string | null;
}

function deriveStatus(state: RawRun["state"]): string {
  if (!state) return "unknown";
  if (state.completed) return "completed";
  if (state.failed) return "failed";
  if (state.awaiting_guidance) return "awaiting_guidance";
  return Object.keys(state)[0] ?? "unknown";
}

function summarizeForIndex(raw: RawRun): IndexRow | null {
  const runId = raw.name.split("/").pop() ?? raw.name;
  const userQuery =
    raw.user_inputs?.["user_query"] ?? raw.user_inputs?.["User Query"];
  const question =
    userQuery && typeof userQuery.text === "string"
      ? (userQuery.text as string).trim()
      : "";
  if (!question) return null;

  let answer: string | null = null;
  let resultRowCount: number | null = null;
  let appliedWhereClauseCount: number | null = null;

  if (raw.state?.completed?.outputs) {
    const parsed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw.state.completed.outputs)) {
      parsed[k] = parseOutputValue(v as Record<string, unknown>);
    }
    if (typeof parsed.response_text === "string") {
      answer = parsed.response_text;
    }
    if (typeof parsed.result_row_count === "number") {
      resultRowCount = parsed.result_row_count;
    }
    if (Array.isArray(parsed.applied_where_clauses)) {
      appliedWhereClauseCount = (parsed.applied_where_clauses as unknown[])
        .length;
    }
  } else if (raw.state?.failed) {
    answer = raw.state.failed.error?.description ?? null;
  } else if (raw.state?.awaiting_guidance) {
    answer =
      raw.state.awaiting_guidance.exception ??
      raw.state.awaiting_guidance.description ??
      null;
  }

  return {
    run_id: runId,
    question,
    question_norm: normalizeQuestion(question),
    question_id: questionIdOf(question),
    created_at: raw.create_time ?? new Date().toISOString(),
    status: deriveStatus(raw.state),
    result_row_count: resultRowCount,
    applied_where_clause_count: appliedWhereClauseCount,
    answer_preview: answerPreviewOf(answer),
    stage: raw.stage ?? null,
    stage_version: raw.stage_version ?? null,
  };
}

/**
 * POST /api/query/run-groups/backfill
 *
 * Pages through Kognitos's full run history for the SQL Query Generator
 * automation and upserts every run into query_run_index. Idempotent —
 * re-running just refreshes existing rows. Mirror of
 * /api/ama-agent/run-groups/backfill.
 */
export async function POST() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  const automationId = getSqlQueryGeneratorAutomationId();
  let pageToken: string | null = null;
  let totalRunsScanned = 0;
  let totalIndexed = 0;
  const seenQuestions = new Set<string>();

  while (totalRunsScanned < HARD_RUN_CAP) {
    const params = new URLSearchParams();
    params.set("pageSize", String(PAGE_SIZE));
    if (pageToken) params.set("pageToken", pageToken);

    const res = await req(
      `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs?${params.toString()}`,
    );
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        {
          error: `Failed to fetch runs from Kognitos (${res.status})`,
          detail: body.slice(0, 300),
        },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      runs?: RawRun[];
      next_page_token?: string | null;
    };
    const runs = data.runs ?? [];
    if (runs.length === 0) break;

    const batch: IndexRow[] = [];
    for (const r of runs) {
      totalRunsScanned += 1;
      const row = summarizeForIndex(r);
      if (!row) continue;
      batch.push(row);
      seenQuestions.add(row.question_id);
    }

    if (batch.length > 0) {
      const upsertResult = await upsertInChunks(batch);
      if (upsertResult.error) {
        return upsertResult.error;
      }
      totalIndexed += batch.length;
    }

    pageToken = data.next_page_token ?? null;
    if (!pageToken) break;
  }

  return NextResponse.json({
    totalRunsScanned,
    totalIndexed,
    uniqueQuestions: seenQuestions.size,
  });
}

async function upsertInChunks(rows: IndexRow[]): Promise<{
  error?: NextResponse;
}> {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const chunk = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabaseAdmin!
      .from(TABLES.queryRunIndex)
      .upsert(chunk, { onConflict: "run_id" });
    if (!error) continue;

    const code = (error as { code?: string }).code;
    const isMissingTable = code === "42P01" || code === "PGRST205";
    return {
      error: NextResponse.json(
        {
          error: isMissingTable
            ? "Table query_run_index does not exist yet. Apply supabase/migrations/00000000000012_query_run_index.sql in the Supabase Dashboard SQL Editor, then click 'Build index' again."
            : `Failed to upsert run index: ${error.message}`,
          code,
          needsMigration: isMissingTable,
        },
        { status: isMissingTable ? 412 : 500 },
      ),
    };
  }
  return {};
}
