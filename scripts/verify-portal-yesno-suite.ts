import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

/**
 * Regression suite for the yes/no portal-access path (v1.18).
 *
 * Validates two fixes:
 *   - Strict full-name matching: "Does John Smith have portal access?"
 *     must NOT match John Doe.
 *   - Yes/No semantics read the actual online_portal_access value:
 *     Liam Johnson (opa=True) gets "Yes — has portal access."; Priya
 *     Nair (opa=False) gets "No — does not have portal access."
 *
 * Plus regressions for v1.16 (registration) and v1.17 (account-type
 * breakdown).
 */

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = process.env.STAGE === "published"
  ? "AUTOMATION_STAGE_PUBLISHED"
  : "AUTOMATION_STAGE_DRAFT";

interface AskResult {
  responseText: string;
  recordCount: unknown;
  queryType: unknown;
}

async function ask(q: string): Promise<AskResult> {
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: q },
      "Requester Email": { text: "ama-test@example.com" },
    },
    STAGE,
  );
  if (!inv.runId) throw new Error(`invoke failed: ${inv.error}`);
  const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  if (r.status !== "completed") throw new Error(`status=${r.status} ${r.error ?? ""}`);
  return {
    responseText: String(r.outputs.response_text ?? ""),
    recordCount: r.outputs.record_count,
    queryType: r.outputs.query_type,
  };
}

interface Check {
  q: string;
  expected: string;
  validate: (r: AskResult) => string;
}

const CHECKS: Check[] = [
  {
    q: "Does John Smith have portal access?",
    expected: "NDF: 'No — John Smith was not found in the system.'",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 0) return `record_count=${recordCount}, expected 0 (no John Smith in DB)`;
      if (/john doe/i.test(responseText))
        return `response should NOT mention John Doe (different person):\n${responseText}`;
      if (!/no.*john smith.*not.*found/i.test(responseText))
        return `expected NDF wording mentioning John Smith. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Does John Doe have portal access?",
    expected: "No — John Doe does not have portal access.",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (opa=False). Got:\n${responseText}`;
      if (!/john doe/i.test(responseText))
        return `expected response to mention John Doe. Got:\n${responseText}`;
      if (!/(does not|doesn['’]t|no .* portal access)/i.test(responseText))
        return `expected wording about NOT having portal access. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Does Liam Johnson have portal access?",
    expected: "Yes — Liam Johnson has portal access.",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^yes\b/i.test(responseText.trim()))
        return `expected response to start with 'Yes' (opa=True). Got:\n${responseText}`;
      if (!/liam johnson/i.test(responseText))
        return `expected response to mention Liam Johnson. Got:\n${responseText}`;
      if (!/has\s+portal\s+access/i.test(responseText))
        return `expected wording 'has portal access'. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Does Priya Nair have portal access?",
    expected: "No — Priya Nair does not have portal access.",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (opa=False). Got:\n${responseText}`;
      if (!/priya nair/i.test(responseText))
        return `expected response to mention Priya Nair. Got:\n${responseText}`;
      if (!/(does not|doesn['’]t|no .* portal access)/i.test(responseText))
        return `expected wording about NOT having portal access. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Does Smith have portal access?",
    expected: "NDF: 'No — Smith was not found in the system.'",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 0) return `record_count=${recordCount}, expected 0`;
      if (!/(not found|no .* found|couldn['’]t find|no record)/i.test(responseText))
        return `expected NDF wording. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Does F1010 have portal access?",
    expected: "Yes — Liam Johnson (F1010) has portal access.",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^yes\b/i.test(responseText.trim()))
        return `expected response to start with 'Yes' (F1010 opa=True). Got:\n${responseText}`;
      if (!/(liam johnson|f1010)/i.test(responseText))
        return `expected response to identify Liam Johnson or F1010. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Does F1031 have portal access?",
    expected: "No — John Doe (F1031) does not have portal access.",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (F1031 opa=False). Got:\n${responseText}`;
      if (!/(john doe|f1031)/i.test(responseText))
        return `expected response to identify John Doe or F1031. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Check for clients who are not registered",
    expected: "(regression) v1.16 — 21 unregistered clients",
    validate: ({ recordCount }) => {
      if (Number(recordCount) !== 21) return `record_count=${recordCount}, expected 21`;
      return "PASS";
    },
  },
  {
    q: "What is the breakdown of account types across all clients?",
    expected: "(regression) v1.17 — 6-row breakdown table, Total 37/24/13",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 37) return `record_count=${recordCount}, expected 37`;
      const lc = responseText.toLowerCase();
      for (const t of ["investment account", "roth ira", "traditional ira", "estate"]) {
        if (!lc.includes(t)) return `breakdown missing '${t}':\n${responseText.slice(0, 400)}`;
      }
      return "PASS";
    },
  },
];

/**
 * Phrasing-permutation expectations. All of these ask the same thing about
 * Rahul Mehta (F1028, opa=True). They differ only in capitalization,
 * possessive form, hyphenation, and whether the question starts with
 * "Does …?". v1.18 only handles the canonical "Does <First Last> have
 * portal access?" form; v1.19 must handle the rest.
 */
const RAHUL_PASS = (r: AskResult): string => {
  if (Number(r.recordCount) !== 1)
    return `record_count=${r.recordCount}, expected 1`;
  if (!/^yes\b/i.test(r.responseText.trim()))
    return `expected response to start with 'Yes' (Rahul opa=True). Got:\n${r.responseText}`;
  if (!/rahul mehta/i.test(r.responseText))
    return `expected response to mention Rahul Mehta. Got:\n${r.responseText}`;
  if (!/has\s+portal\s+access/i.test(r.responseText))
    return `expected wording 'has portal access'. Got:\n${r.responseText}`;
  if (/26 matching|matching records/i.test(r.responseText))
    return `agent fell into the 'N matching records' bug. Got:\n${r.responseText}`;
  return "PASS";
};

const PHRASING_CHECKS: Check[] = [
  {
    q: "rahul's portal access?",
    expected: "Yes — Rahul Mehta has portal access. (lowercase + possessive)",
    validate: RAHUL_PASS,
  },
  {
    q: "Rahul's portal-access?",
    expected: "Yes — Rahul Mehta has portal access. (capital + hyphenated)",
    validate: RAHUL_PASS,
  },
  {
    q: "rahul portal access?",
    expected: "Yes — Rahul Mehta has portal access. (lowercase, no Does, no possessive)",
    validate: RAHUL_PASS,
  },
  {
    q: "rahul mehta portal access?",
    expected: "Yes — Rahul Mehta has portal access. (lowercase full name, no Does)",
    validate: RAHUL_PASS,
  },
  {
    q: "does rahul have portal access?",
    expected: "Yes — Rahul Mehta has portal access. (lowercase 'does')",
    validate: RAHUL_PASS,
  },
  {
    q: "is rahul registered?",
    expected: "Yes — Rahul Mehta has portal access. (registered ≡ portal access, lowercase)",
    validate: RAHUL_PASS,
  },
  {
    q: "rahul registered?",
    expected: "Yes — Rahul Mehta has portal access. (no leading verb, lowercase)",
    validate: RAHUL_PASS,
  },
  {
    q: "Does rahul mehta have portal access?",
    expected: "Yes — Rahul Mehta has portal access. (lowercase name with 'Does')",
    validate: RAHUL_PASS,
  },
];

CHECKS.push(...PHRASING_CHECKS);

const NO_DOES_CHECKS: Check[] = [
  {
    q: "john smith portal access?",
    expected: "NDF (no Does, lowercase)",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 0) return `record_count=${recordCount}, expected 0`;
      if (/john doe/i.test(responseText))
        return `response should NOT mention John Doe (different person):\n${responseText}`;
      if (!/(not found|no .* found|couldn['’]t find|no record)/i.test(responseText))
        return `expected NDF wording. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "priya nair portal access?",
    expected: "No — Priya Nair does not have portal access. (no Does, lowercase)",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (opa=False). Got:\n${responseText}`;
      if (!/priya nair/i.test(responseText))
        return `expected response to mention Priya Nair. Got:\n${responseText}`;
      if (!/(does not|doesn['’]t|no .* portal access)/i.test(responseText))
        return `expected wording about NOT having portal access. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "f1010 portal access?",
    expected: "Yes — Liam Johnson has portal access. (lowercase fid, no Does)",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1) return `record_count=${recordCount}, expected 1`;
      if (!/^yes\b/i.test(responseText.trim()))
        return `expected response to start with 'Yes' (F1010 opa=True). Got:\n${responseText}`;
      if (!/(liam johnson|f1010)/i.test(responseText))
        return `expected response to identify Liam Johnson or F1010. Got:\n${responseText}`;
      if (!/has\s+portal\s+access/i.test(responseText))
        return `expected wording 'has portal access'. Got:\n${responseText}`;
      return "PASS";
    },
  },
];

CHECKS.push(...NO_DOES_CHECKS);

/**
 * Bugs found via UI testing (chat at /ama-agent) on DRAFT v1.19.
 * v1.20 must turn these green.
 */
const UI_REGRESSION_CHECKS: Check[] = [
  {
    q: "Is John registered? Also give me his email ID.",
    expected:
      "Multi-question split. Sub 1: Yes — John Doe is registered (or has portal access False — both acceptable phrasings, just don't say 'John Id was not found'). Sub 2: john.doe@mail.com.",
    validate: ({ responseText }) => {
      if (/john\s+id\s+was\s+not\s+found/i.test(responseText))
        return `BUG: Q12 — 'John Id' name-claim leak from multi-question splitter. Got:\n${responseText}`;
      const lc = responseText.toLowerCase();
      const mentionsJohnDoe = /john\s+doe/i.test(responseText);
      const mentionsEmail =
        /john\.doe@mail\.com/i.test(responseText) || /primary email/i.test(responseText);
      if (!mentionsJohnDoe && !mentionsEmail)
        return `expected response to identify John Doe and/or his email. Got:\n${responseText}`;
      // Soft check: at least one sub-question should provide a real answer
      // (not an NDF for both).
      const ndfCount = (lc.match(/not\s+found\s+in\s+the\s+system/g) || []).length;
      if (ndfCount >= 2)
        return `both sub-questions returned NDF — John Doe is in the system. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Give me clients with Inherited Roth IRA accounts.",
    expected:
      "(v1.17 subtype refinement carries to data-retrieval) record_count = 4 distinct Inherited Roth IRA clients. Must NOT include the 7 plain Roth IRA clients.",
    validate: ({ responseText, recordCount }) => {
      const rc = Number(recordCount);
      if (rc === 11)
        return `BUG: Q14 — over-includes Roth IRA (4) + Inherited Roth IRA (7) = 11. Subtype refinement not applied to data-retrieval path.`;
      if (rc !== 4)
        return `record_count=${recordCount}, expected 4 (Inherited Roth IRA only). Got:\n${responseText.slice(0, 400)}`;
      // Response must include 'Inherited Roth IRA' (use full text, not slice).
      if (!/inherited\s+roth\s+ira/i.test(responseText))
        return `expected response to reference 'Inherited Roth IRA'. Got (full):\n${responseText}`;
      // Response must NOT include any plain "Roth IRA" rows (everything is
      // either an Inherited Roth IRA row or part of the header).
      // Simple check: every account_type cell should be "Inherited Roth IRA".
      const rothCount = (responseText.match(/\bRoth\s+IRA\b/gi) || []).length;
      const inheritedRothCount = (responseText.match(/Inherited\s+Roth\s+IRA/gi) || []).length;
      if (rothCount !== inheritedRothCount)
        return `over-includes plain Roth IRA rows: rothCount=${rothCount}, inheritedRothCount=${inheritedRothCount}. Got:\n${responseText}`;
      return "PASS";
    },
  },
];

CHECKS.push(...UI_REGRESSION_CHECKS);

/**
 * Surfaced while investigating the multi-question fix on v1.20:
 * "Is John registered?" was returning NDF even though John Doe is in
 * the DB (opa=False). The 'registered' verb path appears to filter
 * opa=True before name resolution, so unregistered clients get
 * dropped. The 'portal access' verb path correctly resolves the name
 * first, then reports opa.
 */
const REGISTERED_VERB_CHECKS: Check[] = [
  {
    q: "Is John registered?",
    expected:
      "No — John Doe is not registered (opa=False). Single-token 'john' must match John Doe regardless of his opa value.",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) === 0)
        return `record_count=0 (NDF) — should match John Doe (F1031, opa=False). Got:\n${responseText}`;
      if (!/john\s+doe/i.test(responseText))
        return `expected response to mention John Doe. Got:\n${responseText}`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (opa=False). Got:\n${responseText}`;
      if (!/(does not|doesn['’]t|not\s+registered|no\s+portal\s+access)/i.test(responseText))
        return `expected wording about NOT having portal access / NOT registered. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "Is John Doe registered?",
    expected: "No — John Doe is not registered (opa=False).",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1)
        return `record_count=${recordCount}, expected 1`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (opa=False). Got:\n${responseText}`;
      if (!/john\s+doe/i.test(responseText))
        return `expected response to mention John Doe. Got:\n${responseText}`;
      return "PASS";
    },
  },
  {
    q: "is priya nair registered?",
    expected: "No — Priya Nair is not registered (opa=False).",
    validate: ({ responseText, recordCount }) => {
      if (Number(recordCount) !== 1)
        return `record_count=${recordCount}, expected 1`;
      if (!/^no\b/i.test(responseText.trim()))
        return `expected response to start with 'No' (opa=False). Got:\n${responseText}`;
      if (!/priya\s+nair/i.test(responseText))
        return `expected response to mention Priya Nair. Got:\n${responseText}`;
      return "PASS";
    },
  },
];

CHECKS.push(...REGISTERED_VERB_CHECKS);

async function main(): Promise<void> {
  console.log(`Stage: ${STAGE}\n`);
  let pass = 0;
  let fail = 0;
  for (const c of CHECKS) {
    process.stdout.write(`[Q] ${c.q}\n  expect: ${c.expected}\n`);
    try {
      const out = await ask(c.q);
      const verdict = c.validate(out);
      if (verdict === "PASS") {
        pass++;
        console.log(`  → PASS  rc=${out.recordCount} | ${out.responseText.slice(0, 200).replace(/\n/g, " ")}`);
      } else {
        fail++;
        console.log(`  → FAIL  ${verdict}`);
        console.log(`     full response:\n${out.responseText.split("\n").map((l) => "       " + l).join("\n")}`);
      }
    } catch (e) {
      fail++;
      console.log(`  → ERROR ${(e as Error).message}`);
    }
    console.log("");
  }
  console.log(`\nSummary: ${pass} passed, ${fail} failed (of ${CHECKS.length})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
