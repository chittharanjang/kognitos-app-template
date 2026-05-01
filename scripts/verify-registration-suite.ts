import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";
import { tableFromIPC } from "apache-arrow";

/**
 * Re-test all registration-related questions against DRAFT v1.16.
 * Compares each result to the ground-truth portal_access bucketing.
 *
 * Truth (verified):
 *   portal_access = True  → registered → F1010, F1021, F1025, F1028, F1029
 *   portal_access = False → unregistered → 21 IDs
 */

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = process.env.STAGE === "published"
  ? "AUTOMATION_STAGE_PUBLISHED"
  : "AUTOMATION_STAGE_DRAFT";

const REGISTERED = new Set(["F1010", "F1021", "F1025", "F1028", "F1029"]);
const UNREGISTERED = new Set([
  "F1005","F1006","F1007","F1008","F1009","F1011","F1012","F1013","F1014",
  "F1015","F1016","F1017","F1018","F1019","F1020","F1022","F1023","F1024",
  "F1027","F1030","F1031",
]);

function decodeIds(b64: string | undefined): string[] {
  if (!b64) return [];
  const t = tableFromIPC(Buffer.from(b64, "base64"));
  const ids: string[] = [];
  const col = t.getChild("fiduciary_id");
  if (!col) return [];
  for (let i = 0; i < t.numRows; i++) {
    const v = col.get(i);
    if (v != null) ids.push(String(v));
  }
  return [...new Set(ids)];
}

async function ask(q: string): Promise<{
  responseText: string;
  recordCount: unknown;
  ids: string[];
  csvData: string;
}> {
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
  const qr = r.outputs.query_result as
    | { table?: { inline?: { data?: string } } }
    | undefined;
  const ids = decodeIds(qr?.table?.inline?.data);
  return { responseText, recordCount, ids, csvData };
}

interface Check {
  q: string;
  expected: string;
  validate: (r: {
    responseText: string;
    recordCount: unknown;
    ids: string[];
    csvData: string;
  }) => string;
}

const CHECKS: Check[] = [
  {
    q: "Check for clients who are not registered",
    expected: "21 unregistered (UNREGISTERED set)",
    validate: ({ recordCount, ids }) => {
      const set = new Set(ids);
      if (Number(recordCount) !== 21) return `record_count=${recordCount} (want 21)`;
      const leaked = ids.filter((i) => REGISTERED.has(i));
      if (leaked.length) return `leaked registered IDs: ${leaked.join(", ")}`;
      const missing = [...UNREGISTERED].filter((i) => !set.has(i));
      if (missing.length) return `missing unregistered IDs: ${missing.join(", ")}`;
      return "PASS";
    },
  },
  {
    q: "Share the file of registered clients.",
    expected: "5 registered (REGISTERED set), CSV emitted",
    validate: ({ recordCount, ids, csvData }) => {
      if (Number(recordCount) !== 5) return `record_count=${recordCount} (want 5)`;
      const set = new Set(ids);
      const missing = [...REGISTERED].filter((i) => !set.has(i));
      if (missing.length) return `missing IDs: ${missing.join(", ")}`;
      const leaked = ids.filter((i) => UNREGISTERED.has(i));
      if (leaked.length) return `leaked unregistered IDs: ${leaked.join(", ")}`;
      if (!csvData.trim()) return "csv_data empty (file requested → expected CSV)";
      return "PASS";
    },
  },
  {
    q: "How many clients are registered in the system?",
    expected: "5; no registration disclaimer",
    validate: ({ recordCount, responseText }) => {
      if (Number(recordCount) !== 5) return `record_count=${recordCount} (want 5)`;
      if (/registration.*not.*available|not exposed/i.test(responseText))
        return `disclaimer leaked: "${responseText.slice(0, 200)}"`;
      if (!/\b5\b/.test(responseText)) return `expected '5' in response: "${responseText.slice(0, 200)}"`;
      return "PASS";
    },
  },
  {
    q: "Is John registered in the system?",
    expected: "Yes/No based on John's portal_access",
    validate: ({ responseText }) => {
      if (/registration.*not.*available|not exposed/i.test(responseText))
        return `disclaimer leaked: "${responseText.slice(0, 200)}"`;
      if (!/^(yes|no)\b/i.test(responseText.trim()))
        return `expected Yes/No leading answer: "${responseText.slice(0, 200)}"`;
      return "PASS";
    },
  },
  {
    q: "Are there any unregistered clients? If yes, give me their names and email addresses.",
    expected: "Yes; 21 unregistered listed",
    validate: ({ recordCount, ids, responseText }) => {
      if (Number(recordCount) !== 21) return `record_count=${recordCount} (want 21)`;
      const leaked = ids.filter((i) => REGISTERED.has(i));
      if (leaked.length) return `leaked registered IDs: ${leaked.join(", ")}`;
      if (!/^yes/i.test(responseText.trim()))
        return `expected leading "Yes": "${responseText.slice(0, 200)}"`;
      return "PASS";
    },
  },
  {
    q: "Give me the list of all unregistered users.",
    expected: "21 unregistered",
    validate: ({ recordCount, ids }) => {
      if (Number(recordCount) !== 21) return `record_count=${recordCount} (want 21)`;
      const leaked = ids.filter((i) => REGISTERED.has(i));
      if (leaked.length) return `leaked registered IDs: ${leaked.join(", ")}`;
      return "PASS";
    },
  },
];

async function main(): Promise<void> {
  console.log(`Stage: ${STAGE}\n`);
  let pass = 0;
  let fail = 0;
  for (const c of CHECKS) {
    process.stdout.write(`[Q] ${c.q}\n  expect: ${c.expected}\n`);
    try {
      const out = await ask(c.q);
      const verdict = c.validate(out);
      if (verdict === "PASS") {
        pass++;
        console.log(`  → PASS  (record_count=${out.recordCount}, ids=${out.ids.length})`);
      } else {
        fail++;
        console.log(`  → FAIL  ${verdict}`);
        console.log(`     response_text: ${out.responseText.slice(0, 200).replace(/\s+/g, " ")}`);
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
