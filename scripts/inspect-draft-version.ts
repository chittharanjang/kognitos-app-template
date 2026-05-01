/**
 * Inspect the AMAAgent DRAFT to confirm the version header reads v1.22
 * and the new stopword set actually contains the new words.
 */
import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

async function main(): Promise<void> {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}`;
  const res = await req(path, { method: "GET" });
  const data = (await res.json()) as Record<string, unknown>;

  console.log("version field:", data["version"]);
  console.log("latest_published_version:", data["latest_published_version"]);
  console.log("update_time:", data["update_time"]);
  console.log("activation_state:", data["activation_state"]);

  const codeField = data["code"];
  console.log(`code field type:`, typeof codeField, Array.isArray(codeField) ? "(array)" : "");
  if (codeField && typeof codeField === "object") {
    console.log(`code field keys:`, Object.keys(codeField));
    console.log(`code field sample:`, JSON.stringify(codeField).slice(0, 800));
  } else if (typeof codeField === "string") {
    console.log(`code field (string len ${codeField.length}):\n`, codeField.slice(0, 500));
  }
  const artifacts = data["artifacts"];
  console.log(`\nartifacts type:`, typeof artifacts, Array.isArray(artifacts));
  if (Array.isArray(artifacts)) {
    console.log(`artifacts count:`, artifacts.length);
    for (const a of artifacts.slice(0, 5)) {
      console.log(`  artifact:`, JSON.stringify(a).slice(0, 400));
    }
  } else if (artifacts && typeof artifacts === "object") {
    console.log(`artifacts keys:`, Object.keys(artifacts));
  }
  const codeMapping = data["code_mapping"];
  console.log(`\ncode_mapping type:`, typeof codeMapping, Array.isArray(codeMapping));
  if (codeMapping && typeof codeMapping === "object") {
    const cm = codeMapping as Record<string, unknown>;
    console.log(`code_mapping keys:`, Object.keys(cm));
    console.log(`code_mapping sample:`, JSON.stringify(cm).slice(0, 800));
  }
  const codeLength = data["code_length"];
  console.log(`code_length:`, codeLength);

  const code = String(data["english_code"] ?? "");
  console.log(`\n=== english_code (${code.length} chars) ===`);
  const lines = code.split("\n");
  console.log(`  total lines: ${lines.length}`);
  const versionLines = lines.filter((l) => /v1\.(1[6-9]|2[0-9])/i.test(l));
  console.log(`  version mentions: ${versionLines.length}`);
  for (const v of versionLines.slice(0, 8)) {
    console.log(`    ${v.slice(0, 120)}`);
  }
  const newStopwords = ["SYSTEM", "DATABASE", "OPEN", "HI", "THANKS", "WONDERING", "POSSIBLE"];
  const presence: Record<string, boolean> = {};
  for (const w of newStopwords) {
    presence[w] = code.toUpperCase().includes(`"${w}"`);
  }
  console.log(`  new stopword presence:`, presence);
  console.log(
    `  v1.22 guard text:`,
    /yn_target_fid\s*==\s*""\s*and\s*yn_target_email\s*==\s*""\s*and\s*yn_has_hint\s*==\s*False/.test(code),
  );
  console.log(
    `  sq_text usage:`,
    (code.match(/sq_text/g) ?? []).length,
    `mentions`,
  );
  console.log(
    `  user_query.lower() in code:`,
    (code.match(/user_query\.lower\(\)/g) ?? []).length,
    `mentions`,
  );
  return;
  const draft: Record<string, unknown> | undefined = undefined;
  const published: Record<string, unknown> | undefined = undefined;

  function summarize(label: string, version: Record<string, unknown> | undefined): void {
    if (!version) {
      console.log(`${label}: <none>`);
      return;
    }
    const code = String(version["english_code"] ?? "");
    const lines = code.split("\n");
    console.log(`\n══ ${label} ══`);
    console.log(`  total lines: ${lines.length}`);
    console.log(`  first 8 lines (version header / changelog):`);
    for (const line of lines.slice(0, 8)) {
      console.log(`    ${line}`);
    }
    const versionLines = lines.filter((l) => /v1\.(1[6-9]|2[0-9])/i.test(l));
    console.log(`  version mentions: ${versionLines.length}`);
    for (const v of versionLines.slice(0, 8)) {
      console.log(`    ${v.slice(0, 120)}`);
    }
    // Check for new stopwords
    const newStopwords = ["SYSTEM", "DATABASE", "OPEN", "HI", "THANKS", "WONDERING", "POSSIBLE"];
    const presence: Record<string, boolean> = {};
    for (const w of newStopwords) {
      presence[w] = code.toUpperCase().includes(`"${w}"`);
    }
    console.log(`  new stopword presence:`, presence);
    // Check for guard text
    console.log(
      `  v1.22 guard text:`,
      /yn_target_fid\s*==\s*""\s*and\s*yn_target_email\s*==\s*""\s*and\s*yn_has_hint\s*==\s*False/.test(code),
    );
    console.log(
      `  sq_text usage:`,
      (code.match(/sq_text/g) ?? []).length,
      `mentions`,
    );
    console.log(
      `  user_query usage in BRANCH 3:`,
      (code.match(/user_query\.lower\(\)/g) ?? []).length,
      `mentions`,
    );
  }

  summarize("DRAFT", draft);
  summarize("PUBLISHED", published);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
