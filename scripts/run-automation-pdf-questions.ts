import "dotenv/config";
import { invokeAutomation, pollRun, req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";
import { tableFromIPC, type Table } from "apache-arrow";

/**
 * Invokes the "SQL Query Generator" automation directly (NOT through chat) for
 * each of the 12 PDF questions, decodes the Arrow IPC `query_result` table,
 * and compares the result to the expected PDF answer.
 *
 * Run:  npx tsx scripts/run-automation-pdf-questions.ts
 *
 * Env requirements: KOGNITOS_TOKEN, KOGNITOS_ORG_ID, KOGNITOS_WORKSPACE_ID,
 *                   KOGNITOS_BASE_URL, KOGNITOS_AUTOMATION_ID
 */

const AUTOMATION_ID = process.env.KOGNITOS_AUTOMATION_ID;
if (!AUTOMATION_ID) {
  console.error("KOGNITOS_AUTOMATION_ID not set in env");
  process.exit(1);
}

/* ── Question definitions ─────────────────────────────────────────── */

type ExpectedKind = "list" | "counts" | "yes_no_with_list" | "yes_no" | "name_postal";

interface QuestionDef {
  id: string;
  question: string;
  expected: {
    kind: ExpectedKind;
    ids?: string[];
    counts?: Record<string, number>;
    yes?: boolean;
    accountTypes?: string[];
    firstName?: string;
    lastName?: string;
    postalCode?: string;
    note?: string;
  };
}

const QUESTIONS: QuestionDef[] = [
  {
    id: "Q1",
    question:
      "Which clients have multiple account types including both IRA and Non-IRA accounts? Return only fiduciary IDs.",
    expected: {
      kind: "list",
      ids: ["F1005", "F1006", "F1007", "F1008", "F1010", "F1012", "F1025", "F1027"],
    },
  },
  {
    id: "Q2",
    question: "Share the client details (fiduciary IDs) who have more than 2 accounts.",
    expected: {
      kind: "list",
      ids: ["F1005", "F1007", "F1008", "F1012", "F1027"],
    },
  },
  {
    id: "Q3",
    question:
      "Which clients have multiple account types including both IRA and Non-IRA accounts? Return only fiduciary IDs.",
    expected: {
      kind: "list",
      ids: ["F1005", "F1006", "F1007", "F1008", "F1010", "F1012", "F1025", "F1027"],
      note: "Duplicate of Q1.",
    },
  },
  {
    id: "Q4",
    question: "Which clients have multiple accounts but all of them are CLOSED? List their fiduciary IDs.",
    expected: { kind: "list", ids: [], note: "PDF answer: No clients found." },
  },
  {
    id: "Q5",
    question: "Which clients have ONLY non-IRA accounts (no IRA accounts at all)? List their fiduciary IDs.",
    expected: { kind: "list", ids: ["F1011", "F1016", "F1017", "F1022", "F1023"] },
  },
  {
    id: "Q6",
    question:
      "Which clients have a DEACTIVATED profile but at least one ACTIVE (Open) account? List their fiduciary IDs.",
    expected: { kind: "list", ids: ["F1005", "F1007", "F1010", "F1019", "F1023"] },
  },
  {
    id: "Q7",
    question: "Does client F1010 have an account? If yes, what are the account types?",
    expected: { kind: "yes_no_with_list", yes: true, accountTypes: ["Estate", "Roth IRA"] },
  },
  {
    id: "Q8",
    question: "Are there any clients in the system? If yes, give their names.",
    expected: { kind: "yes_no", yes: true, note: "PDF says 20 clients; mirror may have more." },
  },
  {
    id: "Q9",
    question: "Are there any clients with no contact details (no email and no mobile phone)? If yes, list them.",
    expected: { kind: "yes_no_with_list", yes: true, ids: ["F1021", "F1024"] },
  },
  {
    id: "Q10",
    question: "Give the first name, last name, and postal code of client F1008.",
    expected: { kind: "name_postal", firstName: "David", lastName: "Wilson", postalCode: "33101" },
  },
  {
    id: "Q11",
    question: "Give clients with multiple accounts and their account count.",
    expected: {
      kind: "counts",
      counts: { F1005: 3, F1006: 2, F1007: 3, F1008: 4, F1010: 2, F1012: 3, F1025: 2, F1027: 3 },
    },
  },
  {
    id: "Q12",
    question: "Give clients having IRA accounts and the number of IRA accounts each one has.",
    expected: {
      kind: "counts",
      counts: {
        F1005: 2, F1006: 1, F1007: 2, F1008: 3, F1009: 1, F1010: 1, F1012: 1,
        F1013: 1, F1014: 1, F1015: 1, F1018: 1, F1019: 1, F1020: 1, F1021: 1,
        F1024: 1, F1025: 1, F1026: 1, F1027: 2,
      },
    },
  },
];

/* ── Automation invocation + raw output fetch ─────────────────────── */

interface RawOutput {
  text?: string;
  bool_value?: boolean;
  number?: { lo?: number; mid?: number; hi?: number; flags?: number };
  table?: { inline?: { data?: string } };
  list?: { items?: Array<RawOutput> };
}

interface RawRunOutputs {
  response_text?: RawOutput;
  query_result?: RawOutput;
  generated_sql?: RawOutput;
  applied_where_clauses?: RawOutput;
  sub_questions?: RawOutput;
  result_row_count?: RawOutput;
  question_count?: RawOutput;
  sub_query_count?: RawOutput;
  email_sent?: RawOutput;
  [k: string]: RawOutput | undefined;
}

interface AutomationResponse {
  runId: string;
  status: "completed" | "failed" | "awaiting_guidance" | "timeout";
  responseText: string;
  generatedSql: string;
  appliedWhere: string[];
  subQuestions: string[];
  rows: Record<string, unknown>[];
  rawError?: string;
}

function unwrapNumber(n?: { lo?: number; flags?: number }): number | null {
  if (!n) return null;
  const scale = ((n.flags ?? 0) >> 16) & 0xff;
  return (n.lo ?? 0) / Math.pow(10, scale);
}

function unwrapList(o?: RawOutput): string[] {
  const items = o?.list?.items ?? [];
  return items.map((it) => (typeof it.text === "string" ? it.text : JSON.stringify(it)));
}

function decodeArrow(b64: string): Record<string, unknown>[] {
  const buf = Buffer.from(b64, "base64");
  const table: Table = tableFromIPC(buf);
  const rows: Record<string, unknown>[] = [];
  for (let r = 0; r < table.numRows; r++) {
    const row: Record<string, unknown> = {};
    for (const field of table.schema.fields) {
      const col = table.getChild(field.name);
      let v: unknown = col?.get(r);
      // BigInt to number for easier comparisons (counts are small)
      if (typeof v === "bigint") v = Number(v);
      row[field.name] = v ?? null;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Fetch the raw run JSON so we can grab outputs untouched (parseOutputValue in
 * lib/kognitos drops table/list metadata we want to inspect).
 */
async function fetchRawOutputs(runId: string): Promise<RawRunOutputs | null> {
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}/runs/${runId}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { state?: { completed?: { outputs?: RawRunOutputs } } };
  return data.state?.completed?.outputs ?? null;
}

async function runAutomation(question: string): Promise<AutomationResponse> {
  const inv = await invokeAutomation(AUTOMATION_ID!, { "User Query": { text: question } });
  if (!inv.runId) {
    return {
      runId: "",
      status: "failed",
      responseText: "",
      generatedSql: "",
      appliedWhere: [],
      subQuestions: [],
      rows: [],
      rawError: inv.error,
    };
  }
  const polled = await pollRun(AUTOMATION_ID!, inv.runId, 180_000, 2000);
  if (polled.status !== "completed") {
    return {
      runId: inv.runId,
      status: polled.status,
      responseText: "",
      generatedSql: "",
      appliedWhere: [],
      subQuestions: [],
      rows: [],
      rawError: polled.error,
    };
  }

  const raw = await fetchRawOutputs(inv.runId);
  if (!raw) {
    return {
      runId: inv.runId,
      status: "completed",
      responseText: String(polled.outputs.response_text ?? ""),
      generatedSql: "",
      appliedWhere: [],
      subQuestions: [],
      rows: [],
    };
  }

  const responseText = raw.response_text?.text ?? "";
  const generatedSql = raw.generated_sql?.text ?? "";
  const appliedWhere = unwrapList(raw.applied_where_clauses);
  const subQuestions = unwrapList(raw.sub_questions);
  const tableB64 = raw.query_result?.table?.inline?.data;
  const rows = tableB64 ? decodeArrow(tableB64) : [];

  return {
    runId: inv.runId,
    status: "completed",
    responseText,
    generatedSql,
    appliedWhere,
    subQuestions,
    rows,
  };
}

/* ── Extraction + comparison helpers ──────────────────────────────── */

const FID_RE = /\bF1\d{3}\b/g;

function rowFiduciaryIds(rows: Record<string, unknown>[]): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const v of Object.values(row)) {
      if (typeof v === "string") {
        for (const m of v.matchAll(FID_RE)) ids.add(m[0]);
      }
    }
  }
  return [...ids].sort();
}

function textFiduciaryIds(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(FID_RE)) ids.add(m[0]);
  return [...ids].sort();
}

function combinedFiduciaryIds(ar: AutomationResponse): string[] {
  const ids = new Set<string>([...rowFiduciaryIds(ar.rows), ...textFiduciaryIds(ar.responseText)]);
  return [...ids].sort();
}

function setEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const v of b) if (!sa.has(v)) return false;
  return true;
}

interface CompareResult {
  pass: boolean;
  detail: string;
  extracted: string;
}

function compareList(ar: AutomationResponse, expected: string[]): CompareResult {
  const found = combinedFiduciaryIds(ar);
  if (expected.length === 0) {
    const noLanguage = /(no\s+(records|clients|results)\s+were\s+found|no clients|none|not\s+found|0\s+rows)/i
      .test(ar.responseText);
    if (found.length === 0 && (noLanguage || ar.rows.length === 0)) {
      return { pass: true, detail: "No clients reported (matches expected).", extracted: "[]" };
    }
    if (found.length === 0) {
      return { pass: true, detail: "No fiduciary IDs surfaced (matches expected).", extracted: "[]" };
    }
    return {
      pass: false,
      detail: `Expected no clients but reply mentions: ${found.join(", ")}`,
      extracted: JSON.stringify(found),
    };
  }
  const ok = setEq(found, expected);
  if (ok) return { pass: true, detail: "ID set matches expected.", extracted: JSON.stringify(found) };
  const missing = expected.filter((x) => !found.includes(x));
  const extra = found.filter((x) => !expected.includes(x));
  const parts: string[] = [];
  if (missing.length) parts.push(`missing ${missing.join(", ")}`);
  if (extra.length) parts.push(`extra ${extra.join(", ")}`);
  return { pass: false, detail: parts.join("; "), extracted: JSON.stringify(found) };
}

/**
 * For grouped_aggregation: rows look like
 * { fiduciary_id: 'F1005', name: '...', count: 3 }  (column names vary)
 * We grab fiduciary_id and the first numeric column we can find.
 */
function extractCounts(ar: AutomationResponse): Record<string, number> {
  const out: Record<string, number> = {};

  // Try table rows first
  for (const row of ar.rows) {
    let id: string | null = null;
    let count: number | null = null;
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "string" && FID_RE.test(v)) {
        const m = v.match(FID_RE);
        if (m) id = m[0];
      } else if (typeof v === "number" && k.toLowerCase() !== "fiduciary_id") {
        if (count === null) count = v;
      } else if (typeof v === "bigint") {
        if (count === null) count = Number(v);
      }
    }
    if (id !== null && count !== null && Number.isFinite(count)) out[id] = count;
  }

  // Fallback to text scraping if table didn't yield pairs
  if (Object.keys(out).length === 0) {
    const text = ar.responseText;
    const patterns = [
      /\b(F1\d{3})\b[^\n\r0-9F]{0,12}(\d{1,3})\b/g,
      /\|\s*(F1\d{3})\s*\|\s*(\d{1,3})\s*\|/g,
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        const id = m[1];
        const n = parseInt(m[2], 10);
        if (Number.isFinite(n) && !(id in out)) out[id] = n;
      }
    }
  }
  return out;
}

function compareCounts(ar: AutomationResponse, expected: Record<string, number>): CompareResult {
  const found = extractCounts(ar);
  const expectedIds = Object.keys(expected).sort();
  const foundIds = Object.keys(found).sort();
  const idsMatch = setEq(foundIds, expectedIds);

  const mismatches: string[] = [];
  for (const id of expectedIds) {
    if (found[id] !== expected[id]) {
      mismatches.push(`${id}: expected ${expected[id]}, got ${found[id] ?? "?"}`);
    }
  }
  const extra = foundIds.filter((id) => !(id in expected));
  if (extra.length) mismatches.push(`extra ids: ${extra.join(", ")}`);
  if (!idsMatch && mismatches.length === 0) {
    mismatches.push(`id sets differ — found ${foundIds.join(", ")}`);
  }
  if (mismatches.length === 0) {
    return { pass: true, detail: "All counts match.", extracted: JSON.stringify(found) };
  }
  return { pass: false, detail: mismatches.join("; "), extracted: JSON.stringify(found) };
}

function compareYesNo(ar: AutomationResponse, expectedYes: boolean): CompareResult {
  const head = ar.responseText.trim().toLowerCase();
  const yes = /^yes\b/.test(head) || /\byes\b\.?/.test(head.split("\n")[0] ?? "");
  const no = /^no\b/.test(head);
  const detected = yes ? true : no ? false : null;
  if (detected === expectedYes) {
    return { pass: true, detail: `Detected ${detected ? "yes" : "no"}.`, extracted: detected ? "yes" : "no" };
  }
  return {
    pass: false,
    detail: `Expected ${expectedYes ? "yes" : "no"} but reply was unclear or opposite.`,
    extracted: detected === null ? "ambiguous" : detected ? "yes" : "no",
  };
}

function compareYesNoWithList(
  ar: AutomationResponse,
  expectedYes: boolean,
  expectedIds: string[] | undefined,
  expectedTypes: string[] | undefined,
): CompareResult {
  const yn = compareYesNo(ar, expectedYes);
  let pass = yn.pass;
  const details: string[] = [yn.detail];

  if (expectedIds) {
    const lst = compareList(ar, expectedIds);
    pass = pass && lst.pass;
    details.push(`IDs: ${lst.detail}`);
  }
  if (expectedTypes) {
    const haystack = (ar.responseText + " " + JSON.stringify(ar.rows)).toLowerCase();
    const missing = expectedTypes.filter((t) => !haystack.includes(t.toLowerCase()));
    if (missing.length === 0) details.push(`account types: all present (${expectedTypes.join(", ")}).`);
    else {
      pass = false;
      details.push(`account types missing: ${missing.join(", ")}`);
    }
  }
  return { pass, detail: details.join(" "), extracted: yn.extracted };
}

function compareNamePostal(
  ar: AutomationResponse,
  firstName: string,
  lastName: string,
  postalCode: string,
): CompareResult {
  const haystack = (ar.responseText + " " + JSON.stringify(ar.rows)).toLowerCase();
  const firstOk = haystack.includes(firstName.toLowerCase());
  const lastOk = haystack.includes(lastName.toLowerCase());
  const postalOk = (ar.responseText + " " + JSON.stringify(ar.rows)).includes(postalCode);
  if (firstOk && lastOk && postalOk) {
    return {
      pass: true,
      detail: "First name, last name, and postal code all present.",
      extracted: `${firstName} ${lastName}, ${postalCode}`,
    };
  }
  const missing: string[] = [];
  if (!firstOk) missing.push(`first name (${firstName})`);
  if (!lastOk) missing.push(`last name (${lastName})`);
  if (!postalOk) missing.push(`postal code (${postalCode})`);
  return { pass: false, detail: `Missing: ${missing.join("; ")}`, extracted: "(see reply)" };
}

function compareAnswer(q: QuestionDef, ar: AutomationResponse): CompareResult {
  switch (q.expected.kind) {
    case "list":
      return compareList(ar, q.expected.ids ?? []);
    case "counts":
      return compareCounts(ar, q.expected.counts ?? {});
    case "yes_no":
      return compareYesNo(ar, q.expected.yes ?? true);
    case "yes_no_with_list":
      return compareYesNoWithList(ar, q.expected.yes ?? true, q.expected.ids, q.expected.accountTypes);
    case "name_postal":
      return compareNamePostal(
        ar,
        q.expected.firstName ?? "",
        q.expected.lastName ?? "",
        q.expected.postalCode ?? "",
      );
  }
}

function summarizeExpected(q: QuestionDef): string {
  const e = q.expected;
  switch (e.kind) {
    case "list":
      return e.ids && e.ids.length > 0 ? e.ids.join(", ") : "no clients";
    case "counts":
      return Object.entries(e.counts ?? {}).map(([k, v]) => `${k}-${v}`).join(", ");
    case "yes_no":
      return e.yes ? "yes" : "no";
    case "yes_no_with_list":
      return [
        e.yes ? "yes" : "no",
        e.ids ? `ids: ${e.ids.join(", ")}` : null,
        e.accountTypes ? `types: ${e.accountTypes.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" / ");
    case "name_postal":
      return `${e.firstName} ${e.lastName}, ${e.postalCode}`;
  }
}

/* ── Concurrency helper ───────────────────────────────────────────── */

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = cursor++;
          if (i >= items.length) return;
          results[i] = await fn(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

/* ── Main ─────────────────────────────────────────────────────────── */

interface RunRow {
  id: string;
  question: string;
  pass: boolean;
  detail: string;
  extracted: string;
  expected: string;
  generatedSql: string;
  responseText: string;
  rowCount: number;
  runId: string;
  status: string;
}

async function main(): Promise<void> {
  console.log("Running PDF questions through SQL Query Generator automation");
  console.log(`Automation: ${AUTOMATION_ID}`);
  console.log("─".repeat(72));

  const t0 = Date.now();
  const results = await mapWithConcurrency<QuestionDef, RunRow>(QUESTIONS, 4, async (q) => {
    const tQ = Date.now();
    process.stdout.write(`  ${q.id} starting…\n`);
    let row: RunRow;
    try {
      const ar = await runAutomation(q.question);
      if (ar.status !== "completed") {
        row = {
          id: q.id,
          question: q.question,
          pass: false,
          detail: `Run ${ar.status}: ${ar.rawError ?? "no detail"}`,
          extracted: "(none)",
          expected: summarizeExpected(q),
          generatedSql: "",
          responseText: "",
          rowCount: 0,
          runId: ar.runId,
          status: ar.status,
        };
      } else {
        const cmp = compareAnswer(q, ar);
        row = {
          id: q.id,
          question: q.question,
          pass: cmp.pass,
          detail: cmp.detail,
          extracted: cmp.extracted,
          expected: summarizeExpected(q),
          generatedSql: ar.generatedSql,
          responseText: ar.responseText,
          rowCount: ar.rows.length,
          runId: ar.runId,
          status: ar.status,
        };
      }
    } catch (e) {
      row = {
        id: q.id,
        question: q.question,
        pass: false,
        detail: `EXCEPTION: ${e instanceof Error ? e.message : String(e)}`,
        extracted: "(none)",
        expected: summarizeExpected(q),
        generatedSql: "",
        responseText: "",
        rowCount: 0,
        runId: "",
        status: "exception",
      };
    }
    const ms = Date.now() - tQ;
    console.log(`  ${q.id} ${row.pass ? "PASS" : "FAIL"} (${ms}ms)  run=${row.runId}`);
    return row;
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("");
  console.log("=".repeat(72));
  console.log("DETAILED RESULTS");
  console.log("=".repeat(72));

  for (const r of results) {
    console.log("");
    console.log(`${r.id}  [${r.pass ? "PASS" : "FAIL"}]   run=${r.runId}`);
    console.log(`  question : ${r.question}`);
    console.log(`  expected : ${r.expected}`);
    console.log(`  extracted: ${r.extracted}`);
    console.log(`  detail   : ${r.detail}`);
    if (r.generatedSql) {
      console.log(`  sql      : ${r.generatedSql.replace(/\s+/g, " ").trim().slice(0, 320)}`);
    }
    if (r.responseText) {
      const oneLine = r.responseText.replace(/\s+/g, " ").trim();
      console.log(
        `  response : ${oneLine.slice(0, 320)}${oneLine.length > 320 ? "…" : ""}  (table rows=${r.rowCount})`,
      );
    }
  }

  console.log("");
  console.log("=".repeat(72));
  const passed = results.filter((r) => r.pass).length;
  console.log(`SUMMARY: ${passed}/${results.length} passed   total elapsed ${elapsed}s`);
  console.log("=".repeat(72));
  for (const r of results) {
    const tag = r.pass ? "PASS" : "FAIL";
    console.log(`  ${tag}  ${r.id}  expected=${r.expected}`);
    console.log(`        extracted=${r.extracted}`);
    if (!r.pass) console.log(`        why=${r.detail}`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
