import "dotenv/config";
import { runSpy } from "../lib/spy";

/**
 * One-shot spy-code execution to verify ground truth for the
 * "unregistered clients" question. Dumps every CLIENTS_FIDO row with
 *   - FIDUCIARY_ID
 *   - REGISTRATION
 *   - ONLINE_PORTAL_ACCESS
 * so we can compare the DB Agent's answer (which uses REGISTRATION) against
 * the user's stated ground truth (ONLINE_PORTAL_ACCESS = false → unregistered).
 */

const CODE = `
resp = kognitos.fido.snowflake.discover_list_x7Cclients_fido_x5E_x28table_x2Fclients_fido_x29()
rows = resp["answer"]
out = []
total = 0
reg_true = 0
reg_false = 0
opa_true = 0
opa_false = 0
mismatch = 0
for r in rows:
    total = total + 1
    fid = str(r.get("fiduciary_id", ""))
    fn = str(r.get("first_name", ""))
    ln = str(r.get("last_name", ""))
    reg = str(r.get("registration", ""))
    opa = str(r.get("online_portal_access", ""))
    out.append(fid + " | " + fn + " " + ln + " | reg=" + reg + " | opa=" + opa)
    if reg.lower() == "true":
        reg_true = reg_true + 1
    if reg.lower() == "false":
        reg_false = reg_false + 1
    if opa.lower() == "true":
        opa_true = opa_true + 1
    if opa.lower() == "false":
        opa_false = opa_false + 1
    if reg.lower() != opa.lower():
        mismatch = mismatch + 1
header = (
    "TOTAL=" + str(total)
    + " REG_TRUE=" + str(reg_true)
    + " REG_FALSE=" + str(reg_false)
    + " OPA_TRUE=" + str(opa_true)
    + " OPA_FALSE=" + str(opa_false)
    + " MISMATCH=" + str(mismatch)
)
set_output("dump", value=header + "\\n" + "\\n".join(out))
`;

async function main(): Promise<void> {
  const result = await runSpy(CODE, {
    snowflake: { connection_id: "snowflake-ls88n" },
  });
  const out = result.outputs.dump?.text ?? "";
  console.log(out);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
