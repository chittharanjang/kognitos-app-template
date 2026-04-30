import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

const QUESTIONS = [
  "What is the market value of F1005?",
  "What is the market value of F1031?",
  "What is the market value of F1006?",
  "Show me F1006 details.",
  "How many clients have a market value over 1 million?",
  "Show me the top 5 clients by market value.",
  "What is John Doe's email?",
  "Is John's profile currently active?",
];

async function runOne(q: string): Promise<void> {
  const t0 = Date.now();
  try {
    const inv = await invokeAutomation(
      AUTOMATION_ID,
      { "User Query": { text: q }, "Requester Email": { text: "verify@example.com" } },
      "AUTOMATION_STAGE_DRAFT",
    );
    if (!inv.runId) {
      console.log(`\n[INVOKE FAIL] ${q}\n  ${inv.error}`);
      return;
    }
    const res = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
    const ms = Date.now() - t0;
    let answer = "";
    for (const [k, v] of Object.entries(res.outputs)) {
      if (k.toLowerCase().includes("response") || k.toLowerCase().includes("answer")) {
        answer = typeof v === "string" ? v : JSON.stringify(v);
        break;
      }
    }
    if (!answer) answer = JSON.stringify(res.outputs).slice(0, 500);
    console.log(
      `\n[${res.status} ${ms}ms] ${q}\n  ${answer.slice(0, 600).replace(/\n+/g, " ↵ ")}`,
    );
  } catch (e: unknown) {
    console.log(`\n[ERR] ${q}: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log(`Running ${QUESTIONS.length} regression checks against AMAAgent DRAFT in parallel...`);
  await Promise.all(QUESTIONS.map(runOne));
  console.log("\nDone.");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
