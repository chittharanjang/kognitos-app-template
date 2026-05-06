import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey) {
  console.warn("Supabase credentials missing — chat persistence disabled");
}

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const supabaseAdmin = url && serviceKey ? createClient(url, serviceKey) : null;

/**
 * Project-specific table names. Rename this prefix to match your automation
 * (e.g. "invoice_processing_sessions") so multiple apps can share one
 * Supabase project without collisions.
 */
export const TABLES = {
  sessions: "chat_sessions",
  messages: "chat_messages",
  queryHistory: "query_history",
  // Source-of-truth mirrors loaded from Snowflake / Azure SQL via the SQL
  // Query Generator automation. See supabase/migrations/00000000000003_source_data.sql.
  fidoClients: "fido_clients",
  fidoClientAddress: "fido_client_address",
  wealthxAccountDetails: "wealthx_account_details",
  azureProfileStatus: "azure_profile_status",
  sourceLoadRuns: "source_load_runs",
  // Curated DB Agent test-question library used by the Run History page's
  // "Test" button. Populated from Kognitos run history; see
  // supabase/migrations/00000000000005_db_agent_test_questions.sql.
  dbAgentTestQuestions: "db_agent_test_questions",
  // Curated SQL Query Generator (Query app) test-question library used by the
  // /query/runs page's "Test" button. Populated from Kognitos run history of
  // the Query automation; see
  // supabase/migrations/00000000000006_query_test_questions.sql.
  queryTestQuestions: "query_test_questions",
  // Per-run reviewer verdicts (correct/incorrect) for the Query Run History.
  // One row per Kognitos run id; stores a snapshot of question + answer plus
  // the verdict. See supabase/migrations/00000000000007_query_run_verdicts.sql.
  queryRunVerdicts: "query_run_verdicts",
  // Per-run reviewer verdicts for the DB Agent (ama-agent) Run History.
  // Mirror of queryRunVerdicts for the DB Agent automation. See
  // supabase/migrations/00000000000008_db_agent_run_verdicts.sql.
  dbAgentRunVerdicts: "db_agent_run_verdicts",
  // Lightweight per-run index that powers the "Run History Groups" view —
  // one row per Kognitos run with a normalized `question_norm` and a stable
  // `question_id` so the list endpoint can group + sort in SQL without
  // re-paging Kognitos. See supabase/migrations/00000000000010_db_agent_run_index.sql.
  dbAgentRunIndex: "db_agent_run_index",
  // SQL Query Generator twin of dbAgentRunIndex. Stores the same
  // (question_id, created_at, stage_version, status) shape but with
  // result_row_count instead of record_count and no databases_queried column
  // (Query is single-source). See
  // supabase/migrations/00000000000012_query_run_index.sql.
  queryRunIndex: "query_run_index",
} as const;
