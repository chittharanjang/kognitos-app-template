import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";
import { writeFileSync } from "node:fs";

const AUTO_ID = "mC3GaXQfTaca9mVUSziGW";

async function tryPath(path: string, label: string): Promise<void> {
  const res = await req(path);
  console.log(`\n--- ${label} (${res.status}) ${path} ---`);
  if (!res.ok) {
    console.log(await res.text().then((t) => t.slice(0, 300)));
    return;
  }
  const text = await res.text();
  const fileSafe = label.replace(/[^a-z0-9._-]+/gi, "-");
  writeFileSync(`scripts/output/dump-${fileSafe}.json`, text);
  console.log(`Bytes: ${text.length}`);
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      console.log(`Array length: ${j.length}`);
    } else if (typeof j === "object" && j !== null) {
      const obj = j as Record<string, unknown>;
      console.log("Top-level keys: " + Object.keys(obj).join(", "));
      for (const k of ["code", "code_length", "english_code", "artifacts"]) {
        const v = obj[k];
        if (typeof v === "string") console.log(`  ${k}: string len=${v.length}`);
        else if (typeof v === "number") console.log(`  ${k}: number=${v}`);
        else if (Array.isArray(v)) console.log(`  ${k}: array len=${v.length}`);
        else if (v != null) console.log(`  ${k}: ${typeof v}`);
      }
    }
  } catch {
    /* not JSON */
  }
}

async function main(): Promise<void> {
  const base = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTO_ID}`;
  await tryPath(base, "default");
  await tryPath(`${base}?view=FULL`, "view-FULL");
  await tryPath(`${base}?view=full`, "view-full");
  await tryPath(`${base}/code`, "subroute-code");
  await tryPath(`${base}/code:read`, "code-colon-read");
  await tryPath(`${base}:get`, "colon-get");
  await tryPath(`${base}/contents`, "contents");
  await tryPath(`${base}/source`, "source");
  await tryPath(`${base}/files`, "files");
  await tryPath(`${base}/runs?pageSize=1`, "runs-pageSize-1");
}

main().catch((e) => {
  console.error("Fatal", e);
  process.exit(1);
});
