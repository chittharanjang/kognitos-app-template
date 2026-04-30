import { NextResponse } from "next/server";
import { req, ORG_ID, WORKSPACE_ID } from "@/lib/kognitos";
import { getAmaAgentAutomationId } from "@/lib/ama-agent";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface RawRun {
  name: string;
  create_time?: string;
  user_inputs?: Record<string, Record<string, unknown>>;
}

interface QuestionAggregate {
  question: string;
  firstSeenAt: string;
  lastSeenAt: string;
  runCount: number;
}

const HARD_RUN_CAP = 5000;
const PAGE_SIZE = 100;

function extractQuestion(run: RawRun): string | null {
  const uq = run.user_inputs?.["User Query"];
  if (!uq) return null;
  const text = uq.text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed;
}

export async function POST() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  const automationId = getAmaAgentAutomationId();
  const aggregates = new Map<string, QuestionAggregate>();
  let pageToken: string | null = null;
  let totalRunsScanned = 0;

  while (totalRunsScanned < HARD_RUN_CAP) {
    const params = new URLSearchParams();
    params.set("pageSize", String(PAGE_SIZE));
    if (pageToken) params.set("pageToken", pageToken);

    const res: Response = await req(
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

    for (const r of runs) {
      totalRunsScanned += 1;
      const q = extractQuestion(r);
      if (!q) continue;
      const ts = r.create_time ?? new Date().toISOString();
      const existing = aggregates.get(q);
      if (existing) {
        existing.runCount += 1;
        if (ts < existing.firstSeenAt) existing.firstSeenAt = ts;
        if (ts > existing.lastSeenAt) existing.lastSeenAt = ts;
      } else {
        aggregates.set(q, {
          question: q,
          firstSeenAt: ts,
          lastSeenAt: ts,
          runCount: 1,
        });
      }
    }

    pageToken = data.next_page_token ?? null;
    if (!pageToken || runs.length === 0) break;
  }

  const rows = Array.from(aggregates.values()).map((a) => ({
    question: a.question,
    source: "kognitos_history",
    first_seen_at: a.firstSeenAt,
    last_seen_at: a.lastSeenAt,
    run_count: a.runCount,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return NextResponse.json({
      totalRunsScanned,
      uniqueQuestions: 0,
      upserted: 0,
    });
  }

  const { error: upsertError, count } = await supabaseAdmin
    .from(TABLES.dbAgentTestQuestions)
    .upsert(rows, { onConflict: "question", count: "exact" });

  if (upsertError) {
    const code = (upsertError as { code?: string }).code;
    const isMissingTable = code === "42P01" || code === "PGRST205";
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Table db_agent_test_questions does not exist in Supabase. Apply migration 00000000000005_db_agent_test_questions.sql via the Supabase Dashboard SQL Editor, then click 'Load questions' again."
          : `Failed to upsert questions: ${upsertError.message}`,
        code,
        needsMigration: isMissingTable,
      },
      { status: isMissingTable ? 412 : 500 },
    );
  }

  return NextResponse.json({
    totalRunsScanned,
    uniqueQuestions: rows.length,
    upserted: count ?? rows.length,
  });
}
