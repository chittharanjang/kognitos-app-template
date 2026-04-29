import "dotenv/config";
import { invokeAutomation, pollRun, req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

async function main(): Promise<void> {
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: "Show me F1005 details with registration status." },
      "Requester Email": { text: "ama-test@example.com" },
    },
    "AUTOMATION_STAGE_DRAFT",
  );
  if (!inv.runId) {
    console.error("Invoke failed:", inv.error);
    process.exit(1);
  }
  const result = await pollRun(AUTOMATION_ID, inv.runId, 120_000, 2000);
  const rt = result.outputs.response_text;
  if (typeof rt === "string") {
    console.log(rt);
  } else {
    console.log(JSON.stringify(rt));
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
