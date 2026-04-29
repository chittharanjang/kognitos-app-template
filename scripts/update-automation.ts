import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

/**
 * Rename an existing Kognitos automation.
 *
 * The Kognitos API ignores the `{ automation: { display_name } }` wrapper on
 * PATCH; the working request shape is a flat body `{ display_name }` with no
 * updateMask query parameter.
 *
 * Usage:  npx tsx scripts/update-automation.ts <AUTOMATION_ID> "New Name"
 */

async function renameAutomation(automationId: string, displayName: string): Promise<void> {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}`;
  console.log(`PATCH ${path}`);
  console.log(`display_name: ${displayName}\n`);

  const res = await req(path, {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.error(text);
    process.exit(1);
  }

  const data = JSON.parse(text) as { display_name?: string };
  console.log(`✓ display_name is now "${data.display_name ?? ""}"`);
}

async function main(): Promise<void> {
  const id = process.argv[2];
  const name = process.argv[3];
  if (!id || !name) {
    console.error("Usage: npx tsx scripts/update-automation.ts <AUTOMATION_ID> \"New Name\"");
    process.exit(1);
  }
  await renameAutomation(id, name);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
