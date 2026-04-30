/* Compare current vs baseline: find regressions and fixes. */
import { readFileSync } from "node:fs";

type R = { tag: string; status: string; question: string; responseText: string | null; queryType?: string | null };

const base = JSON.parse(readFileSync("scripts/output/db-agent-test-results.baseline.json", "utf8"));
const curr = JSON.parse(readFileSync("scripts/output/db-agent-test-results.json", "utf8"));

const baseMap = new Map<string, R>(base.results.map((r: R) => [r.tag, r]));
const currMap = new Map<string, R>(curr.results.map((r: R) => [r.tag, r]));

const allTags = new Set<string>([...baseMap.keys(), ...currMap.keys()]);

let diffs = 0;
const regressions: string[] = [];
const fixes: string[] = [];
const changes: string[] = [];

for (const tag of allTags) {
  const b = baseMap.get(tag);
  const c = currMap.get(tag);
  if (!b || !c) continue;
  const bResp = (b.responseText ?? "").trim();
  const cResp = (c.responseText ?? "").trim();
  if (bResp === cResp && b.status === c.status) continue;
  diffs++;
  const wasErr = b.status !== "completed";
  const nowErr = c.status !== "completed";
  const summary = `[${tag}] ${b.question}\n  BEFORE (${b.status}): ${bResp.slice(0, 200).replace(/\n+/g, " | ")}\n  AFTER  (${c.status}): ${cResp.slice(0, 200).replace(/\n+/g, " | ")}\n`;

  // Heuristic: regression if was OK and now ERR, or response changed materially
  if (!wasErr && nowErr) {
    regressions.push(summary);
  } else if (wasErr && !nowErr) {
    fixes.push(summary);
  } else {
    changes.push(summary);
  }
}

console.log(`=== Diff: ${diffs} of ${allTags.size} cases changed ===\n`);
if (regressions.length) {
  console.log(`=== REGRESSIONS (${regressions.length}) ===\n`);
  regressions.forEach((s) => console.log(s));
}
if (fixes.length) {
  console.log(`=== FIXES (${fixes.length}) ===\n`);
  fixes.forEach((s) => console.log(s));
}
if (changes.length) {
  console.log(`=== CHANGES (${changes.length}) ===\n`);
  changes.forEach((s) => console.log(s));
}
