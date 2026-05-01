/**
 * Probe whether AUTOMATION_STAGE_DRAFT actually executes the latest
 * draft (3.18) or silently falls back to PUBLISHED (3.0).
 */
import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const Q = "Does John have any open accounts?";

async function probe(stage: "AUTOMATION_STAGE_DRAFT" | "AUTOMATION_STAGE_PUBLISHED"): Promise<void> {
  console.log(`\n══ ${stage} ══`);
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: Q },
      "Requester Email": { text: "probe@local" },
    },
    stage,
  );
  if (!inv.runId) {
    console.log("  invoke failed:", inv.error);
    return;
  }
  console.log(`  run id: ${inv.runId}`);
  const r = await pollRun(AUTOMATION_ID, inv.runId, 120_000, 2000);
  console.log(`  status: ${r.status}`);
  if (r.status !== "completed") {
    console.log(`  error:`, r.error);
    return;
  }
  console.log(`  rc=${r.outputs.record_count} qt=${r.outputs.query_type}`);
  console.log(`  response: ${String(r.outputs.response_text ?? "").split("\n")[0]}`);
}

async function main(): Promise<void> {
  console.log(`Probing query: ${Q}`);
  await probe("AUTOMATION_STAGE_DRAFT");
  await probe("AUTOMATION_STAGE_PUBLISHED");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
