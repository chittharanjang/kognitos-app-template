import "dotenv/config";
import { req } from "../lib/kognitos";

const AUTO = "mC3GaXQfTaca9mVUSziGW";

const variants = [
  "automations/" + AUTO + ":fork",
  "automations/" + AUTO + ":createDraft",
  "automations/" + AUTO + ":edit",
  "automations/" + AUTO + ":branch",
  "automations/" + AUTO + ":forkPublished",
  "automations/" + AUTO + ":forkPublishedAutomation",
  "automations/" + AUTO + "/draft:create",
  "automations/" + AUTO + "/draft",
  "automations/" + AUTO + ":makeDraft",
  "automations/" + AUTO + ":unpublish",
];

const ORG = process.env.KOGNITOS_ORG_ID!;
const WS = process.env.KOGNITOS_WORKSPACE_ID!;

async function main(): Promise<void> {
  for (const v of variants) {
    const path = `/organizations/${ORG}/workspaces/${WS}/${v}`;
    const res = await req(path, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const text = await res.text();
    console.log(`${v}\n  → ${res.status} ${text.slice(0, 200).replace(/\n/g, " ")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
