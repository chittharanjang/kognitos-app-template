import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

/**
 * Fetch a Kognitos exception by ID.
 *
 * Usage:
 *   npx tsx scripts/dump-exception.ts <exceptionId>
 */
async function main(): Promise<void> {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: npx tsx scripts/dump-exception.ts <exceptionId>");
    process.exit(1);
  }
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/exceptions/${id}`;
  const res = await req(path, { method: "GET" });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(text.slice(0, 5000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
