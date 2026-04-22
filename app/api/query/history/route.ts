import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ entries: [] });
  }

  const { data, error } = await supabaseAdmin
    .from(TABLES.queryHistory)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = (data ?? []).map((row) => ({
    id: row.id,
    query: row.query,
    runId: row.run_id,
    result: row.result,
    error: row.error,
    loading: false,
    elapsed: row.elapsed ?? 0,
  }));

  return NextResponse.json({ entries });
}

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { id, query, runId, result, error: entryError, elapsed, status } = body;

  const { data, error } = await supabaseAdmin
    .from(TABLES.queryHistory)
    .upsert(
      {
        id,
        query,
        run_id: runId ?? null,
        result: result ?? null,
        error: entryError ?? null,
        elapsed: elapsed ?? 0,
        status: status ?? "loading",
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

export async function DELETE() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { error } = await supabaseAdmin
    .from(TABLES.queryHistory)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
