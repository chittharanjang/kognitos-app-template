/**
 * Inspect the full response for queries that "passed" the soft validator
 * but look semantically wrong, plus their canonical-case counterparts to
 * confirm whether the bug is case-sensitive or pre-existing.
 */
import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";
const STAGE = "AUTOMATION_STAGE_DRAFT";

interface Probe {
  label: string;
  q: string;
  expectation: string;
}

const PROBES: Probe[] = [
  // 1. Cross-DB yes/no Title Case
  {
    label: "(Title) Does John Have Any Open Accounts?",
    q: "Does John Have Any Open Accounts?",
    expectation: "Yes/No about John Doe's open accounts. NOT 'John Open not found'.",
  },
  {
    label: "(canonical) Does John have any open accounts?",
    q: "Does John have any open accounts?",
    expectation: "Yes/No about John Doe's open accounts.",
  },
  // 2. Long Paragraph Title Case
  {
    label: "(Title) Long paragraph John Smith greeting",
    q: "Hi, I Need To Check If We Have A Client Named John Smith In Our System, And If So, Could You Please Share His Email Address And Phone Number? Also, I'd Like To Know If His Profile Is Active Or Not. Thanks.",
    expectation: "Resolve John Smith → NDF (no John Smith in DB). Should NOT say 'Hi Thanks not found'.",
  },
  {
    label: "(canonical) Long paragraph John Smith greeting",
    q: "Hi, I need to check if we have a client named John Smith in our system, and if so, could you please share his email address and phone number? Also, I'd like to know if his profile is active or not. Thanks.",
    expectation: "Same as above.",
  },
  // 3. UPPERCASE count
  {
    label: "(UPPER) HOW MANY IRA ACCOUNTS ARE THERE?",
    q: "HOW MANY IRA ACCOUNTS ARE THERE?",
    expectation: "Count of IRA accounts (≈23). Should be 'Count: N record(s)' or single number.",
  },
  {
    label: "(canonical) How many IRA accounts are there?",
    q: "How many IRA accounts are there?",
    expectation: "Count of IRA accounts (≈23).",
  },
  // 4. Multi-question with case permutation
  {
    label: "(sPoNgE) multi-Q active + Roth IRA list",
    q: "hOw MaNy AcTiVe ClIeNtS aRe ThErE? aNd CaN yOu ShArE tHe LiSt Of ClIeNtS wItH rOtH iRa AcCoUnTs?",
    expectation: "1. count active clients. 2. list Roth IRA clients. Sub-questions independent.",
  },
  {
    label: "(canonical) multi-Q active + Roth IRA list",
    q: "How many active clients are there? And can you share the list of clients with Roth IRA accounts?",
    expectation: "Same as above.",
  },
  // 5. Data Governance "export all client information"
  {
    label: "(Sentence) Export all client information.",
    q: "Export all client information.",
    expectation: "Export-style — should yield 26 clients. rc=1 would be wrong.",
  },
];

async function probe(p: Probe): Promise<void> {
  console.log("─".repeat(80));
  console.log(`Q: ${p.label}`);
  console.log(`   ${p.q}`);
  console.log(`Expect: ${p.expectation}`);
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    {
      "User Query": { text: p.q },
      "Requester Email": { text: "diag@local" },
    },
    STAGE,
  );
  if (!inv.runId) {
    console.log(`   → invoke failed: ${inv.error}`);
    return;
  }
  const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  if (r.status !== "completed") {
    console.log(`   → status=${r.status}  ${r.error ?? ""}`);
    return;
  }
  console.log(
    `   rc=${r.outputs.record_count} qt=${r.outputs.query_type} dbs=${JSON.stringify(r.outputs.databases_queried)}`,
  );
  console.log(`   response_text:`);
  const text = String(r.outputs.response_text ?? "");
  for (const line of text.split("\n").slice(0, 18)) {
    console.log(`     ${line}`);
  }
  if (text.split("\n").length > 18) {
    console.log(`     [... ${text.split("\n").length - 18} more lines ...]`);
  }
}

async function main(): Promise<void> {
  for (const p of PROBES) {
    await probe(p);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
