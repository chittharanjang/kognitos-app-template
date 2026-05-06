import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Table query_run_index does not exist yet. Apply supabase/migrations/00000000000012_query_run_index.sql in the Supabase Dashboard SQL Editor, then click 'Build index'.";
const MAX_FETCH = 5000;
const TREND_LEN = 5;

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

interface IndexRow {
  run_id: string;
  question: string;
  question_id: string;
  question_norm: string;
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
}

export interface QueryRunGroupSummary {
  questionId: string;
  question: string;
  runCount: number;
  completedCount: number;
  failedCount: number;
  otherCount: number;
  firstRunAt: string;
  lastRunAt: string;
  latestRowCount: number | null;
  rowCountTrend: (number | null)[];
  verdictTrend: ("correct" | "incorrect")[];
  latestStatus: string;
  latestAnswerPreview: string | null;
  latestStage: string | null;
  latestStageVersion: string | null;
  versionsSeen: string[];
}

/**
 * GET /api/query/run-groups
 *
 * Mirror of GET /api/ama-agent/run-groups for the SQL Query Generator. Reads
 * from query_run_index, joins verdicts, and aggregates by question_id.
 *
 * Query params:
 *   search   — case-insensitive ilike against question_norm
 *   sort     — "recent" (default), "runs", "failures"
 *   limit    — max groups returned (1..1000, default 200)
 */
export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const sort = (url.searchParams.get("sort") ?? "recent").trim();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 1),
    1000,
  );

  let query = supabaseAdmin
    .from(TABLES.queryRunIndex)
    .select(
      "run_id, question, question_id, question_norm, created_at, status, result_row_count, applied_where_clause_count, answer_preview, stage, stage_version",
    )
    .order("created_at", { ascending: false })
    .limit(MAX_FETCH);

  if (search) {
    query = query.ilike("question_norm", `%${search}%`);
  }

  const { data: rawRows, error } = await query;
  if (error) {
    const code = (error as { code?: string }).code;
    const missing = isMissingTable(code);
    return NextResponse.json(
      {
        error: missing ? MIGRATION_HINT : error.message,
        code,
        groups: [],
        total: 0,
        needsMigration: missing,
      },
      { status: missing ? 200 : 500 },
    );
  }

  const rows = (rawRows ?? []) as IndexRow[];

  // Pull verdicts for the same run set so we can render a verdict trend.
  let verdictMap = new Map<string, VerdictRow["verdict"]>();
  if (rows.length > 0) {
    const runIds = rows.map((r) => r.run_id);
    // Supabase enforces a URL-length limit on .in() — chunk to be safe.
    const CHUNK = 200;
    for (let i = 0; i < runIds.length; i += CHUNK) {
      const slice = runIds.slice(i, i + CHUNK);
      const { data: verdictRows, error: vErr } = await supabaseAdmin
        .from(TABLES.queryRunVerdicts)
        .select("run_id, verdict")
        .in("run_id", slice);
      if (vErr) {
        // Verdict table missing / unreachable — degrade gracefully, no trend.
        break;
      }
      for (const v of (verdictRows ?? []) as VerdictRow[]) {
        verdictMap.set(v.run_id, v.verdict ?? null);
      }
    }
  }

  // Aggregate in JS — `rows` is already ordered newest-first.
  const groupMap = new Map<string, QueryRunGroupSummary>();
  const versionSets = new Map<string, Set<string>>();

  for (const r of rows) {
    let g = groupMap.get(r.question_id);
    if (!g) {
      g = {
        questionId: r.question_id,
        question: r.question,
        runCount: 0,
        completedCount: 0,
        failedCount: 0,
        otherCount: 0,
        firstRunAt: r.created_at,
        lastRunAt: r.created_at,
        latestRowCount: r.result_row_count,
        rowCountTrend: [],
        verdictTrend: [],
        latestStatus: r.status,
        latestAnswerPreview: r.answer_preview,
        latestStage: r.stage,
        latestStageVersion: r.stage_version,
        versionsSeen: [],
      };
      groupMap.set(r.question_id, g);
      versionSets.set(r.question_id, new Set<string>());
    }
    g.runCount += 1;
    if (r.status === "completed") g.completedCount += 1;
    else if (r.status === "failed" || r.status === "awaiting_guidance")
      g.failedCount += 1;
    else g.otherCount += 1;

    if (r.created_at < g.firstRunAt) g.firstRunAt = r.created_at;
    if (r.created_at > g.lastRunAt) g.lastRunAt = r.created_at;

    if (g.rowCountTrend.length < TREND_LEN) {
      g.rowCountTrend.push(r.result_row_count);
    }
    if (g.verdictTrend.length < TREND_LEN) {
      const v = verdictMap.get(r.run_id) ?? "correct";
      g.verdictTrend.push(v ?? "correct");
    }
    if (r.stage_version) {
      versionSets.get(r.question_id)!.add(r.stage_version);
    }
  }

  for (const [qid, set] of versionSets.entries()) {
    const g = groupMap.get(qid);
    if (!g) continue;
    g.versionsSeen = Array.from(set).sort((a, b) => {
      const aa = a.split(".").map((n) => parseInt(n, 10) || 0);
      const bb = b.split(".").map((n) => parseInt(n, 10) || 0);
      const len = Math.max(aa.length, bb.length);
      for (let i = 0; i < len; i++) {
        const av = aa[i] ?? 0;
        const bv = bb[i] ?? 0;
        if (av !== bv) return bv - av;
      }
      return 0;
    });
  }

  // Trends were collected newest→oldest while walking `created_at desc`.
  // Reverse so the UI receives oldest→newest.
  for (const g of groupMap.values()) {
    g.rowCountTrend.reverse();
    g.verdictTrend.reverse();
  }

  let groups = Array.from(groupMap.values());

  if (sort === "runs") {
    groups.sort((a, b) => b.runCount - a.runCount);
  } else if (sort === "failures") {
    groups.sort((a, b) => {
      const ar = a.runCount === 0 ? 0 : a.failedCount / a.runCount;
      const br = b.runCount === 0 ? 0 : b.failedCount / b.runCount;
      return br - ar;
    });
  } else {
    groups.sort((a, b) => (a.lastRunAt < b.lastRunAt ? 1 : -1));
  }

  if (groups.length > limit) {
    groups = groups.slice(0, limit);
  }

  return NextResponse.json({
    groups,
    total: groups.length,
    scannedRuns: rows.length,
    truncated: rows.length === MAX_FETCH,
  });
}
