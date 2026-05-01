import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";
import { tableFromIPC } from "apache-arrow";

/**
 * Verify the v1.17 account-type breakdown formatter end-to-end via the
 * real :invoke pipeline (DRAFT by default; set STAGE=published to test
 * production after Quill is published).
 *
 * Ground truth (verified previously, snapshot taken on v3.0 PUBLISHED):
 *   Investment Account        → 9 (8 open / 1 closed)
 *   Roth IRA                  → 7 (6 open / 1 closed)
 *   Traditional IRA           → 8 (1 open / 7 closed)
 *   Inherited Roth IRA        → 4 (4 open / 0 closed)
 *   Inherited Traditional IRA → 4 (0 open / 4 closed)
 *   Estate                    → 5 (5 open / 0 closed)
 *   Total                     → 37 (24 open / 13 closed)
 *   IRA family total          → 23 (11 open / 12 closed)
 *   FIDO orphans (no WealthX) → 4 clients
 */

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = process.env.STAGE === "published"
  ? "AUTOMATION_STAGE_PUBLISHED"
  : "AUTOMATION_STAGE_DRAFT";

interface AskResult {
  responseText: string;
  recordCount: unknown;
  rows: Record<string, unknown>[];
  csvData: string;
  generatedSql: string;
}

async function ask(q: string): Promise<AskResult> {
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: q },
      "Requester Email": { text: "ama-test@example.com" },
    },
    STAGE,
  );
  if (!inv.runId) throw new Error(`invoke failed: ${inv.error}`);
  const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  if (r.status !== "completed") throw new Error(`status=${r.status} ${r.error ?? ""}`);
  const responseText = String(r.outputs.response_text ?? "");
  const recordCount = r.outputs.record_count;
  const csvData = String(r.outputs.csv_data ?? "");
  const generatedSql = String(r.outputs.generated_sql ?? "");
  const qr = r.outputs.query_result as
    | { table?: { inline?: { data?: string } } }
    | undefined;
  const b64 = qr?.table?.inline?.data;
  const rows: Record<string, unknown>[] = [];
  if (b64) {
    const t = tableFromIPC(Buffer.from(b64, "base64"));
    for (let i = 0; i < t.numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const f of t.schema.fields) {
        const v = t.getChild(f.name)?.get(i);
        row[f.name] = typeof v === "bigint" ? Number(v) : v;
      }
      rows.push(row);
    }
  }
  return { responseText, recordCount, rows, csvData, generatedSql };
}

interface Check {
  q: string;
  expected: string;
  validate: (r: AskResult) => string;
}

/** Parse a Markdown pipe table into rows of cells (trimmed). */
function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  let start = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].includes("|") && /^[\s|:\-]+$/.test(lines[i + 1])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const header = splitRow(lines[start]);
  const rows: string[][] = [header];
  for (let i = start + 2; i < lines.length; i++) {
    if (!lines[i].includes("|")) break;
    if (/^[\s|:\-]+$/.test(lines[i])) continue;
    rows.push(splitRow(lines[i]));
  }
  return rows;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function findRow(rows: string[][], firstCellPattern: RegExp): string[] | null {
  for (let i = 1; i < rows.length; i++) {
    const head = rows[i][0].replace(/\*\*/g, "").trim();
    if (firstCellPattern.test(head)) return rows[i];
  }
  return null;
}

function rowEq(row: string[] | null, expected: (number | string)[]): boolean {
  if (!row) return false;
  if (row.length < expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    const cell = row[i].replace(/\*\*/g, "").trim();
    if (typeof expected[i] === "number") {
      const n = Number(cell.replace(/[^0-9-]/g, ""));
      if (n !== expected[i]) return false;
    } else if (!new RegExp(String(expected[i]), "i").test(cell)) {
      return false;
    }
  }
  return true;
}

const EXTRA_CHECKS: Check[] = [
  {
    q: "How many closed Traditional IRA accounts?",
    expected: "rc=7; Traditional IRA only",
    validate: ({ recordCount, responseText }) => {
      if (Number(recordCount) !== 7) return `record_count=${recordCount}, expected 7`;
      const tbl = parseMarkdownTable(responseText);
      if (!tbl) return `no breakdown table.\n${responseText.slice(0, 400)}`;
      if (findRow(tbl, /investment account/i)) return `Investment row should not appear`;
      if (findRow(tbl, /^estate$/i)) return `Estate row should not appear`;
      return "PASS";
    },
  },
  {
    q: "How many Inherited Roth IRA accounts?",
    expected: "rc=4",
    validate: ({ recordCount }) => {
      if (Number(recordCount) !== 4) return `record_count=${recordCount}, expected 4`;
      return "PASS";
    },
  },
];

const CHECKS: Check[] = [
  {
    q: "What is the breakdown of account types across all clients?",
    expected: "6 type rows + Total; cols Total/Open/Closed; total 37/24/13",
    validate: ({ responseText, recordCount }) => {
      const tbl = parseMarkdownTable(responseText);
      if (!tbl) return `no Markdown table found. response_text head:\n${responseText.slice(0, 400)}`;
      const header = tbl[0].map((c) => c.toLowerCase());
      if (!header.includes("total") || !header.includes("open") || !header.includes("closed"))
        return `unexpected columns: ${header.join(" | ")}`;
      const investment = findRow(tbl, /investment account/i);
      const rothIra = findRow(tbl, /^roth ira$/i);
      const tradIra = findRow(tbl, /^traditional ira$/i);
      const inhRoth = findRow(tbl, /^inherited roth ira$/i);
      const inhTrad = findRow(tbl, /^inherited traditional ira$/i);
      const estate = findRow(tbl, /^estate$/i);
      const total = findRow(tbl, /^total\b/i);
      if (!rowEq(investment, ["Investment Account", 9, 8, 1])) return `Investment row wrong: ${investment?.join(" | ")}`;
      if (!rowEq(rothIra, ["Roth IRA", 7, 6, 1])) return `Roth IRA row wrong: ${rothIra?.join(" | ")}`;
      if (!rowEq(tradIra, ["Traditional IRA", 8, 1, 7])) return `Traditional IRA row wrong: ${tradIra?.join(" | ")}`;
      if (!rowEq(inhRoth, ["Inherited Roth IRA", 4, 4, 0])) return `Inherited Roth IRA row wrong: ${inhRoth?.join(" | ")}`;
      if (!rowEq(inhTrad, ["Inherited Traditional IRA", 4, 0, 4])) return `Inherited Traditional IRA row wrong: ${inhTrad?.join(" | ")}`;
      if (!rowEq(estate, ["Estate", 5, 5, 0])) return `Estate row wrong: ${estate?.join(" | ")}`;
      if (!rowEq(total, ["Total", 37, 24, 13])) return `Total row wrong: ${total?.join(" | ")}`;
      if (Number(recordCount) !== 37) return `record_count=${recordCount}, expected 37`;
      return "PASS";
    },
  },
  {
    q: "Show all account types available in the system.",
    expected: "Types-only mode (Total column only OR bullet list with each type)",
    validate: ({ responseText }) => {
      const t = responseText.toLowerCase();
      const required = [
        "investment account",
        "roth ira",
        "traditional ira",
        "inherited roth ira",
        "inherited traditional ira",
        "estate",
      ];
      for (const r of required)
        if (!t.includes(r)) return `missing type "${r}" in response: ${responseText.slice(0, 300)}`;
      // Should NOT contain "Open" or "Closed" columns
      if (/\|\s*open\s*\|/i.test(responseText) || /\|\s*closed\s*\|/i.test(responseText))
        return `types-only mode should not include Open/Closed columns:\n${responseText.slice(0, 400)}`;
      return "PASS";
    },
  },
  {
    q: "How many IRA accounts are there?",
    expected: "4 IRA-subtype rows + Total = 23 / 11 / 12; no Investment, no Estate",
    validate: ({ responseText, recordCount }) => {
      const tbl = parseMarkdownTable(responseText);
      if (!tbl) return `no breakdown table for IRA query.\n${responseText.slice(0, 400)}`;
      const investment = findRow(tbl, /investment account/i);
      const estate = findRow(tbl, /^estate$/i);
      if (investment) return `Investment Account row should not appear in IRA-only breakdown`;
      if (estate) return `Estate row should not appear in IRA-only breakdown`;
      const rothIra = findRow(tbl, /^roth ira$/i);
      const tradIra = findRow(tbl, /^traditional ira$/i);
      const inhRoth = findRow(tbl, /^inherited roth ira$/i);
      const inhTrad = findRow(tbl, /^inherited traditional ira$/i);
      const total = findRow(tbl, /^total\b/i);
      if (!rothIra || !tradIra || !inhRoth || !inhTrad) return `missing one of the IRA subtypes`;
      if (!rowEq(total, ["Total", 23, 11, 12])) return `Total row should be 23/11/12, got: ${total?.join(" | ")}`;
      if (Number(recordCount) !== 23) return `record_count=${recordCount}, expected 23`;
      return "PASS";
    },
  },
  {
    q: "How many Estate accounts are currently open?",
    expected: "Single Estate row; Total = 5 / 5 / 0; Filter line mentions open and Estate",
    validate: ({ responseText, recordCount }) => {
      const tbl = parseMarkdownTable(responseText);
      if (!tbl) return `no breakdown table for filtered query.\n${responseText.slice(0, 400)}`;
      const investment = findRow(tbl, /investment account/i);
      if (investment) return `Investment row should not appear (estate filter)`;
      const estate = findRow(tbl, /^estate$/i);
      const total = findRow(tbl, /^total\b/i);
      if (!rowEq(estate, ["Estate", 5, 5, 0])) return `Estate row wrong: ${estate?.join(" | ")}`;
      if (!rowEq(total, ["Total", 5, 5, 0])) return `Total wrong: ${total?.join(" | ")}`;
      if (Number(recordCount) !== 5) return `record_count=${recordCount}, expected 5`;
      const filterLineRe = /filter\s*:\s*.*estate/i;
      const openRe = /filter\s*:\s*.*open/i;
      if (!filterLineRe.test(responseText) || !openRe.test(responseText))
        return `expected a "Filter:" line mentioning Estate and open. response head:\n${responseText.slice(0, 400)}`;
      return "PASS";
    },
  },
  {
    q: "How many open Roth IRA accounts are there?",
    expected: "Single Roth IRA row; Total = 6 / 6 / 0; Filter mentions open and Roth IRA",
    validate: ({ responseText, recordCount }) => {
      const tbl = parseMarkdownTable(responseText);
      if (!tbl) return `no breakdown table.\n${responseText.slice(0, 400)}`;
      const investment = findRow(tbl, /investment account/i);
      const tradIra = findRow(tbl, /^traditional ira$/i);
      const estate = findRow(tbl, /^estate$/i);
      const inhRoth = findRow(tbl, /^inherited roth ira$/i);
      if (investment) return `Investment row should not appear`;
      if (tradIra) return `Traditional IRA row should not appear`;
      if (estate) return `Estate row should not appear`;
      if (inhRoth) return `Inherited Roth IRA row should not appear`;
      const rothIra = findRow(tbl, /^roth ira$/i);
      const total = findRow(tbl, /^total\b/i);
      if (!rowEq(rothIra, ["Roth IRA", 6, 6, 0])) return `Roth IRA row wrong: ${rothIra?.join(" | ")}`;
      if (!rowEq(total, ["Total", 6, 6, 0])) return `Total wrong: ${total?.join(" | ")}`;
      if (Number(recordCount) !== 6) return `record_count=${recordCount}, expected 6`;
      const filterRe = /filter\s*:\s*.*open[^a-z]+roth ira/i;
      if (!filterRe.test(responseText))
        return `expected "Filter: open ... Roth IRA". response head:\n${responseText.slice(0, 400)}`;
      return "PASS";
    },
  },
  {
    q: "Show me all clients whose last name is Smith.",
    expected: "(NEGATIVE) NOT a breakdown table — list/row format",
    validate: ({ responseText }) => {
      const tbl = parseMarkdownTable(responseText);
      if (tbl) {
        const header = tbl[0].map((c) => c.toLowerCase());
        if (header.includes("total") && (header.includes("open") || header.includes("closed"))) {
          return `breakdown formatter incorrectly fired. Headers: ${header.join(" | ")}`;
        }
      }
      // It's fine if there's a list-style markdown table with row data,
      // we just don't want a Total/Open/Closed table.
      return "PASS";
    },
  },
  {
    q: "Check for clients who are not registered",
    expected: "(REGRESSION) v1.16 registration semantics still work",
    validate: ({ recordCount }) => {
      if (Number(recordCount) !== 21) return `record_count=${recordCount}, expected 21`;
      return "PASS";
    },
  },
];

async function main(): Promise<void> {
  console.log(`Stage: ${STAGE}\n`);
  let pass = 0;
  let fail = 0;
  for (const c of [...CHECKS, ...EXTRA_CHECKS]) {
    process.stdout.write(`[Q] ${c.q}\n  expect: ${c.expected}\n`);
    try {
      const out = await ask(c.q);
      const verdict = c.validate(out);
      if (verdict === "PASS") {
        pass++;
        console.log(`  → PASS  (record_count=${out.recordCount})`);
      } else {
        fail++;
        console.log(`  → FAIL  ${verdict}`);
        console.log(`     response_text:\n${out.responseText.split("\n").map((l) => "       " + l).join("\n").slice(0, 1500)}`);
      }
    } catch (e) {
      fail++;
      console.log(`  → ERROR ${(e as Error).message}`);
    }
    console.log("");
  }
  console.log(`\nSummary: ${pass} passed, ${fail} failed (of ${CHECKS.length})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
