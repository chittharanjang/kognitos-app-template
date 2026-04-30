import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

const QUESTIONS = [
  "Give me clients who have deactivated profiles but still have open accounts, along with their email and phone.",
  "Give me the count of all clients. Also, list all clients with locked profiles. And export all active client data to a file.",
  "Is F1005 a valid client? What accounts does F1005 hold? What is F1005's profile status?",
];

async function runOne(q: string, attempt: number): Promise<string> {
  const t0 = Date.now();
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    { "User Query": { text: q }, "Requester Email": { text: "verify@example.com" } },
    "AUTOMATION_STAGE_DRAFT",
  );
  if (!inv.runId) return `INVOKE FAIL: ${inv.error}`;
  const res = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  const ms = Date.now() - t0;
  let answer = "";
  for (const [k, v] of Object.entries(res.outputs)) {
    if (k.toLowerCase().includes("response")) {
      answer = typeof v === "string" ? v : JSON.stringify(v);
      break;
    }
  }
  return `[attempt ${attempt}] ${res.status} ${ms}ms ${answer.slice(0, 200).replace(/\n+/g, " ↵ ")}`;
}

async function main(): Promise<void> {
  for (const q of QUESTIONS) {
    console.log(`\n=== ${q.slice(0, 80)} ===`);
    for (let i = 1; i <= 2; i++) {
      try {
        const r = await runOne(q, i);
        console.log(r);
        if (r.includes("completed")) break;
      } catch (e: unknown) {
        console.log(`[attempt ${i}] ERR: ${(e as Error).message}`);
      }
    }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
