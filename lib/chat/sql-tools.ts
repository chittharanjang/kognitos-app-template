import type Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Anthropic tools the chat assistant uses to answer questions about the
 * mirrored client / account / profile data living in Supabase.
 *
 * The chat route never invokes the Kognitos SQL Query Generator — all
 * answers come from running a SELECT against these tables.
 */

export const SQL_TOOLS: Anthropic.Tool[] = [
  {
    name: "describe_schema",
    description:
      "Return the schema of the four source-of-truth tables that mirror " +
      "FIDO, WealthX, and Azure SQL into Supabase. Call this once at the " +
      "start of a conversation if you need a refresher on column names " +
      "before writing SQL.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "run_sql",
    description:
      "Execute a Postgres SELECT against the source mirror tables and return " +
      "the rows as a JSON array. Only SELECT/WITH queries are accepted; " +
      "INSERT/UPDATE/DELETE/DDL are rejected. Tables: fido_clients, " +
      "fido_client_address, wealthx_account_details, azure_profile_status. " +
      "All four tables share the join key fiduciary_id.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A single Postgres SELECT statement. Use ILIKE for case-insensitive " +
            "string matching. Reference tables by their lowercase Supabase names. " +
            "Always include LIMIT 200 unless the user explicitly asks for everything.",
        },
        purpose: {
          type: "string",
          description:
            "Short (<= 12 words) description of what this query is meant to answer. " +
            "Shown in the UI while the query runs.",
        },
      },
      required: ["query"],
    },
  },
];

/* ── Static schema description used by describe_schema ────────────────── */

interface ColumnDescriptor {
  name: string;
  type: string;
  notes?: string;
}

interface TableDescriptor {
  name: string;
  source: string;
  description: string;
  columns: ColumnDescriptor[];
}

export const TABLE_SCHEMA: TableDescriptor[] = [
  {
    name: "fido_clients",
    source: "FIDO (Snowflake)",
    description: "One row per client. Personal / contact info. Primary key: fiduciary_id.",
    columns: [
      { name: "fiduciary_id", type: "text", notes: "primary key, e.g. 'F1005' — the join key across all four tables" },
      { name: "first_name", type: "text" },
      { name: "last_name", type: "text" },
      { name: "ssn_last4digits", type: "text" },
      { name: "date_of_birth_or_inception", type: "text", notes: "ISO date string, e.g. '1992-04-11'" },
      { name: "primary_email", type: "text" },
      { name: "mobile_phone", type: "text" },
      { name: "online_portal_access", type: "text", notes: "stringly-typed boolean: 'True' / 'False'" },
    ],
  },
  {
    name: "fido_client_address",
    source: "FIDO (Snowflake)",
    description: "One row per client address. Each client typically has exactly one row.",
    columns: [
      { name: "fiduciary_id", type: "text" },
      { name: "postal_code", type: "text", notes: "may be the literal string 'None' for missing values" },
    ],
  },
  {
    name: "wealthx_account_details",
    source: "WealthX (Snowflake)",
    description: "One row per (client × account). A single client can hold multiple accounts.",
    columns: [
      { name: "fiduciary_id", type: "text" },
      { name: "account_number", type: "text" },
      { name: "account_status", type: "text", notes: "e.g. 'Open', 'Closed'" },
      { name: "account_type", type: "text", notes: "e.g. 'Traditional IRA', 'Roth IRA', 'Brokerage'" },
    ],
  },
  {
    name: "azure_profile_status",
    source: "Profile Status (Azure SQL)",
    description: "One row per client. Profile activity status.",
    columns: [
      { name: "fiduciary_id", type: "text", notes: "primary key" },
      { name: "profile_status", type: "text", notes: "e.g. 'Active', 'Locked', 'Pending'; can be null" },
    ],
  },
];

export function describeSchemaText(): string {
  const lines: string[] = [];
  for (const t of TABLE_SCHEMA) {
    lines.push(`### ${t.name}  (${t.source})`);
    lines.push(t.description);
    for (const c of t.columns) {
      const note = c.notes ? `  — ${c.notes}` : "";
      lines.push(`- ${c.name} (${c.type})${note}`);
    }
    lines.push("");
  }
  lines.push("All four tables share the join key fiduciary_id.");
  return lines.join("\n");
}

/* ── Tool handlers ────────────────────────────────────────────────────── */

const MAX_RESULT_ROWS_INLINE = 200;
const MAX_RESULT_CHARS = 24_000;

interface RunSqlInput {
  query?: unknown;
}

/**
 * Execute a tool the model invoked. Returns a string (the tool_result content
 * that gets fed back to Claude on the next turn). Errors are stringified and
 * returned so Claude can explain them to the user instead of aborting.
 */
export async function executeSqlTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (name === "describe_schema") {
    return describeSchemaText();
  }

  if (name === "run_sql") {
    const { query } = input as RunSqlInput;
    if (typeof query !== "string" || !query.trim()) {
      return "Tool error: missing or empty 'query' string.";
    }
    if (!supabaseAdmin) {
      return "Tool error: Supabase service role not configured on the server.";
    }

    try {
      const { data, error } = await supabaseAdmin.rpc("chat_sql", { query });
      if (error) {
        return `SQL error: ${error.message}`;
      }

      const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
      const truncated = rows.length > MAX_RESULT_ROWS_INLINE;
      const slice = truncated ? rows.slice(0, MAX_RESULT_ROWS_INLINE) : rows;

      let payload = JSON.stringify(
        {
          row_count: rows.length,
          truncated,
          rows: slice,
        },
        null,
        2
      );

      // Hard cap by char length too so a single huge text column doesn't blow up Claude's context.
      if (payload.length > MAX_RESULT_CHARS) {
        payload =
          payload.slice(0, MAX_RESULT_CHARS) +
          `\n…[truncated; total result was ${payload.length} chars / ${rows.length} rows]`;
      }

      return payload;
    } catch (e) {
      return `Tool error: ${e instanceof Error ? e.message : "unknown failure"}`;
    }
  }

  return `Tool error: unknown tool "${name}"`;
}
