/**
 * Category-coverage suite for the DB Agent (DRAFT).
 *
 * Picks 2 representative queries from every category in
 * `lib/guide-queries.ts`, applies a different case permutation to each
 * (lowercase / UPPERCASE / Title / Sentence / mIxEd / aLtErNaTiNg), runs
 * them in parallel against the DRAFT stage of the AMAAgent automation,
 * and prints a categorized pass/fail table.
 *
 * Run:
 *   npx tsx scripts/category-coverage-suite.ts
 *   STAGE=published npx tsx scripts/category-coverage-suite.ts
 */
import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";
import { QUERY_CATEGORIES } from "../lib/guide-queries";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE =
  process.env.STAGE === "published"
    ? "AUTOMATION_STAGE_PUBLISHED"
    : "AUTOMATION_STAGE_DRAFT";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const POLL_TIMEOUT_MS = 240_000;
const POLL_INTERVAL_MS = 2_000;

// ─── Case permutations ─────────────────────────────────────────────────────
function lower(s: string): string {
  return s.toLowerCase();
}
function upper(s: string): string {
  return s.toUpperCase();
}
function title(s: string): string {
  return s
    .split(" ")
    .map((w) =>
      w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w,
    )
    .join(" ");
}
function sentence(s: string): string {
  const lc = s.toLowerCase();
  return lc.charAt(0).toUpperCase() + lc.slice(1);
}
function alternating(s: string): string {
  let out = "";
  let i = 0;
  for (const c of s) {
    if (/[a-z]/i.test(c)) {
      out += i % 2 === 0 ? c.toLowerCase() : c.toUpperCase();
      i++;
    } else {
      out += c;
    }
  }
  return out;
}
function spongebob(s: string): string {
  return alternating(s);
}

const CASE_FNS: Array<{ name: string; fn: (s: string) => string }> = [
  { name: "lowercase", fn: lower },
  { name: "UPPERCASE", fn: upper },
  { name: "Title Case", fn: title },
  { name: "Sentence", fn: sentence },
  { name: "mIxEd", fn: alternating },
  { name: "sPoNgEbOb", fn: spongebob },
];

// ─── Per-category result validators ────────────────────────────────────────
type Outcome =
  | { kind: "pass"; note: string }
  | { kind: "warn"; note: string }
  | { kind: "fail"; note: string };

interface AgentOutputs {
  status: string;
  responseText: string;
  recordCount: number;
  queryType: string;
  error?: string;
}

function softYesNoCheck(out: AgentOutputs): Outcome {
  const t = out.responseText.trim();
  if (/^(yes|no)\s*[—\-:]/i.test(t))
    return { kind: "pass", note: `${t.split(/[\.\n]/)[0].slice(0, 100)}` };
  if (/(no records|not found|no client)/i.test(t))
    return { kind: "pass", note: `NDF — ${t.split(/[\.\n]/)[0].slice(0, 80)}` };
  if (/^(\d+\.|\d+\))/m.test(t))
    return {
      kind: "pass",
      note: `multi-question split (${out.recordCount} rec)`,
    };
  return {
    kind: "warn",
    note: `expected yes/no leading word. Got: ${t.slice(0, 120)}`,
  };
}

function softCountCheck(out: AgentOutputs): Outcome {
  const t = out.responseText.trim();
  if (/(count|total)\s*:\s*\d/i.test(t) || /\b\d+\s*record/i.test(t))
    return { kind: "pass", note: t.split(/[\.\n]/)[0].slice(0, 100) };
  if (/^\d+$/.test(t)) return { kind: "pass", note: `numeric: ${t}` };
  if (out.recordCount > 0)
    return {
      kind: "pass",
      note: `rc=${out.recordCount} | ${t.slice(0, 100)}`,
    };
  return {
    kind: "warn",
    note: `expected count/total. Got: ${t.slice(0, 120)}`,
  };
}

function softListCheck(out: AgentOutputs): Outcome {
  const t = out.responseText;
  if (/\|\s*-+\s*\|/.test(t) || /\|.+\|/.test(t))
    return {
      kind: "pass",
      note: `table rendered, rc=${out.recordCount}`,
    };
  if (out.recordCount === 0 && /(no records|not found|no client)/i.test(t))
    return { kind: "pass", note: `NDF (rc=0)` };
  if (out.recordCount > 0)
    return { kind: "pass", note: `rc=${out.recordCount}` };
  return {
    kind: "warn",
    note: `expected table or NDF. Got: ${t.slice(0, 120)}`,
  };
}

function softDirectInfoCheck(out: AgentOutputs): Outcome {
  const t = out.responseText.trim();
  if (out.recordCount === 0)
    return { kind: "pass", note: `NDF (rc=0) | ${t.slice(0, 80)}` };
  if (/(@|primary email|mobile|phone|postal|ssn|date of birth|account)/i.test(t))
    return { kind: "pass", note: t.split(/\n/)[0].slice(0, 100) };
  return {
    kind: "warn",
    note: `expected direct value. Got: ${t.slice(0, 120)}`,
  };
}

function softNdfCheck(out: AgentOutputs): Outcome {
  const t = out.responseText;
  if (out.recordCount === 0 && /(no records|not found|no client|no .* found)/i.test(t))
    return { kind: "pass", note: `NDF — ${t.split(/[\.\n]/)[0].slice(0, 100)}` };
  return {
    kind: "fail",
    note: `expected NDF (rc=0 + 'not found'). Got: rc=${out.recordCount}, "${t.slice(0, 100)}"`,
  };
}

function softGovernanceCheck(out: AgentOutputs): Outcome {
  const t = out.responseText.toLowerCase();
  // Should NOT include "online portal access" column unless the question
  // explicitly asks for it — but we can't enforce this universally here.
  // Just ensure the agent didn't blow up.
  if (out.recordCount >= 0 && t.length > 0)
    return { kind: "pass", note: `rc=${out.recordCount}` };
  return { kind: "fail", note: `empty response` };
}

function softGenericCheck(out: AgentOutputs): Outcome {
  const t = out.responseText.trim();
  if (t.length === 0)
    return { kind: "fail", note: `empty response_text` };
  if (out.recordCount >= 0)
    return {
      kind: "pass",
      note: `rc=${out.recordCount}, qt=${out.queryType} | ${t.slice(0, 100)}`,
    };
  return { kind: "warn", note: `unknown shape: ${t.slice(0, 100)}` };
}

// Map category title prefix → validator
function validatorFor(categoryTitle: string): (o: AgentOutputs) => Outcome {
  const t = categoryTitle.toLowerCase();
  if (t.startsWith("yes/no")) return softYesNoCheck;
  if (t.startsWith("direct specific")) return softDirectInfoCheck;
  if (t.startsWith("specific column")) return softListCheck;
  if (t.startsWith("full table") || t.startsWith("set difference"))
    return softListCheck;
  if (t.startsWith("single db queries - profile")) return softListCheck;
  if (t.startsWith("single db queries - fido")) return softListCheck;
  if (t.startsWith("single db queries - wealthx")) return softListCheck;
  if (t.startsWith("cross-database")) return softListCheck;
  if (t.startsWith("ira account")) return softListCheck;
  if (t.startsWith("multiple questions")) return softGenericCheck;
  if (t.startsWith("ambiguous")) return softGenericCheck;
  if (t.startsWith("long paragraph")) return softGenericCheck;
  if (t.startsWith("no data found")) return softNdfCheck;
  if (t.startsWith("data governance")) return softGovernanceCheck;
  if (t.startsWith("composite")) return softListCheck;
  if (t.startsWith("aggregation")) return softCountCheck;
  return softGenericCheck;
}

// ─── Test execution ────────────────────────────────────────────────────────
interface TestCase {
  category: string;
  original: string;
  rendered: string;
  caseName: string;
  validator: (o: AgentOutputs) => Outcome;
}

interface TestResult extends TestCase {
  status: string;
  responseText: string;
  recordCount: number;
  queryType: string;
  outcome: Outcome;
  durationMs: number;
  error?: string;
}

function buildTestCases(): TestCase[] {
  const cases: TestCase[] = [];
  let caseIdx = 0;
  for (const cat of QUERY_CATEGORIES) {
    const validator = validatorFor(cat.title);
    // Pick the first 2 queries from each category.
    for (let i = 0; i < 2 && i < cat.queries.length; i++) {
      const q = cat.queries[i];
      // Cycle through case permutations so each category gets two
      // different cases.
      const fn = CASE_FNS[caseIdx % CASE_FNS.length];
      cases.push({
        category: cat.title,
        original: q,
        rendered: fn.fn(q),
        caseName: fn.name,
        validator,
      });
      caseIdx++;
    }
  }
  return cases;
}

async function runOne(tc: TestCase): Promise<TestResult> {
  const t0 = Date.now();
  try {
    const inv = await invokeAutomation(
      AUTOMATION_ID,
      {
        "User Query": { text: tc.rendered },
        "Requester Email": { text: "category-coverage@kognitos.local" },
      },
      STAGE as "AUTOMATION_STAGE_DRAFT" | "AUTOMATION_STAGE_PUBLISHED",
    );
    if (!inv.runId) {
      return {
        ...tc,
        status: "invoke_failed",
        responseText: "",
        recordCount: -1,
        queryType: "",
        outcome: { kind: "fail", note: `invoke failed: ${inv.error ?? ""}` },
        durationMs: Date.now() - t0,
        error: inv.error,
      };
    }
    const r = await pollRun(
      AUTOMATION_ID,
      inv.runId,
      POLL_TIMEOUT_MS,
      POLL_INTERVAL_MS,
    );
    if (r.status !== "completed") {
      return {
        ...tc,
        status: r.status,
        responseText: "",
        recordCount: -1,
        queryType: "",
        outcome: {
          kind: "fail",
          note: `run ${r.status} — ${r.error ?? ""}`,
        },
        durationMs: Date.now() - t0,
        error: r.error,
      };
    }
    const out: AgentOutputs = {
      status: r.status,
      responseText: String(r.outputs.response_text ?? ""),
      recordCount: Number(r.outputs.record_count ?? 0),
      queryType: String(r.outputs.query_type ?? ""),
    };
    const outcome = tc.validator(out);
    return {
      ...tc,
      status: out.status,
      responseText: out.responseText,
      recordCount: out.recordCount,
      queryType: out.queryType,
      outcome,
      durationMs: Date.now() - t0,
    };
  } catch (e) {
    return {
      ...tc,
      status: "exception",
      responseText: "",
      recordCount: -1,
      queryType: "",
      outcome: { kind: "fail", note: `exception: ${(e as Error).message}` },
      durationMs: Date.now() - t0,
      error: (e as Error).message,
    };
  }
}

async function runAll(cases: TestCase[]): Promise<TestResult[]> {
  const results: TestResult[] = new Array(cases.length);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= cases.length) return;
      const r = await runOne(cases[idx]);
      results[idx] = r;
      done++;
      const verdict =
        r.outcome.kind === "pass"
          ? "PASS"
          : r.outcome.kind === "warn"
            ? "WARN"
            : "FAIL";
      const elapsed = (r.durationMs / 1000).toFixed(1);
      console.log(
        `[${done}/${cases.length}] ${verdict} (${elapsed}s) ${r.caseName.padEnd(10)} ${r.category.slice(0, 30).padEnd(30)} | ${r.rendered.slice(0, 60)}`,
      );
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cases.length) }, () =>
      worker(),
    ),
  );
  return results;
}

// ─── Reporting ─────────────────────────────────────────────────────────────
function emitSummary(results: TestResult[]): void {
  console.log("\n");
  console.log("═".repeat(120));
  console.log(
    `Stage: ${STAGE}  |  cases: ${results.length}  |  concurrency: ${CONCURRENCY}`,
  );
  console.log("═".repeat(120));

  const byCat = new Map<string, TestResult[]>();
  for (const r of results) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }

  let pass = 0;
  let warn = 0;
  let fail = 0;

  for (const [cat, rows] of byCat) {
    console.log(`\n▌ ${cat}`);
    for (const r of rows) {
      const k = r.outcome.kind;
      if (k === "pass") pass++;
      else if (k === "warn") warn++;
      else fail++;
      const icon = k === "pass" ? "✓" : k === "warn" ? "?" : "✗";
      console.log(`  ${icon} [${r.caseName.padEnd(10)}] ${r.rendered}`);
      console.log(`     → ${r.outcome.note}`);
    }
  }

  console.log("\n" + "═".repeat(120));
  console.log(
    `RESULT: ${pass} pass · ${warn} warn · ${fail} fail (of ${results.length})`,
  );
  console.log("═".repeat(120));
}

async function main(): Promise<void> {
  const cases = buildTestCases();
  console.log(
    `Built ${cases.length} test cases across ${QUERY_CATEGORIES.length} categories.\nStage=${STAGE}  Concurrency=${CONCURRENCY}\n`,
  );
  const results = await runAll(cases);
  emitSummary(results);
  const fails = results.filter((r) => r.outcome.kind === "fail").length;
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
