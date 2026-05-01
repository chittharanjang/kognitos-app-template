import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";
import { tableFromIPC } from "apache-arrow";

/**
 * Ground-truth verification for the "unregistered clients" question.
 *
 * Strategy: ask the DB Agent to expose ONLINE_PORTAL_ACCESS for every client
 * (allowed when explicitly requested per the data-governance rules), decode
 * the Arrow IPC table, and report:
 *   - total clients
 *   - portal_access = True / False / null counts
 *   - lists of FIDUCIARY_IDs in each bucket
 *
 * Then compare against the agent's answer to "Check for clients who are not
 * registered" (which currently keys off REGISTRATION, not portal access).
 */

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = process.env.STAGE === "draft"
  ? "AUTOMATION_STAGE_DRAFT"
  : "AUTOMATION_STAGE_PUBLISHED";

interface ClientRow {
  fiduciary_id?: string;
  first_name?: string;
  last_name?: string;
  online_portal_access?: string;
  [k: string]: unknown;
}

function decodeArrowTable(b64: string): ClientRow[] {
  const buf = Buffer.from(b64, "base64");
  const t = tableFromIPC(buf);
  const rows: ClientRow[] = [];
  for (let i = 0; i < t.numRows; i++) {
    const row: ClientRow = {};
    for (const field of t.schema.fields) {
      const v = t.getChild(field.name)?.get(i);
      row[field.name] = typeof v === "bigint" ? Number(v) : (v as unknown);
    }
    rows.push(row);
  }
  return rows;
}

async function ask(question: string): Promise<{
  responseText: string;
  recordCount: unknown;
  rows: ClientRow[];
}> {
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: question },
      "Requester Email": { text: "ama-test@example.com" },
    },
    STAGE,
  );
  if (!inv.runId) throw new Error(`invoke failed: ${inv.error}`);
  const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  if (r.status !== "completed") throw new Error(`status=${r.status} ${r.error ?? ""}`);

  const responseText =
    typeof r.outputs.response_text === "string" ? r.outputs.response_text : "";
  const recordCount = r.outputs.record_count;

  const qr = r.outputs.query_result as
    | { table?: { inline?: { data?: string } } }
    | undefined;
  const b64 = qr?.table?.inline?.data;
  const rows = b64 ? decodeArrowTable(b64) : [];
  return { responseText, recordCount, rows };
}

function bucketByPortal(rows: ClientRow[]): {
  total: number;
  trueIds: string[];
  falseIds: string[];
  nullIds: string[];
} {
  const trueIds: string[] = [];
  const falseIds: string[] = [];
  const nullIds: string[] = [];
  for (const r of rows) {
    const fid = String(r.fiduciary_id ?? "");
    const opa = r.online_portal_access == null ? "" : String(r.online_portal_access).trim().toLowerCase();
    if (opa === "true") trueIds.push(fid);
    else if (opa === "false") falseIds.push(fid);
    else nullIds.push(fid);
  }
  return { total: rows.length, trueIds, falseIds, nullIds };
}

async function main(): Promise<void> {
  console.log(`Stage: ${STAGE}`);
  console.log("=== Step 1: Ground truth via portal access ===");
  const truth = await ask(
    "Show me client names, fiduciary IDs, and online portal access status for all clients.",
  );
  const b = bucketByPortal(truth.rows);

  console.log(`Total clients              : ${b.total}`);
  console.log(`portal_access = True       : ${b.trueIds.length}  ${b.trueIds.join(", ")}`);
  console.log(`portal_access = False      : ${b.falseIds.length}  ${b.falseIds.join(", ")}`);
  console.log(`portal_access = null/blank : ${b.nullIds.length}  ${b.nullIds.join(", ")}`);

  console.log("\n=== Step 2: Agent's answer to 'not registered' ===");
  const agent = await ask("Check for clients who are not registered");
  const agentIds = agent.rows
    .map((r) => String(r.fiduciary_id ?? ""))
    .filter((s) => s.length > 0);
  console.log(`Agent record_count : ${agent.recordCount}`);
  console.log(`Agent returned ${agentIds.length} FIDUCIARY_IDs:`);
  console.log(`  ${agentIds.join(", ")}`);

  console.log("\n=== Step 3: Set comparison ===");
  const setTruth = new Set(b.falseIds); // ground truth = unregistered = portal_access False
  const setAgent = new Set(agentIds);
  const onlyTruth = [...setTruth].filter((x) => !setAgent.has(x));
  const onlyAgent = [...setAgent].filter((x) => !setTruth.has(x));
  const intersection = [...setTruth].filter((x) => setAgent.has(x));

  console.log(`Truth (portal_access=False)  : ${setTruth.size}`);
  console.log(`Agent ('not registered')     : ${setAgent.size}`);
  console.log(`Intersection                  : ${intersection.length}`);
  console.log(`In TRUTH only (missing)       : ${onlyTruth.length}  ${onlyTruth.join(", ")}`);
  console.log(`In AGENT only (false positive): ${onlyAgent.length}  ${onlyAgent.join(", ")}`);

  const match = onlyTruth.length === 0 && onlyAgent.length === 0;
  console.log(
    `\nVerdict: ${match ? "MATCH (agent answer == ground truth)" : "MISMATCH"}`,
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
