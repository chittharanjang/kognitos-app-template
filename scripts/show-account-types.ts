import "dotenv/config";
import { invokeAutomation, pollRun } from "../lib/kognitos";
import { tableFromIPC } from "apache-arrow";

const AUTOMATION_ID = "mC3GaXQfTaca9mVUSziGW";

async function ask(q: string): Promise<{ rows: Record<string, unknown>[]; responseText: string }>{
  const inv = await invokeAutomation(
    AUTOMATION_ID,
    { "User Query": { text: q }, "Requester Email": { text: "ama-test@example.com" } },
    "AUTOMATION_STAGE_PUBLISHED",
  );
  if (!inv.runId) throw new Error(inv.error);
  const r = await pollRun(AUTOMATION_ID, inv.runId, 180_000, 2000);
  if (r.status !== "completed") throw new Error(`status=${r.status} ${r.error ?? ""}`);
  const responseText = String(r.outputs.response_text ?? "");
  const qr = r.outputs.query_result as { table?: { inline?: { data?: string } } } | undefined;
  const b64 = qr?.table?.inline?.data;
  const rows: Record<string, unknown>[] = [];
  if (b64) {
    const t = tableFromIPC(Buffer.from(b64, "base64"));
    for (let i = 0; i < t.numRows; i++) {
      const row: Record<string, unknown> = {};
      for (const f of t.schema.fields) {
        const v = t.getChild(f.name)?.get(i);
        row[f.name] = typeof v === "bigint" ? Number(v) : v;
      }
      rows.push(row);
    }
  }
  return { rows, responseText };
}

async function main(): Promise<void> {
  console.log("Querying WealthX for account types and counts...\n");
  const { rows } = await ask("List all accounts with their account type and account status.");

  if (rows.length === 0) {
    console.log("No rows decoded. Check arrow output.");
    return;
  }

  console.log(`Decoded ${rows.length} account rows. Columns: ${Object.keys(rows[0]).join(", ")}\n`);

  const totals = new Map<string, { open: number; closed: number; other: number; total: number }>();
  for (const r of rows) {
    const t = String(r.account_type ?? "").trim() || "(unknown)";
    const s = String(r.account_status ?? "").trim().toLowerCase();
    if (!totals.has(t)) totals.set(t, { open: 0, closed: 0, other: 0, total: 0 });
    const b = totals.get(t)!;
    b.total++;
    if (s === "open") b.open++;
    else if (s === "closed") b.closed++;
    else b.other++;
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1].total - a[1].total);
  console.log("Account Type                          | Total | Open | Closed | Other");
  console.log("--------------------------------------|------:|-----:|-------:|-----:");
  for (const [type, b] of sorted) {
    console.log(`${type.padEnd(38)}| ${String(b.total).padStart(5)} | ${String(b.open).padStart(4)} | ${String(b.closed).padStart(6)} | ${String(b.other).padStart(5)}`);
  }
  console.log(`\nDistinct account types: ${sorted.length}`);
  console.log(`Total accounts: ${rows.length}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
