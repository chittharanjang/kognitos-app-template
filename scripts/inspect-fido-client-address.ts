import "dotenv/config";

import { supabaseAdmin, TABLES } from "../lib/supabase";

/**
 * One-off diagnostic: inspect what is actually loaded in
 * fido_client_address — total row count, how many have a non-null
 * postal_code, a few sample rows, and the most recent load_run for the
 * table so we can see what SQL the SQL Query Generator emitted last time.
 */

async function main() {
  if (!supabaseAdmin) {
    throw new Error(
      "supabaseAdmin not configured (need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  console.log(`Inspecting Supabase table: ${TABLES.fidoClientAddress}`);
  console.log("─".repeat(72));

  const { count: totalCount, error: totalErr } = await supabaseAdmin
    .from(TABLES.fidoClientAddress)
    .select("*", { count: "exact", head: true });
  if (totalErr) throw new Error(`total count failed: ${totalErr.message}`);
  console.log(`Total rows:                ${totalCount ?? 0}`);

  const { count: withPostal, error: withErr } = await supabaseAdmin
    .from(TABLES.fidoClientAddress)
    .select("*", { count: "exact", head: true })
    .not("postal_code", "is", null);
  if (withErr) throw new Error(`non-null count failed: ${withErr.message}`);
  console.log(`Rows with postal_code:     ${withPostal ?? 0}`);

  const { count: withoutPostal, error: woErr } = await supabaseAdmin
    .from(TABLES.fidoClientAddress)
    .select("*", { count: "exact", head: true })
    .is("postal_code", null);
  if (woErr) throw new Error(`null count failed: ${woErr.message}`);
  console.log(`Rows missing postal_code:  ${withoutPostal ?? 0}`);

  const { data: sample, error: sErr } = await supabaseAdmin
    .from(TABLES.fidoClientAddress)
    .select("fiduciary_id, postal_code, loaded_at")
    .order("loaded_at", { ascending: false })
    .limit(8);
  if (sErr) throw new Error(`sample query failed: ${sErr.message}`);

  console.log("\nSample rows (most recent first):");
  for (const r of sample ?? []) {
    console.log(
      `  fid=${r.fiduciary_id}  postal_code=${JSON.stringify(r.postal_code)}  loaded_at=${r.loaded_at}`
    );
  }

  console.log("\nLatest source_load_runs entries for fido_client_address:");
  const { data: runs, error: rErr } = await supabaseAdmin
    .from(TABLES.sourceLoadRuns)
    .select("id, status, row_count, run_id, generated_sql, error, started_at, completed_at")
    .eq("table_name", "fido_client_address")
    .order("started_at", { ascending: false })
    .limit(3);
  if (rErr) throw new Error(`load runs query failed: ${rErr.message}`);

  for (const run of runs ?? []) {
    console.log("─".repeat(72));
    console.log(`load_run_id:    ${run.id}`);
    console.log(`status:         ${run.status}`);
    console.log(`row_count:      ${run.row_count}`);
    console.log(`run_id:         ${run.run_id}`);
    console.log(`started_at:     ${run.started_at}`);
    console.log(`completed_at:   ${run.completed_at}`);
    console.log(`error:          ${run.error ?? "—"}`);
    console.log(`generated_sql:`);
    console.log(run.generated_sql ?? "  (none)");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
