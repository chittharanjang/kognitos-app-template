/**
 * One-off batch runner for the DB Agent.
 *
 * Pages through the Kognitos run history for the DB Agent automation,
 * extracts every unique `User Query` text, and fires them all back through
 * the automation in parallel with the configured concurrency.
 *
 * This bypasses the Supabase test-question library so it works even before
 * supabase/migrations/00000000000005_db_agent_test_questions.sql has been
 * applied. Once the migration is in, the in-app "Test" button on
 * /ama-agent/runs covers the same workflow.
 *
 * Usage:
 *   npx tsx scripts/batch-invoke-history-questions.ts                     # 25 concurrency
 *   npx tsx scripts/batch-invoke-history-questions.ts --concurrency 10    # override
 *   npx tsx scripts/batch-invoke-history-questions.ts --max-runs 1000     # cap history scan
 *   npx tsx scripts/batch-invoke-history-questions.ts --dry-run           # list, don't invoke
 */

import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID, invokeAutomation } from "../lib/kognitos";
import { getAmaAgentAutomationId } from "../lib/ama-agent";

// Match the in-app Test button: always exercise the production stage so the
// batch results reflect what real users would see, regardless of any
// in-progress draft work on the DB Agent automation.
const TEST_BATCH_STAGE = "AUTOMATION_STAGE_PUBLISHED" as const;

interface Args {
  concurrency: number;
  maxRuns: number;
  pageSize: number;
  dryRun: boolean;
}

interface RawRun {
  name: string;
  create_time?: string;
  user_inputs?: Record<string, Record<string, unknown>>;
}

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const args: Args = {
    concurrency: 25,
    maxRuns: 5000,
    pageSize: 100,
    dryRun: false,
  };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    const v = a[i + 1];
    if (k === "--concurrency" && v) {
      args.concurrency = Number(v);
      i++;
    } else if (k === "--max-runs" && v) {
      args.maxRuns = Number(v);
      i++;
    } else if (k === "--page-size" && v) {
      args.pageSize = Number(v);
      i++;
    } else if (k === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function extractQuestion(run: RawRun): string | null {
  const uq = run.user_inputs?.["User Query"];
  if (!uq) return null;
  const text = uq.text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  return trimmed || null;
}

async function fetchUniqueQuestions(args: Args, automationId: string): Promise<string[]> {
  const seen = new Set<string>();
  const ordered: string[] = [];
  let pageToken: string | null = null;
  let scanned = 0;

  while (scanned < args.maxRuns) {
    const params = new URLSearchParams();
    params.set("pageSize", String(args.pageSize));
    if (pageToken) params.set("pageToken", pageToken);

    const res = await req(
      `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs?${params.toString()}`,
    );
    if (!res.ok) {
      throw new Error(`Failed to list runs: HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { runs?: RawRun[]; next_page_token?: string | null };
    const runs = data.runs ?? [];
    if (runs.length === 0) break;

    for (const r of runs) {
      scanned += 1;
      const q = extractQuestion(r);
      if (!q) continue;
      if (!seen.has(q)) {
        seen.add(q);
        ordered.push(q);
      }
    }

    pageToken = data.next_page_token ?? null;
    if (!pageToken) break;
  }

  console.log(`  scanned ${scanned} runs, found ${ordered.length} unique questions`);
  return ordered;
}

interface InvokeResult {
  question: string;
  runId: string | null;
  error: string | null;
  elapsedMs: number;
}

async function invokeOne(automationId: string, question: string): Promise<InvokeResult> {
  const t0 = Date.now();
  const inputs = {
    "User Query": { text: question },
    "Requester Email": { text: "ama-batch-test@kognitos-demo.local" },
  };
  const { runId, error } = await invokeAutomation(automationId, inputs, TEST_BATCH_STAGE);
  return {
    question,
    runId: runId ?? null,
    error: error ?? null,
    elapsedMs: Date.now() - t0,
  };
}

async function runBatch(
  questions: string[],
  concurrency: number,
  automationId: string,
): Promise<InvokeResult[]> {
  const results: InvokeResult[] = new Array(questions.length);
  let next = 0;
  let done = 0;
  const total = questions.length;

  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= total) return;
      const q = questions[idx];
      const r = await invokeOne(automationId, q);
      results[idx] = r;
      done += 1;
      const status = r.runId ? "OK " : "ERR";
      const tag = `${String(done).padStart(3)}/${total}`;
      const elapsed = `${(r.elapsedMs / 1000).toFixed(1)}s`.padStart(5);
      const tail = r.runId ? `runId=${r.runId}` : `error=${r.error}`;
      const snippet = q.replace(/\s+/g, " ").slice(0, 70);
      console.log(`  ${tag} ${status} ${elapsed} ${snippet.padEnd(72)} ${tail}`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker()),
  );
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const automationId = getAmaAgentAutomationId();

  console.log(`DB Agent batch invoke (history-driven)`);
  console.log(`  automationId: ${automationId}`);
  console.log(`  stage:        ${TEST_BATCH_STAGE}`);
  console.log(`  concurrency:  ${args.concurrency}`);
  console.log(`  maxRuns:      ${args.maxRuns}`);
  console.log(`  pageSize:     ${args.pageSize}`);
  console.log(`  dryRun:       ${args.dryRun}`);
  console.log("");
  console.log("Step 1/2: scanning Kognitos run history…");

  const questions = await fetchUniqueQuestions(args, automationId);

  if (args.dryRun) {
    console.log("\nDRY RUN — questions that would be invoked:");
    for (let i = 0; i < questions.length; i++) {
      console.log(`  ${String(i + 1).padStart(3)}. ${questions[i].replace(/\s+/g, " ").slice(0, 120)}`);
    }
    return;
  }

  if (questions.length === 0) {
    console.log("\nNo questions found — nothing to invoke.");
    return;
  }

  console.log(`\nStep 2/2: invoking ${questions.length} questions with concurrency ${args.concurrency}…\n`);
  const t0 = Date.now();
  const results = await runBatch(questions, args.concurrency, automationId);
  const wallSec = (Date.now() - t0) / 1000;

  const started = results.filter((r) => r.runId).length;
  const failed = results.length - started;

  console.log("");
  console.log(
    `Done in ${wallSec.toFixed(1)}s wall  •  ${started}/${results.length} started  •  ${failed} failed`,
  );

  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results) {
      if (r.runId) continue;
      console.log(`  - ${r.question.replace(/\s+/g, " ").slice(0, 100)}: ${r.error}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
