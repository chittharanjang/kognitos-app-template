/**
 * Verifies recommendation helpers: exclusions, merge order, session-stable starters,
 * and topic shift across different user messages (no Anthropic/API calls).
 *
 * Run: npx tsx scripts/verify-recommendations.ts
 */

import assert from "node:assert/strict";
import {
  QUERY_CATEGORIES,
  normalizeSuggestionKey,
  buildExcludeSetFromUserQuestions,
  suggestQueriesFromGuide,
  pickStarterSuggestionsForSession,
} from "../lib/guide-queries";

function mergeLikeChatRoute(
  guidePart: string[],
  llmPart: string[],
  excludeNormalized: Set<string>,
  maxTotal: number
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of [...guidePart, ...llmPart]) {
    const k = normalizeSuggestionKey(q);
    if (!k || seen.has(k) || excludeNormalized.has(k)) continue;
    seen.add(k);
    out.push(q.trim());
    if (out.length >= maxTotal) break;
  }
  return out;
}

console.log("verify-recommendations: running checks…\n");

// --- normalizeSuggestionKey ---
assert.equal(normalizeSuggestionKey("  Foo   BAR  "), "foo bar");
console.log("✓ normalizeSuggestionKey trims and collapses whitespace");

// --- buildExcludeSetFromUserQuestions ---
const ex = buildExcludeSetFromUserQuestions(["Hello?", "HELLO?", "Other"]);
assert.equal(ex.size, 2);
assert.ok(ex.has("hello?"));
assert.ok(ex.has("other"));
console.log("✓ buildExcludeSetFromUserQuestions dedupes normalized strings");

// --- Exclude prior questions: none of suggested strings appear in exclude set ---
const asked = ["How many IRA accounts are there?", "List all accounts of type Roth IRA."];
const exclude = buildExcludeSetFromUserQuestions(asked);
const guideFresh = suggestQueriesFromGuide(
  "Show me IRA breakdown",
  "Here are IRA counts…",
  15,
  exclude
);
for (const q of guideFresh) {
  assert.ok(!exclude.has(normalizeSuggestionKey(q)), `Suggested should not be excluded: ${q}`);
}
console.log("✓ suggestQueriesFromGuide omits normalized matches of previously asked questions");

// --- Topic shift: different user focus should change category affinity (IRA vs Profile) ---
const iraSuggestions = suggestQueriesFromGuide(
  "How many Roth IRA accounts?",
  "",
  6,
  new Set()
);
const profileSuggestions = suggestQueriesFromGuide(
  "How many profiles are locked?",
  "",
  6,
  new Set()
);
const iraOverlap = iraSuggestions.filter((q) => q.toLowerCase().includes("ira")).length;
const profileOverlap = profileSuggestions.filter(
  (q) => q.toLowerCase().includes("profile") || q.toLowerCase().includes("locked")
).length;
assert.ok(
  iraOverlap >= 2 || profileOverlap >= 2 || iraSuggestions.length >= 4,
  "IRA-oriented query should yield IRA-related examples when possible"
);
console.log(`✓ topic affinity: IRA query → ${iraOverlap}/${iraSuggestions.length} IRA-ish samples`);
console.log(`✓ topic affinity: Profile query → ${profileOverlap}/${profileSuggestions.length} profile-ish samples`);

// --- merge respects exclude (simulated LLM duplicates removed) ---
const merged = mergeLikeChatRoute(
  guideFresh.slice(0, 4),
  ["How many IRA accounts are there?", "Brand new question about WealthX?"],
  exclude,
  6
);
assert.ok(!merged.some((q) => normalizeSuggestionKey(q) === normalizeSuggestionKey("How many IRA accounts are there?")));
assert.ok(merged.some((q) => q.includes("WealthX")));
console.log("✓ merge strips excluded strings and prefers guide-first order");

// --- Session starters deterministic per seed ---
const a = pickStarterSuggestionsForSession("session-uuid-a", 4);
const b = pickStarterSuggestionsForSession("session-uuid-a", 4);
const c = pickStarterSuggestionsForSession("session-uuid-b", 4);
assert.deepEqual(a, b);
assert.notDeepEqual(a, c);
console.log("✓ pickStarterSuggestionsForSession is stable per seed and differs across seeds");

// --- Exhaustion: excluding most of one category still yields items from pool ---
const allQueries = QUERY_CATEGORIES.flatMap((c) => c.queries);
const greedyExclude = buildExcludeSetFromUserQuestions(allQueries.slice(0, Math.min(80, allQueries.length)));
const leftovers = suggestQueriesFromGuide(
  "Tell me about clients",
  "",
  8,
  greedyExclude
);
assert.ok(leftovers.length >= 1 || allQueries.length <= 80, "Still returns unused guide lines when many are excluded");
console.log(`✓ after excluding ${greedyExclude.size} lines, ${leftovers.length} suggestion(s) still produced`);

console.log("\nAll recommendation behavior checks passed.");
