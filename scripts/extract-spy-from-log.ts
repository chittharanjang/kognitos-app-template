import { readFileSync, writeFileSync } from "node:fs";

const logPath = process.argv[2];
const outPath = process.argv[3];
if (!logPath || !outPath) {
  console.error("usage: extract-spy-from-log.ts <log> <out>");
  process.exit(1);
}
const txt = readFileSync(logPath, "utf8");

// Find the artifact line — `↳ artifact {"artifact_type":"automation","content":"..."}`
const idx = txt.indexOf("↳ artifact ");
if (idx < 0) {
  console.error("No artifact found");
  process.exit(1);
}
const after = txt.slice(idx + "↳ artifact ".length);
// Walk to find balanced JSON object (the artifact is on a single line)
let depth = 0;
let inStr = false;
let esc = false;
let end = -1;
for (let i = 0; i < after.length; i++) {
  const c = after[i];
  if (inStr) {
    if (esc) esc = false;
    else if (c === "\\") esc = true;
    else if (c === '"') inStr = false;
    continue;
  }
  if (c === '"') { inStr = true; continue; }
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) { end = i; break; }
  }
}
if (end < 0) { console.error("no balanced json"); process.exit(1); }

const artifactJson = after.slice(0, end + 1);
const art = JSON.parse(artifactJson) as { content?: string };
if (!art.content) { console.error("no content"); process.exit(1); }
const inner = JSON.parse(art.content) as { code?: string };
if (!inner.code) { console.error("no code"); process.exit(1); }

writeFileSync(outPath, inner.code);
const lines = inner.code.split(/\r?\n/);
console.log(`Extracted ${lines.length} lines → ${outPath}`);
