import { decodeArrowTable } from "@/lib/arrow";
import { invokeAutomation, ORG_ID, parseOutputValue, req, WORKSPACE_ID } from "@/lib/kognitos";
import {
  getSqlQueryGeneratorAutomationId,
  QUERY_ASSISTANT_STAGE,
} from "@/lib/query-assistant";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

/**
 * Source-table loader.
 *
 * For each configured source table, invoke the SQL Query Generator automation
 * with a natural-language prompt that asks for *every* row, decode the Arrow
 * IPC table from the run output, normalize the row shape, then truncate and
 * insert into the corresponding Supabase mirror table.
 *
 * Each load attempt is tracked in `source_load_runs` so a UI can poll progress
 * while the work is happening server-side.
 */

export type SourceTableKey =
  | "fido_clients"
  | "fido_client_address"
  | "wealthx_account_details"
  | "azure_profile_status";

interface SourceTableConfig {
  /** Stable key, also the Supabase target table name. */
  key: SourceTableKey;
  /** Source database label (FIDO / WealthX / Profile Status). */
  source: string;
  /** SOURCE.TABLE label for the audit log. */
  sourceTable: string;
  /** Natural-language prompt sent to the SQL Query Generator automation. */
  prompt: string;
  /**
   * Maps a raw row (uppercase columns from the source) to a row shaped for
   * the Supabase target table. Returning `null` skips the row.
   */
  mapRow: (row: Record<string, unknown>) => Record<string, unknown> | null;
  /**
   * If set, the row is upserted on this column instead of the table being
   * truncated and refilled. Used for tables with a natural primary key.
   */
  upsertKey?: string;
  /**
   * Sanity check: after mapping, at least one row must have a non-null value
   * for every column listed here. If the check fails, the load is marked as
   * failed and the existing Supabase data is preserved — no truncate-and-fill,
   * no upsert. This catches silent regressions where the SQL Query Generator
   * emits a query that drops a column we care about (e.g. it returns
   * fiduciary_id but no postal_code).
   */
  requiredNonNullColumns?: string[];
}

const TABLE_CONFIGS: SourceTableConfig[] = [
  {
    key: "fido_clients",
    source: "FIDO",
    sourceTable: "FIDO.CLIENTS_FIDO",
    prompt:
      "List every client we have on file. For each one, include their " +
      "FIDUCIARY_ID, FIRST_NAME, LAST_NAME, SSN_LAST4DIGITS, " +
      "DATE_OF_BIRTH_OR_INCEPTION, PRIMARY_EMAIL, MOBILE_PHONE, and ONLINE_PORTAL_ACCESS. " +
      "Do not apply any filters, WHERE clauses, or LIMIT.",
    upsertKey: "fiduciary_id",
    mapRow: (r) => {
      const fid = pickString(r, ["FIDUCIARY_ID", "fiduciary_id"]);
      if (!fid) return null;
      return {
        fiduciary_id: fid,
        first_name: pickString(r, ["FIRST_NAME", "first_name"]),
        last_name: pickString(r, ["LAST_NAME", "last_name"]),
        ssn_last4digits: pickString(r, ["SSN_LAST4DIGITS", "ssn_last4digits"]),
        date_of_birth_or_inception: pickString(r, [
          "DATE_OF_BIRTH_OR_INCEPTION",
          "date_of_birth_or_inception",
        ]),
        primary_email: pickString(r, ["PRIMARY_EMAIL", "primary_email"]),
        mobile_phone: pickString(r, ["MOBILE_PHONE", "mobile_phone"]),
        online_portal_access: pickString(r, [
          "ONLINE_PORTAL_ACCESS",
          "online_portal_access",
        ]),
      };
    },
  },
  {
    key: "fido_client_address",
    source: "FIDO",
    sourceTable: "FIDO.CLIENT_ADDRESS",
    // POSTAL_CODE only lives on FIDO.CLIENT_ADDRESS — it is NOT a column on
    // CLIENTS_FIDO. The SQL Query Generator has hallucinated a postal_code
    // column on CLIENTS_FIDO in the past and silently returned a result set
    // with only fiduciary_id, leaving the mirror table full of nulls.
    // The prompt below names the join explicitly so the generator can't
    // skip it, and the requiredNonNullColumns check below stops the loader
    // from overwriting good data if it ever does that again.
    prompt:
      "For every client in FIDO.CLIENTS_FIDO, return their FIDUCIARY_ID and " +
      "the POSTAL_CODE from FIDO.CLIENT_ADDRESS. POSTAL_CODE is stored on " +
      "FIDO.CLIENT_ADDRESS, NOT on FIDO.CLIENTS_FIDO. Build the result with a " +
      "LEFT JOIN between FIDO.CLIENTS_FIDO and FIDO.CLIENT_ADDRESS on " +
      "FIDUCIARY_ID so every client appears even if they have no address. " +
      "The output must include both columns FIDUCIARY_ID and POSTAL_CODE. " +
      "Do not apply any filters, WHERE clauses, or LIMIT.",
    requiredNonNullColumns: ["postal_code"],
    mapRow: (r) => {
      const fid = pickString(r, ["FIDUCIARY_ID", "fiduciary_id"]);
      if (!fid) return null;
      return {
        fiduciary_id: fid,
        postal_code: pickString(r, ["POSTAL_CODE", "postal_code"]),
      };
    },
  },
  {
    key: "wealthx_account_details",
    source: "WealthX",
    sourceTable: "WealthX.ACCOUNT_DETAILS",
    prompt:
      "Give me every account in WealthX. For each account, include its " +
      "FIDUCIARY_ID, ACCOUNT_NUMBER, ACCOUNT_STATUS, and ACCOUNT_TYPE. " +
      "Do not apply any filters, WHERE clauses, or LIMIT.",
    mapRow: (r) => {
      const fid = pickString(r, ["FIDUCIARY_ID", "fiduciary_id"]);
      if (!fid) return null;
      return {
        fiduciary_id: fid,
        account_number: pickString(r, ["ACCOUNT_NUMBER", "account_number"]),
        account_status: pickString(r, ["ACCOUNT_STATUS", "account_status"]),
        account_type: pickString(r, ["ACCOUNT_TYPE", "account_type"]),
      };
    },
  },
  {
    key: "azure_profile_status",
    source: "Profile Status",
    sourceTable: "AzureSQL.PROFILE_STATUS",
    prompt:
      "Give me every client's FIDUCIARY_ID and their PROFILE_STATUS. " +
      "Include every client. Do not apply any filters, WHERE clauses, or LIMIT.",
    upsertKey: "fiduciary_id",
    mapRow: (r) => {
      const fid = pickString(r, ["FIDUCIARY_ID", "fiduciary_id"]);
      if (!fid) return null;
      return {
        fiduciary_id: fid,
        profile_status: pickString(r, ["PROFILE_STATUS", "profile_status"]),
      };
    },
  },
];

export function listSourceTables(): { key: SourceTableKey; source: string; sourceTable: string }[] {
  return TABLE_CONFIGS.map(({ key, source, sourceTable }) => ({ key, source, sourceTable }));
}

function getConfig(key: SourceTableKey): SourceTableConfig {
  const cfg = TABLE_CONFIGS.find((c) => c.key === key);
  if (!cfg) throw new Error(`Unknown source table: ${key}`);
  return cfg;
}

/**
 * Look up a column from a row regardless of how the SQL Query Generator
 * spelled it — `FIDUCIARY_ID`, `fiduciary_id`, `fiduciaryid`, `FiduciaryId`
 * are all treated as the same field.
 */
function pickString(
  row: Record<string, unknown>,
  candidates: string[]
): string | null {
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const targets = new Set(candidates.map(normalize));
  for (const k of Object.keys(row)) {
    if (!targets.has(normalize(k))) continue;
    const v = row[k];
    if (v === null || v === undefined) continue;
    const s = typeof v === "string" ? v : String(v);
    if (s.length === 0) continue;
    return s;
  }
  return null;
}

/* ── Run-status logging helpers ──────────────────────────────────────── */

interface StartedRun {
  loadRunId: string;
}

async function startLoadRun(cfg: SourceTableConfig): Promise<StartedRun> {
  if (!supabaseAdmin) {
    throw new Error("Supabase service role not configured");
  }
  const { data, error } = await supabaseAdmin
    .from(TABLES.sourceLoadRuns)
    .insert({
      source: cfg.source,
      table_name: cfg.key,
      source_table: cfg.sourceTable,
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to record load start: ${error.message}`);
  return { loadRunId: data.id };
}

async function completeLoadRun(
  loadRunId: string,
  payload: {
    runId?: string | null;
    rowCount?: number | null;
    generatedSql?: string | null;
    error?: string | null;
    status: "completed" | "failed";
  }
): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from(TABLES.sourceLoadRuns)
    .update({
      run_id: payload.runId ?? null,
      row_count: payload.rowCount ?? null,
      generated_sql: payload.generatedSql ?? null,
      error: payload.error ?? null,
      status: payload.status,
      completed_at: new Date().toISOString(),
    })
    .eq("id", loadRunId);
}

/* ── Kognitos query execution ───────────────────────────────────────── */

interface QueryRunResult {
  runId: string;
  rows: Record<string, unknown>[];
  generatedSql: string | null;
  resultRowCount: number | null;
}

async function fetchTableViaQueryAssistant(
  prompt: string,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<QueryRunResult> {
  const timeoutMs = options.timeoutMs ?? 240_000;
  const pollIntervalMs = options.pollIntervalMs ?? 2_500;
  const automationId = getSqlQueryGeneratorAutomationId();

  const { runId, error: invokeError } = await invokeAutomation(
    automationId,
    { "User Query": { text: prompt } },
    QUERY_ASSISTANT_STAGE
  );
  if (!runId) {
    throw new Error(invokeError ?? "Failed to start SQL Query Generator");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const res = await req(
      `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`
    );
    if (!res.ok) continue;

    const data = (await res.json()) as {
      state?: {
        completed?: { outputs?: Record<string, unknown> };
        failed?: { error?: { description?: string } };
        awaiting_guidance?: { exception?: string; description?: string };
      };
    };

    if (data.state?.completed) {
      const rawOutputs = data.state.completed.outputs ?? {};

      let rows: Record<string, unknown>[] = [];
      for (const val of Object.values(rawOutputs) as Array<Record<string, unknown>>) {
        const b64 = (val?.table as Record<string, Record<string, string>>)?.inline?.data;
        if (b64) {
          try {
            rows = decodeArrowTable(b64);
          } catch (e) {
            throw new Error(
              `Failed to decode Arrow output: ${e instanceof Error ? e.message : "unknown"}`
            );
          }
          break;
        }
      }

      const generatedSql =
        (parseOutputValue(rawOutputs.generated_sql as Record<string, unknown> ?? {}) as
          | string
          | null
          | undefined) ?? null;
      const resultRowCount =
        (parseOutputValue(rawOutputs.result_row_count as Record<string, unknown> ?? {}) as
          | number
          | null
          | undefined) ?? null;

      return { runId, rows, generatedSql, resultRowCount };
    }

    if (data.state?.failed) {
      throw new Error(data.state.failed.error?.description ?? `Run ${runId} failed`);
    }
    if (data.state?.awaiting_guidance) {
      throw new Error(
        data.state.awaiting_guidance.exception ??
          data.state.awaiting_guidance.description ??
          `Run ${runId} awaiting guidance`
      );
    }
  }

  throw new Error(`Run ${runId} timed out after ${timeoutMs}ms`);
}

/* ── Supabase write ─────────────────────────────────────────────────── */

const CHUNK_SIZE = 500;

async function writeRowsToSupabase(
  cfg: SourceTableConfig,
  rows: Record<string, unknown>[]
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase service role not configured");
  }
  if (rows.length === 0) {
    // Truncate-and-fill semantics still apply: clear the table even on empty result.
    if (!cfg.upsertKey) {
      const { error } = await supabaseAdmin
        .from(cfg.key)
        .delete()
        .not("id", "is", null);
      if (error) throw new Error(`Failed to clear ${cfg.key}: ${error.message}`);
    }
    return;
  }

  if (cfg.upsertKey) {
    // Upsert keeps history rows around but updates existing.
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabaseAdmin
        .from(cfg.key)
        .upsert(chunk, { onConflict: cfg.upsertKey });
      if (error) {
        throw new Error(
          `Upsert into ${cfg.key} failed at chunk ${i}: ${error.message}`
        );
      }
    }
    return;
  }

  // Truncate-and-fill: delete existing rows then insert fresh ones.
  const { error: delError } = await supabaseAdmin
    .from(cfg.key)
    .delete()
    .not("id", "is", null);
  if (delError) {
    throw new Error(`Failed to clear ${cfg.key}: ${delError.message}`);
  }
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabaseAdmin.from(cfg.key).insert(chunk);
    if (error) {
      throw new Error(
        `Insert into ${cfg.key} failed at chunk ${i}: ${error.message}`
      );
    }
  }
}

/* ── Public entrypoints ─────────────────────────────────────────────── */

export interface LoadTableResult {
  key: SourceTableKey;
  ok: boolean;
  rowCount?: number;
  runId?: string;
  generatedSql?: string | null;
  error?: string;
}

export async function loadSourceTable(key: SourceTableKey): Promise<LoadTableResult> {
  const cfg = getConfig(key);
  const { loadRunId } = await startLoadRun(cfg);

  try {
    const { runId, rows, generatedSql } = await fetchTableViaQueryAssistant(cfg.prompt);

    const mapped: Record<string, unknown>[] = [];
    for (const r of rows) {
      const m = cfg.mapRow(r);
      if (m) mapped.push(m);
    }

    // Sanity check: if the SQL Query Generator silently dropped a column we
    // care about (e.g. postal_code), refuse to overwrite the existing mirror
    // table with all-null data. Fail the load instead so the previous good
    // load is preserved and the failure shows up in source_load_runs.
    if (cfg.requiredNonNullColumns?.length && mapped.length > 0) {
      const missing = cfg.requiredNonNullColumns.filter(
        (col) => !mapped.some((m) => m[col] != null && m[col] !== "")
      );
      if (missing.length > 0) {
        throw new Error(
          `Aborted load: SQL Query Generator returned ${mapped.length} rows ` +
            `but no value for required column(s): ${missing.join(", ")}. ` +
            `Generated SQL: ${generatedSql ?? "(none)"}. ` +
            `Existing data in ${cfg.key} was preserved.`
        );
      }
    }

    await writeRowsToSupabase(cfg, mapped);

    await completeLoadRun(loadRunId, {
      runId,
      rowCount: mapped.length,
      generatedSql,
      status: "completed",
    });

    return { key, ok: true, rowCount: mapped.length, runId, generatedSql };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown loader error";
    await completeLoadRun(loadRunId, { status: "failed", error: message });
    return { key, ok: false, error: message };
  }
}

export async function loadAllSourceTables(): Promise<LoadTableResult[]> {
  const results: LoadTableResult[] = [];
  for (const cfg of TABLE_CONFIGS) {
    const r = await loadSourceTable(cfg.key);
    results.push(r);
  }
  return results;
}
