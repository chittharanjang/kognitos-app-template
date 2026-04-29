import "dotenv/config";

/**
 * Runs the 12 questions from "FT Use Case - Questions.pdf" through the live
 * chat API (POST /api/chat) and compares each assistant answer against the
 * expected answer from the PDF.
 *
 * Run:  npx tsx scripts/run-pdf-questions.ts
 *
 * Requires the dev server to be running at http://localhost:4001.
 */

const BASE_URL = process.env.CHAT_BASE_URL ?? "http://localhost:4001";

type ExpectedKind = "list" | "counts" | "yes_no_with_list" | "yes_no" | "name_postal";

interface QuestionDef {
  id: string;
  question: string;
  expected: {
    kind: ExpectedKind;
    /** For "list" — fiduciary IDs that must appear */
    ids?: string[];
    /** For "counts" — fiduciary id -> count */
    counts?: Record<string, number>;
    /** For "yes_no" / "yes_no_with_list" — expected yes/no */
    yes?: boolean;
    /** Account types we expect for Q7 */
    accountTypes?: string[];
    /** For Q10 */
    firstName?: string;
    lastName?: string;
    postalCode?: string;
    /** Free-form note shown in the report (e.g. PDF mismatch caveats) */
    note?: string;
  };
}

const QUESTIONS: QuestionDef[] = [
  {
    id: "Q1",
    question: "Which clients have multiple account types including both IRA and Non-IRA accounts? Return only fiduciary IDs.",
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
    question: "Which clients have multiple account types including both IRA and Non-IRA accounts? Return only fiduciary IDs.",
    expected: {
      kind: "list",
      ids: ["F1005", "F1006", "F1007", "F1008", "F1010", "F1012", "F1025", "F1027"],
      note: "Duplicate of Q1.",
    },
  },
  {
    id: "Q4",
    question: "Which clients have multiple accounts but all of them are CLOSED? List their fiduciary IDs.",
    expected: {
      kind: "list",
      ids: [],
      note: "PDF answer: No clients found.",
    },
  },
  {
    id: "Q5",
    question: "Which clients have ONLY non-IRA accounts (no IRA accounts at all)? List their fiduciary IDs.",
    expected: {
      kind: "list",
      ids: ["F1011", "F1016", "F1017", "F1022", "F1023"],
    },
  },
  {
    id: "Q6",
    question: "Which clients have a DEACTIVATED profile but at least one ACTIVE (Open) account? List their fiduciary IDs.",
    expected: {
      kind: "list",
      ids: ["F1005", "F1007", "F1010", "F1019", "F1023"],
    },
  },
  {
    id: "Q7",
    question: "Does client F1010 have an account? If yes, what are the account types?",
    expected: {
      kind: "yes_no_with_list",
      yes: true,
      accountTypes: ["Estate", "Roth IRA"],
    },
  },
  {
    id: "Q8",
    question: "Are there any clients in the system? If yes, give their names.",
    expected: {
      kind: "yes_no",
      yes: true,
      note: "PDF says 20 clients; mirror currently has 22.",
    },
  },
  {
    id: "Q9",
    question: "Are there any clients with no contact details (no email and no mobile phone)? If yes, list them.",
    expected: {
      kind: "yes_no_with_list",
      yes: true,
      ids: ["F1021", "F1024"],
    },
  },
  {
    id: "Q10",
    question: "Give the first name, last name, and postal code of client F1008.",
    expected: {
      kind: "name_postal",
      firstName: "David",
      lastName: "Wilson",
      postalCode: "33101",
    },
  },
  {
    id: "Q11",
    question: "Give clients with multiple accounts and their account count.",
    expected: {
      kind: "counts",
      counts: {
        F1005: 3,
        F1006: 2,
        F1007: 3,
        F1008: 4,
        F1010: 2,
        F1012: 3,
        F1025: 2,
        F1027: 3,
      },
    },
  },
  {
    id: "Q12",
    question: "Give clients having IRA accounts and the number of IRA accounts each one has.",
    expected: {
      kind: "counts",
      counts: {
        F1005: 2,
        F1006: 1,
        F1007: 2,
        F1008: 3,
        F1009: 1,
        F1010: 1,
        F1012: 1,
        F1013: 1,
        F1014: 1,
        F1015: 1,
        F1018: 1,
        F1019: 1,
        F1020: 1,
        F1021: 1,
        F1024: 1,
        F1025: 1,
        F1026: 1,
        F1027: 2,
      },
    },
  },
];

/* ── Chat API client ───────────────────────────────────────────────── */

interface ToolUseEvent {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

interface AssistantTurn {
  text: string;
  toolUses: ToolUseEvent[];
  errors: string[];
}

async function createSession(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/chat/sessions`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to create session: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { session?: { id?: string }; error?: string };
  if (!body.session?.id) {
    throw new Error(`Session response missing id: ${JSON.stringify(body)}`);
  }
  return body.session.id;
}

async function deleteSession(id: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/chat/sessions/${id}`, { method: "DELETE" });
  } catch {
    /* best effort */
  }
}

async function askChat(sessionId: string, message: string): Promise<AssistantTurn> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Chat request failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const turn: AssistantTurn = { text: "", toolUses: [], errors: [] };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by \n\n. Each frame may contain one or more
    // "data: <json>" lines. We split on \n\n and parse each frame.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleFrame(frame, turn);
    }
  }
  if (buffer.trim().length > 0) handleFrame(buffer, turn);

  return turn;
}

interface ChatEvent {
  type?: string;
  content?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

function handleFrame(frame: string, turn: AssistantTurn): void {
  const lines = frame.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim();
    if (!json) continue;
    let evt: ChatEvent;
    try {
      evt = JSON.parse(json) as ChatEvent;
    } catch {
      continue;
    }
    switch (evt.type) {
      case "text":
        if (typeof evt.content === "string") turn.text += evt.content;
        break;
      case "tool_use":
        if (evt.tool_name) {
          turn.toolUses.push({
            tool_name: evt.tool_name,
            tool_input: evt.tool_input ?? {},
          });
        }
        break;
      case "error":
        turn.errors.push(evt.content ?? "unknown error");
        break;
      default:
        break;
    }
  }
}

/* ── Answer extraction + comparison ───────────────────────────────── */

const FID_RE = /\bF1\d{3}\b/g;

function extractIds(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(FID_RE)) {
    found.add(m[0]);
  }
  return [...found].sort();
}

/**
 * Pull (Fxxxx, count) pairs from the assistant's reply. Handles common
 * formats: markdown table rows, "F1005 - 3", "F1005: 3", etc.
 */
function extractCounts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  // Pattern 1: F1005 [separator] 3 with various separators
  const patterns = [
    /\b(F1\d{3})\b[^\n\r0-9F]{0,12}(\d{1,3})\b/g,
    /\|\s*(F1\d{3})\s*\|\s*(\d{1,3})\s*\|/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const id = m[1];
      const n = parseInt(m[2], 10);
      if (!Number.isFinite(n)) continue;
      // Take the first reasonable hit per id; if multiple, keep the smallest
      // (avoids picking up a stray "F1005 ... line 30" later in narrative text).
      if (!(id in out)) out[id] = n;
    }
  }
  return out;
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

function compareList(text: string, expected: string[]): CompareResult {
  const found = extractIds(text);
  if (expected.length === 0) {
    // PDF says "No clients found" — accept either an empty list OR a clear "no" sentence
    const noLanguage =
      /\b(no clients|no records|none|0 (rows|clients|results)|not\s+found)\b/i.test(text);
    if (found.length === 0 && noLanguage) {
      return { pass: true, detail: "No clients reported (matches expected).", extracted: "[]" };
    }
    if (found.length === 0) {
      return { pass: true, detail: "No fiduciary IDs in reply (matches expected).", extracted: "[]" };
    }
    return {
      pass: false,
      detail: `Expected no clients but reply mentions: ${found.join(", ")}`,
      extracted: JSON.stringify(found),
    };
  }
  const ok = setEq(found, expected);
  if (ok) {
    return { pass: true, detail: "ID set matches expected.", extracted: JSON.stringify(found) };
  }
  const missing = expected.filter((x) => !found.includes(x));
  const extra = found.filter((x) => !expected.includes(x));
  const parts: string[] = [];
  if (missing.length) parts.push(`missing ${missing.join(", ")}`);
  if (extra.length) parts.push(`extra ${extra.join(", ")}`);
  return { pass: false, detail: parts.join("; "), extracted: JSON.stringify(found) };
}

function compareCounts(text: string, expected: Record<string, number>): CompareResult {
  const found = extractCounts(text);
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
  return {
    pass: false,
    detail: mismatches.join("; "),
    extracted: JSON.stringify(found),
  };
}

function compareYesNo(text: string, expectedYes: boolean): CompareResult {
  const t = text.toLowerCase();
  const yes = /\byes\b/.test(t) || /\bclient(s)? (do |currently )?(have|exist|are present)/.test(t);
  const no = /\bno\b/.test(t.split("\n").slice(0, 4).join(" ")) && !yes;
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
  text: string,
  expectedYes: boolean,
  expectedIds: string[] | undefined,
  expectedTypes: string[] | undefined
): CompareResult {
  const yn = compareYesNo(text, expectedYes);
  let pass = yn.pass;
  const details: string[] = [yn.detail];

  if (expectedIds) {
    const listCheck = compareList(text, expectedIds);
    pass = pass && listCheck.pass;
    details.push(`IDs: ${listCheck.detail}`);
  }
  if (expectedTypes) {
    const lowered = text.toLowerCase();
    const missing = expectedTypes.filter((t) => !lowered.includes(t.toLowerCase()));
    if (missing.length === 0) {
      details.push(`account types: all present (${expectedTypes.join(", ")}).`);
    } else {
      pass = false;
      details.push(`account types missing: ${missing.join(", ")}`);
    }
  }
  return { pass, detail: details.join(" "), extracted: yn.extracted };
}

function compareNamePostal(
  text: string,
  firstName: string,
  lastName: string,
  postalCode: string
): CompareResult {
  const t = text.toLowerCase();
  const firstOk = t.includes(firstName.toLowerCase());
  const lastOk = t.includes(lastName.toLowerCase());
  const postalOk = text.includes(postalCode);
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

function compareAnswer(q: QuestionDef, text: string): CompareResult {
  switch (q.expected.kind) {
    case "list":
      return compareList(text, q.expected.ids ?? []);
    case "counts":
      return compareCounts(text, q.expected.counts ?? {});
    case "yes_no":
      return compareYesNo(text, q.expected.yes ?? true);
    case "yes_no_with_list":
      return compareYesNoWithList(
        text,
        q.expected.yes ?? true,
        q.expected.ids,
        q.expected.accountTypes
      );
    case "name_postal":
      return compareNamePostal(
        text,
        q.expected.firstName ?? "",
        q.expected.lastName ?? "",
        q.expected.postalCode ?? ""
      );
  }
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
  reply: string;
  errors: string[];
}

function summarizeExpected(q: QuestionDef): string {
  const e = q.expected;
  switch (e.kind) {
    case "list":
      return e.ids && e.ids.length > 0 ? e.ids.join(", ") : "no clients";
    case "counts":
      return Object.entries(e.counts ?? {})
        .map(([k, v]) => `${k}-${v}`)
        .join(", ");
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

function extractSql(turn: AssistantTurn): string {
  const sqls = turn.toolUses
    .filter((t) => t.tool_name === "run_sql")
    .map((t) => String(t.tool_input.query ?? ""))
    .filter((s) => s.length > 0);
  return sqls.join("\n---\n");
}

async function main(): Promise<void> {
  console.log("Running PDF questions through chat API at", BASE_URL);
  console.log("─".repeat(72));

  const results: RunRow[] = [];
  const sessionIds: string[] = [];

  for (const q of QUESTIONS) {
    process.stdout.write(`${q.id}: `);
    const t0 = Date.now();
    let row: RunRow;
    try {
      const sessionId = await createSession();
      sessionIds.push(sessionId);
      const turn = await askChat(sessionId, q.question);
      const cmp = compareAnswer(q, turn.text);
      row = {
        id: q.id,
        question: q.question,
        pass: cmp.pass && turn.errors.length === 0,
        detail: turn.errors.length > 0 ? `STREAM ERROR: ${turn.errors.join("; ")}` : cmp.detail,
        extracted: cmp.extracted,
        expected: summarizeExpected(q),
        generatedSql: extractSql(turn),
        reply: turn.text.trim(),
        errors: turn.errors,
      };
    } catch (e) {
      row = {
        id: q.id,
        question: q.question,
        pass: false,
        detail: `EXCEPTION: ${e instanceof Error ? e.message : "unknown"}`,
        extracted: "(none)",
        expected: summarizeExpected(q),
        generatedSql: "",
        reply: "",
        errors: [e instanceof Error ? e.message : "unknown"],
      };
    }
    const ms = Date.now() - t0;
    results.push(row);
    console.log(`${row.pass ? "PASS" : "FAIL"}  (${ms}ms)`);
  }

  console.log("");
  console.log("=".repeat(72));
  console.log("DETAILED RESULTS");
  console.log("=".repeat(72));

  for (const r of results) {
    console.log("");
    console.log(`${r.id}  [${r.pass ? "PASS" : "FAIL"}]`);
    console.log(`  question : ${r.question}`);
    console.log(`  expected : ${r.expected}`);
    console.log(`  extracted: ${r.extracted}`);
    console.log(`  detail   : ${r.detail}`);
    if (r.generatedSql) {
      console.log(`  sql      : ${r.generatedSql.replace(/\s+/g, " ").trim().slice(0, 240)}`);
    }
    if (r.reply) {
      const oneLine = r.reply.replace(/\s+/g, " ").trim();
      console.log(`  reply    : ${oneLine.slice(0, 320)}${oneLine.length > 320 ? "…" : ""}`);
    }
  }

  console.log("");
  console.log("=".repeat(72));
  const passed = results.filter((r) => r.pass).length;
  console.log(`SUMMARY: ${passed}/${results.length} passed`);
  console.log("=".repeat(72));
  console.log("Failed:");
  for (const r of results) {
    if (!r.pass) console.log(`  - ${r.id}: ${r.detail}`);
  }
  console.log("");
  console.log(`Created ${sessionIds.length} chat sessions (kept for inspection).`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
