import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = process.env.STAGE === "published"
  ? "AUTOMATION_STAGE_PUBLISHED"
  : "AUTOMATION_STAGE_DRAFT";

const QUERIES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  "What is the breakdown of account types across all clients?",
  "Show all account types available in the system.",
  "How many IRA accounts are there?",
  "How many Estate accounts are currently open?",
  "How many open Roth IRA accounts are there?",
];

async function main(): Promise<void> {
  for (const q of QUERIES) {
    console.log("====================================================");
    console.log("Q:", q);
    console.log("----------------------------------------------------");
    const inv = await invokeAutomation(
      AUTOMATION_ID,
      {
        "User Query": { text: q },
        "Requester Email": { text: "ama-test@example.com" },
      },
      STAGE,
    );
    if (!inv.runId) {
      console.log("invoke failed:", inv.error);
      continue;
    }
    const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
    if (r.status !== "completed") {
      console.log("status:", r.status, r.error ?? "");
      continue;
    }
    console.log(r.outputs.response_text);
    console.log(`\n[record_count=${r.outputs.record_count}]`);
  }
}

main();
