/**
 * Batch-run every tagged question in scripts/db-agent-test-questions.txt
 * against the running DB Agent, hitting the same Next.js API routes the UI
 * uses (POST /api/ama-agent, GET /api/ama-agent/[runId]).
 *
 * Usage:
 *   npx tsx scripts/run-db-agent-tests.ts                      # all 100
 *   npx tsx scripts/run-db-agent-tests.ts --tag YN             # one category
 *   npx tsx scripts/run-db-agent-tests.ts --tag YN,DSI         # several categories
 *   npx tsx scripts/run-db-agent-tests.ts --limit 10           # first 10
 *   npx tsx scripts/run-db-agent-tests.ts --concurrency 3      # change concurrency (default 5)
 *   npx tsx scripts/run-db-agent-tests.ts --base http://...    # override base URL
 *
 * Outputs:
 *   - Live progress to stdout
 *   - scripts/output/db-agent-test-results.json   (full structured results)
 *   - scripts/output/db-agent-test-report.md      (human-readable report)
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  base: string;
  concurrency: number;
  tags: string[] | null;
  limit: number | null;
  pollIntervalMs: number;
  pollTimeoutMs: number;
};

type TestCase = {
  tag: string;
  category: string;
  question: string;
};

type ApiResult = {
  status: string;
  runId: string;
  responseText: string | null;
  queryType: string | null;
  recordCount: number | string | null;
  databasesQueried: string[] | string | null;
  generatedSql: string | null;
  subQuestions: string[] | null;
  csvData: string | null;
  tableData: Record<string, unknown>[] | null;
  error?: string;
};

type CaseResult = TestCase & {
  status: "completed" | "failed" | "awaiting_guidance" | "timeout" | "error";
  runId: string | null;
  elapsedMs: number;
  queryType: string | null;
  recordCount: number | string | null;
  databasesQueried: string;
  hasCsv: boolean;
  hasGeneratedSql: boolean;
  subQuestionCount: number;
  responseText: string | null;
  responseTextSnippet: string;
  tableData: Record<string, unknown>[] | null;
  tableRowCount: number;
  error: string | null;
};

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const args: Args = {
    base: "http://localhost:4001",
    concurrency: 5,
    tags: null,
    limit: null,
    pollIntervalMs: 2000,
    pollTimeoutMs: 180_000,
  };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const v = a[i + 1];
    if (k === "--base" && v) { args.base = v; i++; }
    else if (k === "--concurrency" && v) { args.concurrency = Number(v); i++; }
    else if (k === "--tag" && v) { args.tags = v.split(",").map((s) => s.trim().toUpperCase()); i++; }
    else if (k === "--limit" && v) { args.limit = Number(v); i++; }
    else if (k === "--poll-interval" && v) { args.pollIntervalMs = Number(v); i++; }
    else if (k === "--poll-timeout" && v) { args.pollTimeoutMs = Number(v); i++; }
  }
  return args;
}

function categoryFor(tag: string): string {
  const m = tag.match(/^([A-Z]+)/);
  return m ? m[1] : tag;
}

async function loadTestCases(filePath: string): Promise<TestCase[]> {
  const raw = await readFile(filePath, "utf8");
  const cases: TestCase[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!m) continue;
    const tag = m[1].trim();
    const question = m[2].trim();
    cases.push({ tag, question, category: categoryFor(tag) });
  }
  return cases;
}

async function startRun(base: string, query: string): Promise<{ runId?: string; error?: string }> {
  const res = await fetch(`${base}/api/ama-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  let body: { runId?: string; error?: string } = {};
  try {
    body = (await res.json()) as { runId?: string; error?: string };
  } catch {
    return { error: `non-JSON response, status=${res.status}` };
  }
  if (!res.ok || !body.runId) {
    return { error: body.error ?? `HTTP ${res.status}` };
  }
  return { runId: body.runId };
}

async function pollRun(base: string, runId: string, intervalMs: number, timeoutMs: number): Promise<ApiResult & { _timedOut?: boolean }> {
  const start = Date.now();
  while (true) {
    if (Date.now() - start > timeoutMs) {
      return {
        status: "timeout",
        runId,
        responseText: null,
        queryType: null,
        recordCount: null,
        databasesQueried: null,
        generatedSql: null,
        subQuestions: null,
        csvData: null,
        tableData: null,
        _timedOut: true,
      };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    let res: Response;
    try {
      res = await fetch(`${base}/api/ama-agent/${runId}`);
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const data = (await res.json()) as ApiResult;
    if (data.status === "completed" || data.status === "failed" || data.status === "awaiting_guidance") {
      return data;
    }
  }
}

async function runOne(base: string, c: TestCase, intervalMs: number, timeoutMs: number): Promise<CaseResult> {
  const t0 = Date.now();
  const startRes = await startRun(base, c.question);
  if (!startRes.runId) {
    return {
      ...c,
      status: "error",
      runId: null,
      elapsedMs: Date.now() - t0,
      queryType: null,
      recordCount: null,
      databasesQueried: "",
      hasCsv: false,
      hasGeneratedSql: false,
      subQuestionCount: 0,
      responseTextSnippet: "",
      tableRowCount: 0,
      error: startRes.error ?? "unknown error starting run",
    };
  }
  const polled = await pollRun(base, startRes.runId, intervalMs, timeoutMs);
  const elapsedMs = Date.now() - t0;
  const dbs = Array.isArray(polled.databasesQueried)
    ? polled.databasesQueried.join(", ")
    : (polled.databasesQueried ?? "");
  const fullText = polled.responseText ?? null;
  const snippet = (fullText ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
  const tableData = Array.isArray(polled.tableData) ? polled.tableData : null;
  const tableRows = tableData?.length ?? 0;
  const status: CaseResult["status"] =
    polled.status === "completed" ? "completed"
    : polled.status === "failed" ? "failed"
    : polled.status === "awaiting_guidance" ? "awaiting_guidance"
    : "timeout";
  return {
    ...c,
    status,
    runId: startRes.runId,
    elapsedMs,
    queryType: polled.queryType ?? null,
    recordCount: polled.recordCount ?? null,
    databasesQueried: dbs,
    hasCsv: typeof polled.csvData === "string" && polled.csvData.trim().length > 0,
    hasGeneratedSql: !!polled.generatedSql,
    subQuestionCount: Array.isArray(polled.subQuestions) ? polled.subQuestions.length : 0,
    responseText: fullText,
    responseTextSnippet: snippet,
    tableData,
    tableRowCount: tableRows,
    error: polled.error ?? null,
  };
}

async function runAllWithConcurrency(
  base: string,
  cases: TestCase[],
  concurrency: number,
  intervalMs: number,
  timeoutMs: number,
): Promise<CaseResult[]> {
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  let done = 0;
  const total = cases.length;
  async function worker(_id: number): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= cases.length) return;
      const c = cases[idx];
      const r = await runOne(base, c, intervalMs, timeoutMs);
      results[idx] = r;
      done++;
      const tag = `[${r.tag}]`.padEnd(8);
      const elapsed = `${(r.elapsedMs / 1000).toFixed(1)}s`.padStart(6);
      const statusIcon = r.status === "completed" ? "OK " : r.status === "timeout" ? "TO " : "ERR";
      const recs = r.recordCount != null ? `${String(r.recordCount).padStart(3)} rec` : "       ";
      const dbs = r.databasesQueried ? r.databasesQueried.padEnd(28) : "".padEnd(28);
      const tail = r.responseTextSnippet ? r.responseTextSnippet.slice(0, 80) : (r.error ?? "");
      console.log(`  ${String(done).padStart(3)}/${total} ${statusIcon} ${tag} ${elapsed} ${recs} ${dbs} ${tail}`);
    }
  }
  const workers = Array.from({ length: concurrency }, (_, i) => worker(i));
  await Promise.all(workers);
  return results;
}

function summarize(results: CaseResult[]): {
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  errored: number;
  avgElapsedSec: number;
  byCategory: Record<string, { total: number; passed: number; failed: number; avgSec: number }>;
} {
  const total = results.length;
  let passed = 0, failed = 0, timedOut = 0, errored = 0;
  let elapsedSum = 0;
  const byCat: Record<string, { total: number; passed: number; failed: number; sec: number }> = {};
  for (const r of results) {
    elapsedSum += r.elapsedMs;
    if (r.status === "completed") passed++;
    else if (r.status === "failed" || r.status === "awaiting_guidance") failed++;
    else if (r.status === "timeout") timedOut++;
    else errored++;
    const c = r.category;
    if (!byCat[c]) byCat[c] = { total: 0, passed: 0, failed: 0, sec: 0 };
    byCat[c].total++;
    if (r.status === "completed") byCat[c].passed++;
    else byCat[c].failed++;
    byCat[c].sec += r.elapsedMs / 1000;
  }
  const byCategory: Record<string, { total: number; passed: number; failed: number; avgSec: number }> = {};
  for (const [k, v] of Object.entries(byCat)) {
    byCategory[k] = { total: v.total, passed: v.passed, failed: v.failed, avgSec: v.sec / v.total };
  }
  return {
    total,
    passed,
    failed,
    timedOut,
    errored,
    avgElapsedSec: total ? elapsedSum / total / 1000 : 0,
    byCategory,
  };
}

function buildMarkdownReport(results: CaseResult[], args: Args): string {
  const s = summarize(results);
  const lines: string[] = [];
  lines.push("# DB Agent Test Run");
  lines.push("");
  lines.push(`- Endpoint: \`${args.base}/api/ama-agent\` (same routes the UI calls)`);
  lines.push(`- Concurrency: ${args.concurrency}`);
  lines.push(`- Total: ${s.total}  •  Passed: ${s.passed}  •  Failed: ${s.failed}  •  Timed out: ${s.timedOut}  •  Errored: ${s.errored}`);
  lines.push(`- Avg elapsed: ${s.avgElapsedSec.toFixed(1)}s`);
  lines.push("");
  lines.push("## Pass/fail by category");
  lines.push("");
  lines.push("| Category | Passed | Failed | Total | Pass % | Avg s |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  const cats = Object.keys(s.byCategory).sort();
  for (const c of cats) {
    const v = s.byCategory[c];
    const pct = v.total ? (100 * v.passed / v.total).toFixed(0) : "—";
    lines.push(`| ${c} | ${v.passed} | ${v.failed} | ${v.total} | ${pct}% | ${v.avgSec.toFixed(1)} |`);
  }
  lines.push("");
  lines.push("## Per-question results");
  lines.push("");
  lines.push("| Tag | Status | s | Type | Records | DBs | CSV | SQL | Sub-Q | Response snippet |");
  lines.push("|---|---|---:|---|---:|---|:---:|:---:|---:|---|");
  for (const r of results) {
    const sec = (r.elapsedMs / 1000).toFixed(1);
    const recs = r.recordCount == null ? "—" : String(r.recordCount);
    const csv = r.hasCsv ? "✓" : "—";
    const sql = r.hasGeneratedSql ? "✓" : "—";
    const subq = r.subQuestionCount > 1 ? String(r.subQuestionCount) : "—";
    const snippet = (r.responseTextSnippet || r.error || "").replace(/\|/g, "\\|").slice(0, 220);
    lines.push(
      `| ${r.tag} | ${r.status} | ${sec} | ${r.queryType ?? "—"} | ${recs} | ${r.databasesQueried || "—"} | ${csv} | ${sql} | ${subq} | ${snippet} |`,
    );
  }
  lines.push("");
  const failures = results.filter((r) => r.status !== "completed");
  if (failures.length) {
    lines.push("## Failures / timeouts / errors");
    lines.push("");
    for (const r of failures) {
      lines.push(`- **[${r.tag}]** (${r.status}, ${(r.elapsedMs / 1000).toFixed(1)}s): ${r.question}`);
      if (r.error) lines.push(`  - error: ${r.error}`);
      if (r.runId) lines.push(`  - runId: \`${r.runId}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const fileAbs = path.resolve(process.cwd(), "scripts/db-agent-test-questions.txt");
  let cases = await loadTestCases(fileAbs);
  if (args.tags) {
    const tagSet = new Set(args.tags);
    cases = cases.filter((c) => tagSet.has(c.category));
  }
  if (args.limit != null) {
    cases = cases.slice(0, args.limit);
  }

  console.log(`DB Agent batch test`);
  console.log(`  base:        ${args.base}`);
  console.log(`  concurrency: ${args.concurrency}`);
  console.log(`  cases:       ${cases.length}`);
  if (args.tags) console.log(`  tags:        ${args.tags.join(", ")}`);
  console.log("");
  console.log(`  ###/total RES [TAG]    elapsed  recs   dbs                          response`);
  console.log("");

  const t0 = Date.now();
  const results = await runAllWithConcurrency(
    args.base,
    cases,
    args.concurrency,
    args.pollIntervalMs,
    args.pollTimeoutMs,
  );
  const wallSec = (Date.now() - t0) / 1000;

  const summary = summarize(results);
  console.log("");
  console.log(`Done in ${wallSec.toFixed(1)}s wall  •  ${summary.passed}/${summary.total} passed  •  failed=${summary.failed}  •  timeout=${summary.timedOut}  •  err=${summary.errored}`);

  const outDir = path.resolve(process.cwd(), "scripts/output");
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "db-agent-test-results.json");
  const mdPath = path.join(outDir, "db-agent-test-report.md");
  await writeFile(jsonPath, JSON.stringify({ args, summary, results, wallSec }, null, 2));
  await writeFile(mdPath, buildMarkdownReport(results, args));
  console.log(`\nReport: ${mdPath}`);
  console.log(`JSON:   ${jsonPath}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
