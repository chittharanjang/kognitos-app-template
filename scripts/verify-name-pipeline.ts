import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

type Case = { id: string; q: string; expect: string };

const CASES: Case[] = [
  { id: "Q1", q: "Give me Sarah's phone number.", expect: "no client / not found / sarah" },
  { id: "Q2", q: "What is John's phone number?", expect: "John (F1031), mobile_phone 5552019001 — NOT Liam Johnson, NOT Priya" },
  { id: "Q3", q: "What is John Doe's phone number?", expect: "F1031 mobile/home phone (NOT Priya)" },
  { id: "Q4", q: "What is Priya's email and What is John's phone number?", expect: "Both Priya email AND John phone, with correct labels" },
  { id: "Q5", q: "What is Priya's email?", expect: "Priya - primary email priya.nair@mail.com" },
  { id: "Q6", q: "What is the market value of F1006?", expect: "F1006's market value (numeric)" },
  { id: "Q7", q: "Is Sarah's profile currently active?", expect: "No — Sarah not found" },
];

async function runOne(c: Case): Promise<void> {
  const t0 = Date.now();
  try {
    const inv = await invokeAutomation(
      AUTOMATION_ID,
      {
        "User Query": { text: c.q },
        "Requester Email": { text: "verify@example.com" },
      },
      "AUTOMATION_STAGE_DRAFT",
    );
    if (!inv.runId) {
      console.log(`\n[${c.id}] INVOKE FAILED: ${inv.error}`);
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
      `\n[${c.id}] (${res.status}, ${ms}ms) ${c.q}\n  expect: ${c.expect}\n  got:    ${answer.slice(0, 800).replace(/\n+/g, " ↵ ")}`,
    );
  } catch (e: unknown) {
    console.log(`\n[${c.id}] ERROR: ${(e as Error).message}`);
  }
}

async function main(): Promise<void> {
  console.log(`Running ${CASES.length} verification queries against AMAAgent DRAFT in parallel...`);
  await Promise.all(CASES.map(runOne));
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
