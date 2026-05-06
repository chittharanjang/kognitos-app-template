import { NextResponse } from "next/server";
import { fetchQueryRunDetail } from "@/lib/query-assistant";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RUNS = 4;

interface VerdictRow {
  run_id: string;
  verdict: "correct" | "incorrect" | null;
  notes: string | null;
}

interface IndexRow {
  run_id: string;
  question: string;
  question_id: string;
  created_at: string;
  stage: string | null;
  stage_version: string | null;
}

/**
 * POST /api/query/run-groups/compare
 *
 * Body: { runIds: string[] }   (≤ MAX_RUNS)
 *
 * Returns full per-run detail (live from Kognitos) for each requested run,
 * plus the matching verdict + index row, in the same order as the input.
 * Powers the side-by-side comparison page
 * (/query/run-groups/[questionId]/compare). Mirror of the DB Agent compare.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const payload = body as { runIds?: unknown };
  if (!Array.isArray(payload.runIds)) {
    return NextResponse.json(
      { error: "runIds must be an array of strings" },
      { status: 400 },
    );
  }
  const runIds = Array.from(
    new Set(
      (payload.runIds as unknown[])
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
  if (runIds.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one runId" },
      { status: 400 },
    );
  }
  if (runIds.length > MAX_RUNS) {
    return NextResponse.json(
      { error: `Compare at most ${MAX_RUNS} runs at once` },
      { status: 400 },
    );
  }

  // Fetch the full detail (Kognitos REST + Arrow decode) in parallel.
  const detailPromises = runIds.map((rid) => fetchQueryRunDetail(rid));

  // Fetch the index + verdict rows alongside in a single Supabase round-trip.
  let indexMap = new Map<string, IndexRow>();
  let verdictMap = new Map<string, VerdictRow>();
  if (supabaseAdmin) {
    const [{ data: indexRows }, { data: verdictRows }] = await Promise.all([
      supabaseAdmin
        .from(TABLES.queryRunIndex)
        .select(
          "run_id, question, question_id, created_at, stage, stage_version",
        )
        .in("run_id", runIds),
      supabaseAdmin
        .from(TABLES.queryRunVerdicts)
        .select("run_id, verdict, notes")
        .in("run_id", runIds),
    ]);
    for (const r of (indexRows ?? []) as IndexRow[]) indexMap.set(r.run_id, r);
    for (const v of (verdictRows ?? []) as VerdictRow[])
      verdictMap.set(v.run_id, v);
  }

  const details = await Promise.all(detailPromises);

  // Prefer the per-run detail's stage/stageVersion (always fresh from
  // Kognitos) and fall back to the index row only if the live fetch failed.
  const runs = details.map((d, i) => {
    const idx = indexMap.get(runIds[i]) ?? null;
    const v = verdictMap.get(runIds[i]) ?? null;
    return {
      ...d,
      indexedQuestion: idx?.question ?? d.question ?? null,
      indexedCreatedAt: idx?.created_at ?? d.createdAt ?? null,
      questionId: idx?.question_id ?? null,
      stage: d.stage ?? idx?.stage ?? null,
      stageVersion: d.stageVersion ?? idx?.stage_version ?? null,
      verdict: v?.verdict ?? "correct",
      notes: v?.notes ?? null,
    };
  });

  return NextResponse.json({ runs });
}
