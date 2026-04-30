import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

async function main(): Promise<void> {
  const q = process.argv.slice(2).join(" ").trim();
  if (!q) { console.error("usage: tsx ask-amaagent.ts <query>"); process.exit(1); }
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    { "User Query": { text: q }, "Requester Email": { text: "ask@example.com" } },
    "AUTOMATION_STAGE_DRAFT",
  );
  if (!inv.runId) { console.error("invoke failed:", inv.error); process.exit(1); }
  const res = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  console.log("status:", res.status);
  console.log("databases:", res.outputs.databases_queried);
  console.log("record_count:", res.outputs.record_count);
  console.log("\n--- response_text ---");
  console.log(res.outputs.response_text);
}

main().catch((e) => { console.error("fatal:", e); process.exit(1); });
