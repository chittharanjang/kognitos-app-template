import "dotenv/config";
import { supabaseAdmin } from "../lib/supabase";

async function main(): Promise<void> {
  if (!supabaseAdmin) {
    console.error("Supabase service role missing.");
    process.exit(1);
  }
  const { data, error } = await supabaseAdmin
    .from("fido_clients")
    .select("fiduciary_id, first_name, last_name, online_portal_access")
    .order("fiduciary_id", { ascending: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  type Row = {
    fiduciary_id: string;
    first_name: string;
    last_name: string;
    online_portal_access: string | null;
  };
  const rows = (data ?? []) as Row[];
  const registered = rows.filter(
    (r) => String(r.online_portal_access).toLowerCase() === "true",
  );
  const unregistered = rows.filter(
    (r) => String(r.online_portal_access).toLowerCase() === "false",
  );
  console.log(`TOTAL=${rows.length}  REGISTERED=${registered.length}  UNREGISTERED=${unregistered.length}\n`);
  console.log("Registered clients (opa=True):");
  for (const r of registered) {
    console.log(`  ${r.fiduciary_id} | ${r.first_name} ${r.last_name}`);
  }
  console.log("\nUnregistered clients (opa=False):");
  for (const r of unregistered) {
    console.log(`  ${r.fiduciary_id} | ${r.first_name} ${r.last_name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
