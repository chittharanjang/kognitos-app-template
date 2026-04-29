import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import {
  listSourceTables,
  loadAllSourceTables,
  loadSourceTable,
  type SourceTableKey,
} from "@/lib/source-loader";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — full load can pull from 4 source tables

const VALID_KEYS = new Set<SourceTableKey>(
  listSourceTables().map((t) => t.key as SourceTableKey)
);

/**
 * GET /api/sources/load
 * Returns the most recent load run per table plus current row counts in Supabase.
 */
export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 500 }
    );
  }

  const tables = listSourceTables();
  // Re-bind to a local non-null reference so the narrowing survives into the
  // `tables.map(...)` callback below (TS won't carry narrowing into closures).
  const supa = supabaseAdmin;

  const [latestRunsRes, ...countResults] = await Promise.all([
    supa
      .from(TABLES.sourceLoadRuns)
      .select("id, source, table_name, source_table, run_id, status, row_count, error, started_at, completed_at, generated_sql")
      .order("started_at", { ascending: false })
      .limit(50),
    ...tables.map((t) =>
      supa.from(t.key).select("*", { count: "exact", head: true })
    ),
  ]);

  if (latestRunsRes.error) {
    return NextResponse.json(
      { error: `Failed to read load runs: ${latestRunsRes.error.message}` },
      { status: 500 }
    );
  }

  // Reduce the raw run history into one "latest run" per table.
  const latestByTable = new Map<string, (typeof latestRunsRes.data)[number]>();
  for (const r of latestRunsRes.data ?? []) {
    if (!latestByTable.has(r.table_name)) {
      latestByTable.set(r.table_name, r);
    }
  }

  const sources = tables.map((t, idx) => {
    const cnt = countResults[idx];
    const latest = latestByTable.get(t.key) ?? null;
    return {
      key: t.key,
      source: t.source,
      sourceTable: t.sourceTable,
      currentRowCount: cnt.error ? null : cnt.count ?? 0,
      countError: cnt.error?.message ?? null,
      latestRun: latest,
    };
  });

  return NextResponse.json({
    sources,
    recentRuns: latestRunsRes.data ?? [],
  });
}

/**
 * POST /api/sources/load
 * Body: { table?: SourceTableKey | "all" }
 * Loads either a single source table or all of them.
 * Long-running (each table can take 30-90s); plays inside maxDuration = 300s.
 */
export async function POST(request: Request) {
  let body: { table?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults to "all"
  }

  const target = (body.table ?? "all").trim();

  if (target === "all") {
    const results = await loadAllSourceTables();
    const ok = results.every((r) => r.ok);
    return NextResponse.json(
      {
        ok,
        results,
      },
      { status: ok ? 200 : 207 }
    );
  }

  if (!VALID_KEYS.has(target as SourceTableKey)) {
    return NextResponse.json(
      {
        error: `Unknown source table: "${target}"`,
        validKeys: Array.from(VALID_KEYS),
      },
      { status: 400 }
    );
  }

  const result = await loadSourceTable(target as SourceTableKey);
  return NextResponse.json(
    { ok: result.ok, result },
    { status: result.ok ? 200 : 500 }
  );
}
