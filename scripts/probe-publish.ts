/**
 * Probe undocumented Kognitos REST endpoints for publish/promote.
 * Try a handful of likely names and report responses.
 */
import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

const AUTO = "mC3GaXQfTaca9mVUSziGW";

const variants = [
  ":publish",
  ":publishAutomation",
  ":publishDraft",
  ":push",
  ":promote",
  ":promoteToProduction",
  ":promoteDraft",
  ":releaseAutomation",
  ":release",
  ":deploy",
  ":publishVersion",
  ":commit",
  ":finalize",
  ":freeze",
];

async function main(): Promise<void> {
  for (const v of variants) {
    const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTO}${v}`;
    try {
      const res = await req(path, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const text = await res.text();
      const summary = text
        .slice(0, 200)
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ");
      console.log(`${v.padEnd(28)} → ${res.status} ${summary}`);
    } catch (e) {
      console.log(`${v.padEnd(28)} → EXCEPTION ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
