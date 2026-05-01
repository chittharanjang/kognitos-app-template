import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

async function main(): Promise<void> {
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: "How many open Roth IRA accounts are there?" },
      "Requester Email": { text: "ama-test@example.com" },
    },
    "AUTOMATION_STAGE_DRAFT",
  );
  if (!inv.runId) {
    console.error("invoke failed:", inv.error);
    process.exit(1);
  }
  const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  console.log("status:", r.status);
  for (const k of Object.keys(r.outputs)) {
    if (k === "query_result" || k === "csv_data" || k === "generated_sql") continue;
    const v = r.outputs[k];
    let s: string;
    if (typeof v === "string") s = v;
    else s = JSON.stringify(v);
    console.log(`\n--- ${k} ---\n${s}`);
  }
}

main();
