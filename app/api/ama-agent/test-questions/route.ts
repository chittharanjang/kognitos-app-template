import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase admin client not configured" },
      { status: 500 },
    );
  }

  const { data, error, count } = await supabaseAdmin
    .from(TABLES.dbAgentTestQuestions)
    .select("id, question, source, first_seen_at, last_seen_at, run_count", {
      count: "exact",
    })
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(2000);

  if (error) {
    const code = (error as { code?: string }).code;
    const isMissingTable = code === "42P01" || code === "PGRST205";
    return NextResponse.json(
      {
        error: isMissingTable
          ? "Table db_agent_test_questions does not exist yet. Apply supabase/migrations/00000000000005_db_agent_test_questions.sql in the Supabase Dashboard SQL Editor, then click 'Load questions'."
          : error.message,
        code,
        questions: [],
        total: 0,
        needsMigration: isMissingTable,
      },
      { status: isMissingTable ? 200 : 500 },
    );
  }

  return NextResponse.json({
    questions: data ?? [],
    total: count ?? data?.length ?? 0,
  });
}
