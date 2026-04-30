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
} as const;
