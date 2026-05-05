import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";
import { getAmaAgentAutomationId } from "../lib/ama-agent";

async function main(): Promise<void> {
  const automationId = getAmaAgentAutomationId();
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs?pageSize=2`,
  );
  const data = (await res.json()) as { runs?: Record<string, unknown>[] };
  const r = data.runs?.[0];
  if (!r) {
    console.log("no runs");
    return;
  }
  console.log("top-level keys:", Object.keys(r));
  console.log();
  const interesting = [
    "name",
    "create_time",
    "update_time",
    "stage",
    "version",
    "automation_version",
    "draft_version",
    "published_version",
    "automation",
    "published_automation",
    "automation_revision",
    "revision",
  ];
  for (const k of interesting) {
    if (k in r) console.log(`  ${k}:`, JSON.stringify(r[k]).slice(0, 200));
  }
  console.log();
  console.log("FULL FIRST RUN (truncated):");
  const dump = JSON.stringify(r, null, 2);
  console.log(dump.length > 5000 ? dump.slice(0, 5000) + "..." : dump);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
