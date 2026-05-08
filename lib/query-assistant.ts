import { decodeArrowTable } from "@/lib/arrow";
import {
  invokeAutomation,
  kognitosRunUrl,
  ORG_ID,
  parseOutputValue,
  req,
  WORKSPACE_ID,
} from "@/lib/kognitos";

/**
 * Kognitos automation: **SQL Query Generator — Updating Version**.
 * Set `KOGNITOS_SQL_QUERY_GENERATOR_ID` in `.env` to override.
 */
const DEFAULT_SQL_QUERY_GENERATOR_ID = "HKk8dAUxXhsVqeRC4fvaT";

export function getSqlQueryGeneratorAutomationId(): string {
  return (process.env.KOGNITOS_SQL_QUERY_GENERATOR_ID || DEFAULT_SQL_QUERY_GENERATOR_ID).trim();
}

/** Draft stage — matches manual Query page behavior. */
export const QUERY_ASSISTANT_STAGE = "AUTOMATION_STAGE_DRAFT" as const;

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_POLL_MS = 2_000;

function formatResultMarkdown(payload: {
  runId: string;
  responseText: string | null;
  generatedSql: string | null;
  resultRowCount: number | null;
  appliedWhereClauses: string[] | null;
  subQuestions: string[] | null;
  tableData: Record<string, unknown>[] | null;
}): string {
  const parts: string[] = [];
  if (payload.responseText) {
    parts.push(payload.responseText);
  } else {
    parts.push("_No response text in automation output._");
  }
  if (Array.isArray(payload.subQuestions) && payload.subQuestions.length) {
    parts.push(
      "**Sub-questions processed:**\n" + payload.subQuestions.map((q) => `- ${String(q)}`).join("\n")
    );
  }
  if (Array.isArray(payload.appliedWhereClauses) && payload.appliedWhereClauses.length) {
    parts.push(
      "**Applied filters (WHERE):**\n" + payload.appliedWhereClauses.map((w) => `- \`${String(w)}\``).join("\n")
    );
  }
  if (payload.resultRowCount != null) {
    parts.push(`**Rows returned:** ${payload.resultRowCount}`);
  }
  if (payload.generatedSql) {
    parts.push("**Generated SQL**\n```sql\n" + payload.generatedSql.trim() + "\n```");
  }
  if (payload.tableData && payload.tableData.length > 0) {
    const maxRows = Math.min(20, payload.tableData.length);
    const cols = Object.keys(payload.tableData[0] ?? {});
    if (cols.length) {
      const header = `| ${cols.join(" | ")} |`;
      const sep = `| ${cols.map(() => "---").join(" | ")} |`;
      const lines = [header, sep];
      for (let i = 0; i < maxRows; i++) {
        const row = payload.tableData[i];
        lines.push(`| ${cols.map((c) => String(row[c] ?? "")).join(" | ")} |`);
      }
      if (payload.tableData.length > maxRows) {
        parts.push(
          `**Result sample** (first ${maxRows} of ${payload.tableData.length} rows)\n\n` + lines.join("\n")
        );
      } else {
        parts.push("**Result data**\n\n" + lines.join("\n"));
      }
    }
  }
  return parts.join("\n\n");
}

export type QueryAssistantRunResult =
  | { ok: true; runId: string; content: string }
  | { ok: false; runId?: string; error: string };

/**
 * Invokes **SQL Query Generator** with the same contract as the Query page: input field
 * `User Query` = full chat line. Polls the run until completed, failed, guidance, or timeout.
 */
export async function runQueryAssistant(
  userQuery: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<QueryAssistantRunResult> {
  const q = userQuery.trim();
  if (!q) {
    return { ok: false, error: "Empty question" };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_MS;
  const automationId = getSqlQueryGeneratorAutomationId();

  const { runId, error: invokeError } = await invokeAutomation(
    automationId,
    { user_query: { text: q } },
    QUERY_ASSISTANT_STAGE
  );

  if (!runId) {
    return { ok: false, error: invokeError ?? "Failed to start Query Assistant" };
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
      const outputs: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rawOutputs)) {
        outputs[key] = parseOutputValue(val as Record<string, unknown>);
      }

      let tableData: Record<string, unknown>[] | null = null;
      // Use named query_result key first (Updating Version); fall back to scanning
      // all outputs for any table (Working Version compatibility).
      const queryResultRaw = rawOutputs.query_result as Record<string, unknown> | undefined;
      const b64Direct = (queryResultRaw?.table as Record<string, Record<string, string>>)?.inline?.data;
      if (b64Direct) {
        try { tableData = decodeArrowTable(b64Direct); } catch { tableData = null; }
      } else {
        for (const val of Object.values(rawOutputs) as Array<Record<string, unknown>>) {
          const b64 = (val?.table as Record<string, Record<string, string>>)?.inline?.data;
          if (b64) {
            try { tableData = decodeArrowTable(b64); } catch { tableData = null; }
            break;
          }
        }
      }

      const content = formatResultMarkdown({
        runId,
        responseText: (outputs.response_text as string) ?? null,
        generatedSql: (outputs.generated_sql as string) ?? null,
        resultRowCount: (outputs.result_row_count as number) ?? null,
        appliedWhereClauses: (outputs.applied_where_clauses as string[]) ?? null,
        subQuestions: (outputs.sub_questions as string[]) ?? null,
        tableData,
      });
      return { ok: true, runId, content };
    }

    if (data.state?.failed) {
      return {
        ok: false,
        runId,
        error: data.state.failed.error?.description ?? "Query run failed",
      };
    }

    if (data.state?.awaiting_guidance) {
      return {
        ok: false,
        runId,
        error:
          data.state.awaiting_guidance.exception ??
          data.state.awaiting_guidance.description ??
          "Query Assistant is waiting for guidance",
      };
    }
  }

  return { ok: false, runId, error: "Query Assistant timed out — try a simpler question on the Query page." };
}

/** Chunk text for SSE (small progressive sends). */
export function chunkTextForStream(text: string, chunkSize = 400): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/* ------------------------------------------------------------------ */
/*  Per-run detail fetcher (Query app)                                */
/* ------------------------------------------------------------------ */

export interface QueryRunDetail {
  status: "completed" | "failed" | "awaiting_guidance" | "running" | "error";
  runId: string;
  stage: string | null;
  /** Automation version snapshot at the time of the run (e.g. "5.8"). */
  stageVersion: string | null;
  question: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  kognitosUrl: string;
  responseText?: string | null;
  generatedSql?: string | null;
  questionCount?: number | null;
  subQuestions?: string[] | null;
  subQueryCount?: number | null;
  resultRowCount?: number | null;
  /** Distinct fiduciary_id values in tableData. Null when column not present. */
  uniqueClientCount?: number | null;
  /** Distinct account_number values in tableData. Null when column not present. */
  uniqueAccountCount?: number | null;
  appliedWhereClauses?: string[] | null;
  tableData?: Record<string, unknown>[] | null;
  error?: string | null;
  state?: string | null;
  /** True when the automation successfully emailed the result (Updating Version). */
  emailSent?: boolean | null;
}

/**
 * Count distinct fiduciary_id and account_number values from decoded tableData.
 * Column names are matched case-insensitively to handle both Snowflake UPPER
 * and normalised lower-case column names from different automation versions.
 *
 * When `rows` is null (automation returned scalar outputs, not a table), falls
 * back to parsing `responseText` for FID-like tokens (e.g. "F1006 has 2
 * account(s)") to derive uniqueClientCount and uniqueAccountCount from the
 * human-readable summary. Only returns counts when they would differ from
 * `resultRowCount` — i.e. when duplicates exist and the summary adds value.
 */
function computeUniqueCounts(
  rows: Record<string, unknown>[] | null,
  responseText?: string | null,
  resultRowCount?: number | null,
): {
  uniqueClientCount: number | null;
  uniqueAccountCount: number | null;
} {
  // --- Path 1: table data available ---
  if (rows && rows.length > 0) {
    const cols = Object.keys(rows[0] ?? {});
    const fidCol = cols.find((c) => c.toLowerCase() === "fiduciary_id");
    const accCol = cols.find(
      (c) => c.toLowerCase() === "account_number" || c.toLowerCase() === "account_id",
    );
    const uniqueClientCount = fidCol
      ? new Set(rows.map((r) => String(r[fidCol] ?? "")).filter(Boolean)).size
      : null;
    const uniqueAccountCount = accCol
      ? new Set(rows.map((r) => String(r[accCol] ?? "")).filter(Boolean)).size
      : null;
    return { uniqueClientCount, uniqueAccountCount };
  }

  // --- Path 2: no table — parse response text ---
  // Matches FID tokens like F1006, F1008, A12345, etc. (letter + 3-6 digits)
  if (!responseText) return { uniqueClientCount: null, uniqueAccountCount: null };

  const fidTokens = responseText.match(/\b[A-Z]\d{3,6}\b/g) ?? [];
  const uniqueFids = new Set(fidTokens);
  if (uniqueFids.size === 0) return { uniqueClientCount: null, uniqueAccountCount: null };

  // Only surface the count when it actually differs from the total row count
  // (otherwise there are no duplicates and the stat adds no value).
  const uniqueClientCount =
    resultRowCount != null && uniqueFids.size !== resultRowCount ? uniqueFids.size : null;

  // Parse "F1006 has 2 account(s)" → sum of accounts = total row count cross-check.
  // Surface as uniqueAccountCount only when total accounts != result rows.
  const accountMatches = [...responseText.matchAll(/\b[A-Z]\d{3,6}\b\s+has\s+(\d+)\s+account/gi)];
  const totalAccountsFromText = accountMatches.reduce(
    (sum, m) => sum + parseInt(m[1] ?? "0", 10),
    0,
  );
  const uniqueAccountCount =
    accountMatches.length > 0 &&
    resultRowCount != null &&
    totalAccountsFromText === resultRowCount &&
    uniqueFids.size !== resultRowCount
      ? uniqueFids.size  // each client has ≥1 account; unique accounts ≥ unique clients
      : null;

  return { uniqueClientCount, uniqueAccountCount };
}

interface RawQueryRun {
  name?: string;
  create_time?: string;
  update_time?: string;
  stage?: string;
  stage_version?: string;
  user_inputs?: Record<string, Record<string, unknown>>;
  state?: {
    completed?: { outputs?: Record<string, unknown> };
    failed?: { error?: { description?: string } };
    awaiting_guidance?: { exception?: string; description?: string };
    [key: string]: unknown;
  };
}

/**
 * Fetch and parse a single SQL Query Generator run from Kognitos. Mirrors the
 * shape of `fetchAmaAgentRunDetail` in lib/ama-agent.ts so the Query app's
 * compare endpoint can reuse the same UI components.
 */
export async function fetchQueryRunDetail(
  runId: string,
): Promise<QueryRunDetail> {
  const automationId = getSqlQueryGeneratorAutomationId();
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`,
  );
  if (!res.ok) {
    return {
      status: "error",
      runId,
      stage: null,
      stageVersion: null,
      question: null,
      createdAt: null,
      updatedAt: null,
      kognitosUrl: kognitosRunUrl(runId, automationId),
      error: `Failed to fetch run: ${res.status}`,
    };
  }
  const data = (await res.json()) as RawQueryRun;

  // Support both old "User Query" key (pre-fix) and current "user_query" key.
  const userQuery =
    data.user_inputs?.["user_query"] ?? data.user_inputs?.["User Query"];
  const question =
    userQuery && typeof userQuery.text === "string"
      ? (userQuery.text as string)
      : null;

  const baseMeta = {
    runId,
    stage: data.stage ?? null,
    stageVersion: data.stage_version ?? null,
    question,
    createdAt: data.create_time ?? null,
    updatedAt: data.update_time ?? null,
    kognitosUrl: kognitosRunUrl(runId, automationId),
  } as const;

  if (data.state?.completed) {
    const rawOutputs = (data.state.completed.outputs ?? {}) as Record<
      string,
      unknown
    >;
    const outputs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawOutputs)) {
      outputs[key] = parseOutputValue(val as Record<string, unknown>);
    }

    let tableData: Record<string, unknown>[] | null = null;
    // Use named query_result key first (Updating Version); fall back to scanning
    // all outputs for any table (Working Version compatibility).
    const queryResultRaw = rawOutputs.query_result as Record<string, unknown> | undefined;
    const b64Direct = (queryResultRaw?.table as Record<string, Record<string, string>>)?.inline?.data;
    if (b64Direct) {
      try { tableData = decodeArrowTable(b64Direct); } catch { tableData = null; }
    } else {
      for (const val of Object.values(rawOutputs) as Array<Record<string, unknown>>) {
        const b64 = (val?.table as Record<string, Record<string, string>>)?.inline?.data;
        if (b64) {
          try { tableData = decodeArrowTable(b64); } catch { tableData = null; }
          break;
        }
      }
    }

    const responseTextVal = (outputs.response_text as string | null) ?? null;
    const resultRowCountVal = (outputs.result_row_count as number | null) ?? null;
    const { uniqueClientCount, uniqueAccountCount } = computeUniqueCounts(
      tableData,
      responseTextVal,
      resultRowCountVal,
    );

    return {
      status: "completed",
      ...baseMeta,
      responseText: responseTextVal,
      generatedSql: (outputs.generated_sql as string | null) ?? null,
      questionCount: (outputs.question_count as number | null) ?? null,
      subQuestions: (outputs.sub_questions as string[] | null) ?? null,
      subQueryCount: (outputs.sub_query_count as number | null) ?? null,
      resultRowCount: resultRowCountVal,
      uniqueClientCount,
      uniqueAccountCount,
      appliedWhereClauses:
        (outputs.applied_where_clauses as string[] | null) ?? null,
      tableData,
      emailSent: typeof outputs.email_sent === "boolean" ? outputs.email_sent : null,
    };
  }
  if (data.state?.failed) {
    return {
      status: "failed",
      ...baseMeta,
      error: data.state.failed.error?.description ?? "Run failed",
    };
  }
  if (data.state?.awaiting_guidance) {
    return {
      status: "awaiting_guidance",
      ...baseMeta,
      error:
        data.state.awaiting_guidance.exception ??
        data.state.awaiting_guidance.description ??
        "Awaiting guidance",
    };
  }
  const currentState = Object.keys(data.state ?? {})[0] ?? "unknown";
  return { status: "running", ...baseMeta, state: currentState };
}
