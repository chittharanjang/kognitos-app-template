import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

/**
 * Open a Quill thread for an existing Kognitos automation. Quill is the agent
 * that reads/writes the automation's English code, so a thread always belongs
 * to one specific automation.
 *
 * Usage:  npx tsx scripts/quill-create-thread.ts <AUTOMATION_ID>
 *
 * Prints the bare thread ID on the last line of stdout so callers can pipe
 * it into scripts/quill-send-message.ts.
 */

interface ThreadCreateResponse {
  name?: string;
  state?: unknown;
}

async function createThread(automationId: string): Promise<string> {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/agents/quill/threads`;
  console.log(`POST ${path}`);

  const body = {
    automation: `organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}`,
  };

  const res = await req(path, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.error(text);
    process.exit(1);
  }

  const data = JSON.parse(text) as ThreadCreateResponse;
  if (!data.name) {
    console.error("No `name` in response — cannot extract thread ID:");
    console.error(text);
    process.exit(1);
  }

  const threadId = data.name.split("/threads/").pop()!;
  console.log(`Thread resource: ${data.name}`);
  console.log(`THREAD_ID=${threadId}`);
  return threadId;
}

async function main(): Promise<void> {
  const automationId = process.argv[2];
  if (!automationId) {
    console.error("Usage: npx tsx scripts/quill-create-thread.ts <AUTOMATION_ID>");
    process.exit(1);
  }
  await createThread(automationId);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
