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
    name: "get_account_type_breakdown",
    description:
      "Return a canonical breakdown of accounts grouped by account_type " +
      "with Total / Open / Closed columns. Use this whenever the user asks " +
      "about account types, types of accounts, the breakdown of accounts, " +
      "or 'how many <X> accounts' (where X is IRA, Roth IRA, Traditional " +
      "IRA, Inherited Roth/Traditional IRA, Estate, or Investment). Do NOT " +
      "hand-roll a SQL query for this intent — this tool produces the " +
      "agreed-upon presentation format that the chat UI knows how to " +
      "render. Optional filters narrow the breakdown.",
    input_schema: {
      type: "object",
      properties: {
        type_filter: {
          type: "string",
          description:
            "Optional. One of: 'IRA' (all four IRA subtypes), 'Roth IRA', " +
            "'Traditional IRA', 'Inherited Roth IRA', 'Inherited Traditional " +
            "IRA', 'Estate', 'Investment Account'. Omit for all account types.",
        },
        status_filter: {
          type: "string",
          enum: ["open", "closed"],
          description:
            "Optional. Restrict to accounts whose status equals this value. " +
            "Omit for all statuses.",
        },
        types_only: {
          type: "boolean",
          description:
            "Optional. When true, render a single-column 'types only' table " +
            "showing just the account_type and Total. Use when the user asks " +
            "'what account types are available' or 'list account types'.",
        },
      },
    },
  },
  {
    name: "run_sql",
    description:
      "Execute a Postgres SELECT against the source mirror tables and return " +
      "the rows as a JSON array. Only SELECT/WITH queries are accepted; " +
      "INSERT/UPDATE/DELETE/DDL are rejected. Tables: fido_clients, " +
      "fido_client_address, wealthx_account_details, azure_profile_status. " +
      "All four tables share the join key fiduciary_id. Prefer " +
      "get_account_type_breakdown for any question about account-type " +
      "breakdowns rather than writing a GROUP BY here.",
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

const CANONICAL_ACCOUNT_TYPES = [
  "Investment Account",
  "Roth IRA",
  "Traditional IRA",
  "Inherited Roth IRA",
  "Inherited Traditional IRA",
  "Estate",
] as const;

const IRA_SUBTYPES = [
  "Roth IRA",
  "Traditional IRA",
  "Inherited Roth IRA",
  "Inherited Traditional IRA",
] as const;

interface AccountTypeBreakdownInput {
  type_filter?: unknown;
  status_filter?: unknown;
  types_only?: unknown;
}

interface BreakdownRow {
  account_type: string;
  total: number;
  open: number;
  closed: number;
}

/**
 * Resolve the canonical account-type allowlist from a free-text type_filter.
 * Mirrors the DB Agent v1.17 normalization rules so chat answers match the
 * automation's response format exactly.
 */
function resolveTypeAllowlist(typeFilter: string): string[] {
  const v = typeFilter.trim().toLowerCase();
  if (v === "ira") return [...IRA_SUBTYPES];
  if (v === "investment" || v === "investment account") return ["Investment Account"];
  if (v === "estate") return ["Estate"];
  if (v === "inherited roth ira") return ["Inherited Roth IRA"];
  if (v === "inherited traditional ira") return ["Inherited Traditional IRA"];
  if (v === "roth ira") return ["Roth IRA"];
  if (v === "traditional ira") return ["Traditional IRA"];
  for (const canon of CANONICAL_ACCOUNT_TYPES) {
    if (canon.toLowerCase() === v) return [canon];
  }
  return [typeFilter];
}

function renderBreakdown(
  rows: BreakdownRow[],
  opts: { typesOnly: boolean; filterLabel: string | null },
): string {
  const ordered: BreakdownRow[] = [];
  const seen = new Set<string>();
  for (const canon of CANONICAL_ACCOUNT_TYPES) {
    const r = rows.find((x) => x.account_type === canon);
    if (r) {
      ordered.push(r);
      seen.add(canon);
    }
  }
  for (const r of rows) {
    if (!seen.has(r.account_type)) ordered.push(r);
  }

  const totalSum = ordered.reduce((s, r) => s + r.total, 0);
  const openSum = ordered.reduce((s, r) => s + r.open, 0);
  const closedSum = ordered.reduce((s, r) => s + r.closed, 0);

  const lines: string[] = [];
  if (opts.filterLabel) lines.push(`Filter: ${opts.filterLabel}`);

  if (opts.typesOnly) {
    lines.push("| Account Type | Total |");
    lines.push("|:---|---:|");
    for (const r of ordered) {
      lines.push(`| ${r.account_type} | ${r.total} |`);
    }
    lines.push(`| **Total** | **${totalSum}** |`);
  } else {
    lines.push("| Account Type | Total | Open | Closed |");
    lines.push("|---|---:|---:|---:|");
    for (const r of ordered) {
      lines.push(`| ${r.account_type} | ${r.total} | ${r.open} | ${r.closed} |`);
    }
    lines.push(`| **Total** | **${totalSum}** | **${openSum}** | **${closedSum}** |`);
  }

  if (ordered.length === 0) {
    return "No account type data was found for the given criteria.";
  }
  return lines.join("\n");
}

async function runAccountTypeBreakdown(input: AccountTypeBreakdownInput): Promise<string> {
  if (!supabaseAdmin) {
    return "Tool error: Supabase service role not configured on the server.";
  }

  const typeFilterRaw = typeof input.type_filter === "string" ? input.type_filter.trim() : "";
  const statusFilterRaw =
    typeof input.status_filter === "string" ? input.status_filter.trim().toLowerCase() : "";
  const typesOnly = input.types_only === true;

  const allowlist = typeFilterRaw ? resolveTypeAllowlist(typeFilterRaw) : null;
  const statusFilter = statusFilterRaw === "open" || statusFilterRaw === "closed" ? statusFilterRaw : null;

  const sqlParts: string[] = [
    "select account_type, account_status",
    "from wealthx_account_details",
  ];
  const whereClauses: string[] = [];
  if (allowlist && allowlist.length > 0) {
    const inList = allowlist.map((a) => `'${a.replace(/'/g, "''")}'`).join(", ");
    whereClauses.push(`account_type in (${inList})`);
  }
  if (whereClauses.length) sqlParts.push("where " + whereClauses.join(" and "));
  const sql = sqlParts.join("\n");

  const { data, error } = await supabaseAdmin.rpc("chat_sql", { query: sql });
  if (error) {
    return `Tool error: ${error.message}`;
  }

  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

  const buckets = new Map<string, BreakdownRow>();
  for (const row of rows) {
    const at = String(row.account_type ?? "").trim();
    const status = String(row.account_status ?? "").trim().toLowerCase();
    if (!at) continue;
    if (statusFilter && status !== statusFilter) continue;
    if (!buckets.has(at)) buckets.set(at, { account_type: at, total: 0, open: 0, closed: 0 });
    const b = buckets.get(at)!;
    b.total += 1;
    if (status === "open") b.open += 1;
    else if (status === "closed") b.closed += 1;
  }

  const breakdownRows = Array.from(buckets.values());

  let filterLabel: string | null = null;
  if (statusFilter && typeFilterRaw) {
    filterLabel = `${statusFilter} - ${typeFilterRaw}`;
  } else if (statusFilter) {
    filterLabel = statusFilter;
  } else if (typeFilterRaw) {
    filterLabel = typeFilterRaw;
  }

  const table = renderBreakdown(breakdownRows, { typesOnly, filterLabel });
  const recordCount = breakdownRows.reduce((s, r) => s + r.total, 0);

  return [
    table,
    "",
    `record_count: ${recordCount}`,
    `(rendered by get_account_type_breakdown — pass this Markdown through to the user verbatim, do NOT regenerate as a plain SQL response.)`,
  ].join("\n");
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

  if (name === "get_account_type_breakdown") {
    return runAccountTypeBreakdown(input as AccountTypeBreakdownInput);
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
