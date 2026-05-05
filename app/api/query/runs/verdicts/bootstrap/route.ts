import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Tables/columns for query_run_verdicts are not up to date. Apply supabase/migrations/00000000000007_query_run_verdicts.sql and 00000000000009_run_verdict_notes.sql in the Supabase Dashboard SQL Editor.";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "42703" || code === "PGRST205";
}

interface BootstrapInput {
  runId: string;
  question?: string | null;
  answer?: string | null;
}

interface ExistingRow {
  run_id: string;
}

/**
 * POST /api/query/runs/verdicts/bootstrap
 *
 * Body: { runs: [{ runId, question?, answer? }, ...] }
 *
 * Ensures every run in the request has a row in query_run_verdicts. Existing
 * rows are left untouched (their verdict and notes are preserved); missing
 * rows are inserted with verdict='correct' as the default.
 *
 * Idempotent — safe to call repeatedly. Used by the Run History list page
 * after each `loadPage()` so visible runs always have an explicit verdict
 * row backing the new toggle UI.
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
    };
    if (typeof obj.runId !== "string") continue;
    const runId = obj.runId.trim();
    if (runId.length === 0) continue;
    inputs.push({
      runId,
      question: typeof obj.question === "string" ? obj.question : null,
      answer: typeof obj.answer === "string" ? obj.answer : null,
    });
  }

  if (inputs.length === 0) {
    return NextResponse.json({ inserted: 0, alreadyPresent: 0 });
  }

  const runIds = Array.from(new Set(inputs.map((i) => i.runId)));

  // Find which run IDs already have a row so we don't overwrite their
  // verdict/notes with defaults.
  const { data: existingData, error: existingError } = await supabaseAdmin
    .from(TABLES.queryRunVerdicts)
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
    // de-dupe within the request itself
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
    .from(TABLES.queryRunVerdicts)
    .insert(toInsert);

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    const missing = isMissingTable(code);
    // Race: another request inserted the same run_id between our SELECT and
    // INSERT. Treat unique-violation (23505) as success since the goal was
    // "ensure a row exists" and that's now true.
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

  return NextResponse.json({
    inserted: toInsert.length,
    alreadyPresent: existing.size,
  });
}
