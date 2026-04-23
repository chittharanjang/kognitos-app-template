import { decodeArrowTable } from "@/lib/arrow";
import { invokeAutomation, ORG_ID, parseOutputValue, req, WORKSPACE_ID } from "@/lib/kognitos";

/**
 * Kognitos automation: **SQL Query Generator** (natural language → SQL, same as the Query page).
 * Set `KOGNITOS_SQL_QUERY_GENERATOR_ID` in `.env` if this differs in your workspace.
 */
const DEFAULT_SQL_QUERY_GENERATOR_ID = "7NMPU5tknPoocOFoLfRss";

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
    { "User Query": { text: q } },
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
      for (const val of Object.values(rawOutputs) as Array<Record<string, unknown>>) {
        const b64 = (val?.table as Record<string, Record<string, string>>)?.inline?.data;
        if (b64) {
          try {
            tableData = decodeArrowTable(b64);
          } catch {
            tableData = null;
          }
          break;
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
