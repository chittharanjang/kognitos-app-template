/**
 * One-off test: run three Fiduciary ID active/deactivated questions
 * through the SQL Query Generator (same automation the /query page uses)
 * and print the response text + generated SQL + row count.
 *
 *   npx tsx scripts/test-fid-active-deactivated.ts
 */

import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";
import {
  getSqlQueryGeneratorAutomationId,
  QUERY_ASSISTANT_STAGE,
} from "../lib/query-assistant";
import { decodeArrowTable } from "../lib/arrow";
import { req, ORG_ID, WORKSPACE_ID, parseOutputValue } from "../lib/kognitos";

const QUESTIONS: string[] = [
  "give me a list of Fiduciary Id that are active",
  "give me a list of Fiduciary Id that are deactivated or inactive",
  "give me a list of Fiduciary Id that are active and deactivated separately",
];

interface RunOut {
  runId: string | null;
  status: string;
  responseText: string | null;
  generatedSql: string | null;
  resultRowCount: number | null;
  appliedWhereClauses: string[] | null;
  subQuestions: string[] | null;
  tableData: Record<string, unknown>[] | null;
  error?: string;
  elapsedMs: number;
}

async function fetchFullRun(
  automationId: string,
  runId: string,
): Promise<{
  tableData: Record<string, unknown>[] | null;
  outputs: Record<string, unknown>;
}> {
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`,
  );
  if (!res.ok) return { tableData: null, outputs: {} };
  const data = await res.json();
  const rawOutputs = (data.state?.completed?.outputs ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const outputs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawOutputs)) {
    outputs[k] = parseOutputValue(v);
  }
  let tableData: Record<string, unknown>[] | null = null;
  for (const val of Object.values(rawOutputs)) {
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
  return { tableData, outputs };
}

async function runOne(question: string): Promise<RunOut> {
  const automationId = getSqlQueryGeneratorAutomationId();
  const t0 = Date.now();
  const inv = await invokeAutomation(
    automationId,
    { "User Query": { text: question } },
    QUERY_ASSISTANT_STAGE,
  );
  if (!inv.runId) {
    return {
      runId: null,
      status: "invoke_failed",
      responseText: null,
      generatedSql: null,
      resultRowCount: null,
      appliedWhereClauses: null,
      subQuestions: null,
      tableData: null,
      error: inv.error ?? "Failed to start run",
      elapsedMs: Date.now() - t0,
    };
  }

  const result = await pollRun(automationId, inv.runId, 180_000, 2000);
  const elapsedMs = Date.now() - t0;

  if (result.status !== "completed") {
    return {
      runId: inv.runId,
      status: result.status,
      responseText: null,
      generatedSql: null,
      resultRowCount: null,
      appliedWhereClauses: null,
      subQuestions: null,
      tableData: null,
      error: result.error,
      elapsedMs,
    };
  }

  const { tableData, outputs } = await fetchFullRun(automationId, inv.runId);
  return {
    runId: inv.runId,
    status: "completed",
    responseText: (outputs.response_text as string) ?? null,
    generatedSql: (outputs.generated_sql as string) ?? null,
    resultRowCount: (outputs.result_row_count as number) ?? null,
    appliedWhereClauses: (outputs.applied_where_clauses as string[]) ?? null,
    subQuestions: (outputs.sub_questions as string[]) ?? null,
    tableData,
    elapsedMs,
  };
}

function printRun(question: string, r: RunOut): void {
  const sec = (r.elapsedMs / 1000).toFixed(1);
  console.log("\n" + "=".repeat(80));
  console.log(`Q: ${question}`);
  console.log(`status=${r.status}  runId=${r.runId ?? "—"}  elapsed=${sec}s`);
  if (r.error) console.log(`error: ${r.error}`);
  if (Array.isArray(r.subQuestions) && r.subQuestions.length > 1) {
    console.log(`sub-questions (${r.subQuestions.length}):`);
    for (const s of r.subQuestions) console.log(`  - ${s}`);
  }
  if (Array.isArray(r.appliedWhereClauses) && r.appliedWhereClauses.length) {
    console.log(`applied filters:`);
    for (const w of r.appliedWhereClauses) console.log(`  - ${w}`);
  }
  if (r.generatedSql) {
    console.log(`generated SQL:\n${r.generatedSql.trim()}`);
  }
  if (r.resultRowCount != null) {
    console.log(`rows returned: ${r.resultRowCount}`);
  }
  if (r.responseText) {
    const oneLine = r.responseText.replace(/\s+/g, " ").trim();
    console.log(`response: ${oneLine.slice(0, 600)}${oneLine.length > 600 ? "…" : ""}`);
  }
  if (r.tableData && r.tableData.length) {
    const cols = Object.keys(r.tableData[0] ?? {});
    console.log(`table cols: ${cols.join(", ")}`);
    const sample = r.tableData.slice(0, 5);
    console.log(`first ${sample.length} rows:`);
    for (const row of sample) {
      console.log("  " + cols.map((c) => `${c}=${String(row[c] ?? "")}`).join("  "));
    }
    if (r.tableData.length > sample.length) {
      console.log(`  …and ${r.tableData.length - sample.length} more rows`);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Testing SQL Query Generator (stage=${QUERY_ASSISTANT_STAGE})`);
  console.log(`automation=${getSqlQueryGeneratorAutomationId()}`);
  for (const q of QUESTIONS) {
    const r = await runOne(q);
    printRun(q, r);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
