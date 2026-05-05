import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Verdict = "correct" | "incorrect";

interface VerdictRow {
  run_id: string;
  question: string | null;
  answer: string | null;
  verdict: Verdict | null;
  notes: string | null;
  updated_at: string | null;
}

interface VerdictEntry {
  verdict: Verdict;
  notes: string | null;
  question: string | null;
  answer: string | null;
  updatedAt: string | null;
}

const MIGRATION_HINT =
  "Tables/columns for db_agent_run_verdicts are not up to date. Apply supabase/migrations/00000000000008_db_agent_run_verdicts.sql and 00000000000009_run_verdict_notes.sql in the Supabase Dashboard SQL Editor.";

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "42703" || code === "PGRST205";
}

function normalizeNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured", verdicts: {} },
      { status: 500 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from(TABLES.dbAgentRunVerdicts)
    .select("run_id, question, answer, verdict, notes, updated_at")
    .limit(5000);

  if (error) {
    const code = (error as { code?: string }).code;
    const missing = isMissingTable(code);
    return NextResponse.json(
      {
        error: missing ? MIGRATION_HINT : error.message,
        code,
        verdicts: {},
        needsMigration: missing,
      },
      { status: missing ? 200 : 500 },
    );
  }

  const verdicts: Record<string, VerdictEntry> = {};
  for (const row of (data ?? []) as VerdictRow[]) {
    if (!row.verdict) continue;
    verdicts[row.run_id] = {
      verdict: row.verdict,
      notes: row.notes,
      question: row.question,
      answer: row.answer,
      updatedAt: row.updated_at,
    };
  }

  return NextResponse.json({ verdicts });
}

export async function PUT(request: Request) {
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

  const payload = body as {
    runId?: unknown;
    question?: unknown;
    answer?: unknown;
    verdict?: unknown;
    notes?: unknown;
  };

  if (typeof payload.runId !== "string" || payload.runId.trim().length === 0) {
    return NextResponse.json(
      { error: "runId is required" },
      { status: 400 },
    );
  }

  const verdictRaw = payload.verdict;
  if (
    verdictRaw !== "correct" &&
    verdictRaw !== "incorrect" &&
    verdictRaw !== null &&
    verdictRaw !== undefined
  ) {
    return NextResponse.json(
      { error: "verdict must be 'correct', 'incorrect', or null" },
      { status: 400 },
    );
  }

  const runId = payload.runId.trim();

  if (verdictRaw === null) {
    const { error } = await supabaseAdmin
      .from(TABLES.dbAgentRunVerdicts)
      .delete()
      .eq("run_id", runId);

    if (error) {
      const code = (error as { code?: string }).code;
      const missing = isMissingTable(code);
      return NextResponse.json(
        {
          error: missing ? MIGRATION_HINT : error.message,
          code,
          needsMigration: missing,
        },
        { status: missing ? 503 : 500 },
      );
    }

    return NextResponse.json({ ok: true, runId, verdict: null });
  }

  const verdict: Verdict = verdictRaw === "incorrect" ? "incorrect" : "correct";

  const question =
    typeof payload.question === "string" ? payload.question : null;
  const answer = typeof payload.answer === "string" ? payload.answer : null;
  const notes =
    payload.notes === undefined ? undefined : normalizeNotes(payload.notes);
  const now = new Date().toISOString();

  const upsertPayload: Record<string, unknown> = {
    run_id: runId,
    question,
    answer,
    verdict,
    updated_at: now,
  };
  if (notes !== undefined) {
    upsertPayload.notes = notes;
  }

  const { data, error } = await supabaseAdmin
    .from(TABLES.dbAgentRunVerdicts)
    .upsert(upsertPayload, { onConflict: "run_id" })
    .select("run_id, verdict, notes, updated_at")
    .single();

  if (error) {
    const code = (error as { code?: string }).code;
    const missing = isMissingTable(code);
    return NextResponse.json(
      {
        error: missing ? MIGRATION_HINT : error.message,
        code,
        needsMigration: missing,
      },
      { status: missing ? 503 : 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    runId: data?.run_id ?? runId,
    verdict: data?.verdict ?? verdict,
    notes: data?.notes ?? notes ?? null,
    updatedAt: data?.updated_at ?? now,
  });
}
