import "dotenv/config";
import { invokeAutomation, pollRun, req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

/**
 * Smoke-test AMAAgent by invoking a published or draft run with a natural-
 * language question and printing the marked outputs.
 *
 * Usage:
 *   npx tsx scripts/invoke-amaagent.ts "your question"
 *   npx tsx scripts/invoke-amaagent.ts --draft "your question"
 *
 * Reads `KOGNITOS_AUTOMATION_ID` from .env if no automation ID is exported in
 * the environment; otherwise defaults to the AMAAgent ID.
 */

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

async function inspectRun(automationId: string, runId: string): Promise<void> {
  const r = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`,
  );
  if (!r.ok) {
    console.log("inspect HTTP", r.status, await r.text());
    return;
  }
  const data = await r.json();
  console.log("\n--- run state keys ---");
  console.log(Object.keys(data.state ?? {}).join(", ") || "(no state)");
  if (data.state?.completed) {
    console.log("\n--- raw completed.outputs ---");
    console.log(JSON.stringify(data.state.completed.outputs, null, 2).slice(0, 4000));
  } else if (data.state?.failed) {
    console.log("\n--- failed ---");
    console.log(JSON.stringify(data.state.failed, null, 2).slice(0, 2000));
  } else if (data.state?.awaiting_guidance) {
    console.log("\n--- awaiting_guidance ---");
    console.log(JSON.stringify(data.state.awaiting_guidance, null, 2).slice(0, 2000));
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let stage: string = "AUTOMATION_STAGE_PUBLISHED";
  let qIdx = 0;
  if (argv[0] === "--draft") { stage = "AUTOMATION_STAGE_DRAFT"; qIdx = 1; }
  const question = argv.slice(qIdx).join(" ").trim();
  if (!question) {
    console.error('Usage: npx tsx scripts/invoke-amaagent.ts [--draft] "your question"');
    process.exit(1);
  }

  console.log(`Invoking AMAAgent (${stage})`);
  console.log(`User Query: ${question}`);

  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: question },
      "Requester Email": { text: "ama-test@example.com" },
    },
    stage,
  );

  if (!inv.runId) {
    console.error("Invoke failed:", inv.error);
    process.exit(1);
  }
  console.log(`Run ID: ${inv.runId}`);

  const result = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  console.log("\n=== POLL RESULT ===");
  console.log("status:", result.status);
  if (result.error) console.log("error:", result.error);
  if (Object.keys(result.outputs).length > 0) {
    console.log("\noutputs:");
    for (const [k, v] of Object.entries(result.outputs)) {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      console.log(`  ${k}: ${s.slice(0, 400)}${s.length > 400 ? "…" : ""}`);
    }
  } else {
    console.log("(no parsed outputs)");
  }

  await inspectRun(AUTOMATION_ID, inv.runId);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
