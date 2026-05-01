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
    .or("first_name.ilike.john,last_name.ilike.smith")
    .order("last_name", { ascending: true });
  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }
  const rows = data ?? [];
  type Row = {
    fiduciary_id: string;
    first_name: string;
    last_name: string;
    online_portal_access: string | null;
  };
  const johns = rows.filter(
    (r) => (r as Row).first_name?.toLowerCase() === "john",
  );
  const smiths = rows.filter(
    (r) => (r as Row).last_name?.toLowerCase() === "smith",
  );
  const johnSmiths = rows.filter(
    (r) =>
      (r as Row).first_name?.toLowerCase() === "john" &&
      (r as Row).last_name?.toLowerCase() === "smith",
  );
  console.log(
    `JOHNS=${johns.length}  SMITHS=${smiths.length}  JOHN_SMITHS=${johnSmiths.length}`,
  );
  console.log("\nAll matches (first=john OR last=smith):");
  for (const r of rows as Row[]) {
    console.log(
      `  ${r.fiduciary_id} | ${r.first_name} ${r.last_name} | opa=${r.online_portal_access}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
