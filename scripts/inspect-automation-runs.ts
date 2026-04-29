import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";
import { tableFromIPC } from "apache-arrow";

/**
 * Fetch a Kognitos run by id and dump every row of the `query_result`
 * Arrow table. Used to debug the comparison script when row counts /
 * Big-Int columns confuse the regex-based extraction logic.
 *
 * Usage:  npx tsx scripts/inspect-automation-runs.ts <runId> [<runId> ...]
 */

const AUTOMATION_ID = process.env.KOGNITOS_AUTOMATION_ID!;

interface RawOutput {
  text?: string;
  bool_value?: boolean;
  number?: { lo?: number; flags?: number };
  table?: { inline?: { data?: string } };
  list?: { items?: Array<RawOutput> };
}

function decodeArrow(b64: string): Record<string, unknown>[] {
  const buf = Buffer.from(b64, "base64");
  const t = tableFromIPC(buf);
  const out: Record<string, unknown>[] = [];
  for (let r = 0; r < t.numRows; r++) {
    const row: Record<string, unknown> = {};
    for (const f of t.schema.fields) {
      let v: unknown = t.getChild(f.name)?.get(r);
      if (typeof v === "bigint") v = Number(v);
      row[f.name] = v ?? null;
    }
    out.push(row);
  }
  return out;
}

async function inspectRun(runId: string): Promise<void> {
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}/runs/${runId}`,
  );
  if (!res.ok) {
    console.log(`run ${runId}: HTTP ${res.status}`);
    return;
  }
  const data = (await res.json()) as { state?: { completed?: { outputs?: Record<string, RawOutput> } } };
  const outputs = data.state?.completed?.outputs;
  if (!outputs) {
    console.log(`run ${runId}: no completed outputs`);
    return;
  }

  console.log("=".repeat(72));
  console.log(`Run ${runId}`);
  console.log("=".repeat(72));
  console.log(`response_text  : ${outputs.response_text?.text ?? ""}`);
  console.log(`generated_sql  : ${outputs.generated_sql?.text ?? ""}`);
  const sub = outputs.sub_questions?.list?.items ?? [];
  console.log(`sub_questions  : ${sub.map((s) => s.text ?? "").join(" | ")}`);

  const tableB64 = outputs.query_result?.table?.inline?.data;
  if (!tableB64) {
    console.log("(no Arrow table in query_result)");
    return;
  }
  const rows = decodeArrow(tableB64);
  console.log(`rows           : ${rows.length}`);
  if (rows.length > 0) {
    console.log(`columns        : ${Object.keys(rows[0]).join(", ")}`);
    for (const row of rows) {
      console.log("  ", JSON.stringify(row));
    }
  }
  console.log("");
}

async function main(): Promise<void> {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) {
    console.error("Pass one or more runIds.");
    process.exit(1);
  }
  for (const id of runIds) {
    await inspectRun(id);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
