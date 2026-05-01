import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = process.env.STAGE === "published"
  ? "AUTOMATION_STAGE_PUBLISHED"
  : "AUTOMATION_STAGE_DRAFT";

const QUERIES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [
  "Does John Smith have portal access?",
  "Does John Doe have portal access?",
  "Does Smith have portal access?",
  "Does John have portal access?",
  "Show me all clients whose last name is Smith.",
];

async function main(): Promise<void> {
  for (const q of QUERIES) {
    console.log("\n====================================================");
    console.log("Q:", q);
    console.log("====================================================");
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
    console.log("\n--- response_text ---");
    console.log(r.outputs.response_text);
    console.log("\n--- record_count ---");
    console.log(r.outputs.record_count);
    console.log("\n--- generated_sql ---");
    console.log(r.outputs.generated_sql);
    console.log("\n--- query_type ---");
    console.log(r.outputs.query_type);
  }
}

main();
