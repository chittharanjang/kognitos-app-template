import "dotenv/config";
import { req, ORG_ID, WORKSPACE_ID } from "../lib/kognitos";
import { writeFileSync } from "node:fs";

const AUTO_ID = "mC3GaXQfTaca9mVUSziGW";

async function main() {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTO_ID}`;
  const res = await req(path);
  if (!res.ok) {
    console.error(`Status ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { english_code?: string; version?: unknown };
  const code = data.english_code ?? "";
  writeFileSync("scripts/output/amaagent-after-clean.txt", code);

  const lines = code.split(/\r?\n/);
  const total = lines.length;

  const matchSummary: Record<string, number> = {
    "cl_status_words / cl_uq_lc / cl_done (REMOVED v1.12 patch a)": 0,
    "pred_apply_profile_status / pred_status_canonical (REMOVED v1.13 patch b)": 0,
    "ps_target_values_local (REMOVED v1.14 patch B – local var name from old patch)": 0,
    "es_status_canonical / es_apply_profile (REMOVED v1.12 patch d)": 0,
    "filter_type == \"profile_status\" (NEW dispatch branch)": 0,
    "ps_canonical_set (NEW – inside profile_status branch)": 0,
    "COMMA-LIST AGGREGATION (NEW splitter rule)": 0,
    "profile_status (in planner prompt examples)": 0,
  };

  for (const line of lines) {
    if (/cl_status_words|cl_uq_lc\b|\bcl_done\b/.test(line))
      matchSummary["cl_status_words / cl_uq_lc / cl_done (REMOVED v1.12 patch a)"]++;
    if (/pred_apply_profile_status|pred_status_canonical/.test(line))
      matchSummary["pred_apply_profile_status / pred_status_canonical (REMOVED v1.13 patch b)"]++;
    if (/ps_target_values_local/.test(line))
      matchSummary["ps_target_values_local (REMOVED v1.14 patch B – local var name from old patch)"]++;
    if (/es_status_canonical|es_apply_profile/.test(line))
      matchSummary["es_status_canonical / es_apply_profile (REMOVED v1.12 patch d)"]++;
    if (/filter_type\s*==\s*"profile_status"/.test(line))
      matchSummary['filter_type == "profile_status" (NEW dispatch branch)']++;
    if (/ps_canonical_set/.test(line))
      matchSummary["ps_canonical_set (NEW – inside profile_status branch)"]++;
    if (/COMMA-LIST AGGREGATION/i.test(line))
      matchSummary["COMMA-LIST AGGREGATION (NEW splitter rule)"]++;
  }

  // Count "profile_status" mentions in the planner prompt area only — heuristic: count all occurrences in code
  const profileStatusOccurrences = (code.match(/profile_status/g) ?? []).length;
  matchSummary["profile_status (in planner prompt examples)"] = profileStatusOccurrences;

  console.log(`Total lines: ${total}`);
  console.log(`Saved to: scripts/output/amaagent-after-clean.txt\n`);
  console.log("=== Verification ===");
  for (const [k, v] of Object.entries(matchSummary)) {
    const tag = k.startsWith("REMOVED") || k.includes("(REMOVED")
      ? (v === 0 ? "OK   " : "FAIL ")
      : (v >= 1 ? "OK   " : "FAIL ");
    console.log(`  ${tag} ${k}: ${v} occurrence(s)`);
  }

  // Print a context snippet around the new profile_status branch
  const idx = lines.findIndex((l) => /filter_type\s*==\s*"profile_status"/.test(l));
  if (idx >= 0) {
    console.log(`\n=== Context: lines ${idx - 1} .. ${idx + 28} (new branch) ===`);
    for (let i = Math.max(0, idx - 1); i < Math.min(total, idx + 28); i++) {
      console.log(`  ${i + 1}: ${lines[i]}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
