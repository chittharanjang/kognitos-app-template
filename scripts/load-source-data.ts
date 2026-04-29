import "dotenv/config";

/**
 * One-shot loader: pulls every row from each configured source table
 * (FIDO.CLIENTS_FIDO, FIDO.CLIENT_ADDRESS, WealthX.ACCOUNT_DETAILS,
 *  AzureSQL.PROFILE_STATUS) and writes the results into the matching
 * Supabase mirror tables.
 *
 * Run:  npx tsx scripts/load-source-data.ts
 *       npx tsx scripts/load-source-data.ts fido_clients         # single table
 *       npx tsx scripts/load-source-data.ts azure_profile_status # single table
 */

import {
  listSourceTables,
  loadAllSourceTables,
  loadSourceTable,
  type SourceTableKey,
} from "../lib/source-loader";

const VALID_KEYS: SourceTableKey[] = listSourceTables().map((t) => t.key);

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const arg = process.argv[2]?.trim();

  if (arg && !VALID_KEYS.includes(arg as SourceTableKey)) {
    console.error(`Unknown source table: "${arg}"`);
    console.error(`Valid keys: ${VALID_KEYS.join(", ")}`);
    process.exit(1);
  }

  console.log("Source data loader");
  console.log("─".repeat(60));

  const start = Date.now();

  if (arg) {
    const r = await loadSourceTable(arg as SourceTableKey);
    if (r.ok) {
      console.log(
        `[ok] ${r.key}: ${r.rowCount ?? 0} rows  (run ${r.runId ?? "?"})`
      );
    } else {
      console.error(`[fail] ${r.key}: ${r.error}`);
      process.exit(1);
    }
  } else {
    const results = await loadAllSourceTables();
    let failed = 0;
    for (const r of results) {
      if (r.ok) {
        console.log(`[ok]   ${r.key.padEnd(28)} ${r.rowCount ?? 0} rows  (run ${r.runId ?? "?"})`);
      } else {
        console.error(`[fail] ${r.key.padEnd(28)} ${r.error}`);
        failed++;
      }
    }
    console.log("─".repeat(60));
    console.log(
      `Done in ${fmtMs(Date.now() - start)} — ${results.length - failed}/${results.length} succeeded`
    );
    if (failed > 0) process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
