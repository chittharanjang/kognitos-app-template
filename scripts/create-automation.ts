import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

/**
 * Create a new Kognitos automation in the configured workspace and set its
 * display_name.
 *
 * Note: the POST endpoint silently ignores `display_name` in the create body,
 * so we follow up with a flat-body PATCH to actually name the automation.
 *
 * Usage:  npx tsx scripts/create-automation.ts "AMAAgent"
 */

interface AutomationResource {
  name: string;
  display_name?: string;
}

async function createAutomation(displayName: string): Promise<AutomationResource> {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations`;
  console.log(`POST ${path}`);

  const res = await req(path, {
    method: "POST",
    body: JSON.stringify({ automation: { display_name: displayName } }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Create failed (${res.status}): ${text}`);
    process.exit(1);
  }

  const data = JSON.parse(text) as AutomationResource;
  console.log(`✓ Created (server returned display_name="${data.display_name ?? ""}")`);
  return data;
}

async function setDisplayName(automationId: string, displayName: string): Promise<void> {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}`;
  console.log(`PATCH ${path}`);

  const res = await req(path, {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`Rename failed (${res.status}): ${text}`);
    process.exit(1);
  }

  const data = JSON.parse(text) as AutomationResource;
  console.log(`✓ display_name set to "${data.display_name ?? ""}"`);
}

async function main(): Promise<void> {
  const name = process.argv[2] ?? "AMAAgent";

  const created = await createAutomation(name);
  const id = created.name.split("/").pop()!;

  if (!created.display_name) {
    await setDisplayName(id, name);
  }

  console.log("\n──────────────────────────────────────────────");
  console.log(`Automation: ${name}`);
  console.log(`ID        : ${id}`);
  console.log(`Resource  : ${created.name}`);
  console.log("──────────────────────────────────────────────");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
