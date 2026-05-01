import "dotenv/config";
import { runSpy } from "../lib/spy";

/**
 * Pull every CLIENTS_FIDO client whose first_name=John or last_name=Smith
 * (case-insensitive). Used to verify the DB Agent does an exact full-name
 * match for "Does John Smith have portal access?" instead of returning
 * every John or every Smith.
 */
const CODE = `
resp = kognitos.fido.snowflake.discover_list_x7Cclients_fido_x5E_x28table_x2Fclients_fido_x29()
rows = resp["answer"]
johns = []
smiths = []
john_smith = []
for r in rows:
    fid = str(r.get("fiduciary_id", ""))
    fn = str(r.get("first_name", "")).strip()
    ln = str(r.get("last_name", "")).strip()
    opa = str(r.get("online_portal_access", "")).strip()
    line = fid + " | " + fn + " " + ln + " | opa=" + opa
    fn_l = fn.lower()
    ln_l = ln.lower()
    if fn_l == "john":
        johns.append(line)
    if ln_l == "smith":
        smiths.append(line)
    if fn_l == "john" and ln_l == "smith":
        john_smith.append(line)
header = (
    "JOHNS=" + str(len(johns))
    + " SMITHS=" + str(len(smiths))
    + " JOHN_SMITHS=" + str(len(john_smith))
)
body = (
    "JOHN rows:\\n" + "\\n".join(johns)
    + "\\n\\nSMITH rows:\\n" + "\\n".join(smiths)
    + "\\n\\nJOHN SMITH rows:\\n" + "\\n".join(john_smith)
)
set_output("dump", value=header + "\\n" + body)
`;

async function main(): Promise<void> {
  const r = await runSpy(CODE, {
    snowflake: { connection_id: "snowflake-ls88n" },
  });
  console.log(r.outputs.dump?.text ?? JSON.stringify(r, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
