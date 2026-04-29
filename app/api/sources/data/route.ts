import { NextResponse } from "next/server";
import { supabaseAdmin, TABLES } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/sources/data?table=<key>&limit=&offset=&search=&sort=&order=asc|desc
 *
 * Generic, whitelisted reader for the source-mirror tables. Used by the /data
 * explorer page. The set of allowed tables and the columns that are valid for
 * sort / search are hard-coded server-side so the endpoint can never query an
 * arbitrary table.
 */

interface TableSpec {
  /** Stable URL key (e.g. "fido_clients") and matching Supabase table name. */
  key: string;
  /** Display columns in the order to show them. First column is the default sort. */
  columns: { name: string; label: string; type: "string" | "number" }[];
  /** Columns the `search` parameter is allowed to filter on (case-insensitive ILIKE). */
  searchableColumns: string[];
}

const SPECS: TableSpec[] = [
  {
    key: TABLES.fidoClients,
    columns: [
      { name: "fiduciary_id", label: "Fiduciary ID", type: "string" },
      { name: "first_name", label: "First name", type: "string" },
      { name: "last_name", label: "Last name", type: "string" },
      { name: "primary_email", label: "Email", type: "string" },
      { name: "mobile_phone", label: "Phone", type: "string" },
      { name: "ssn_last4digits", label: "SSN (last 4)", type: "string" },
      { name: "date_of_birth_or_inception", label: "DOB / inception", type: "string" },
      { name: "online_portal_access", label: "Portal access", type: "string" },
    ],
    searchableColumns: [
      "fiduciary_id",
      "first_name",
      "last_name",
      "primary_email",
      "mobile_phone",
    ],
  },
  {
    key: TABLES.fidoClientAddress,
    columns: [
      { name: "fiduciary_id", label: "Fiduciary ID", type: "string" },
      { name: "postal_code", label: "Postal code", type: "string" },
    ],
    searchableColumns: ["fiduciary_id", "postal_code"],
  },
  {
    key: TABLES.wealthxAccountDetails,
    columns: [
      { name: "fiduciary_id", label: "Fiduciary ID", type: "string" },
      { name: "account_number", label: "Account #", type: "string" },
      { name: "account_status", label: "Status", type: "string" },
      { name: "account_type", label: "Type", type: "string" },
    ],
    searchableColumns: [
      "fiduciary_id",
      "account_number",
      "account_status",
      "account_type",
    ],
  },
  {
    key: TABLES.azureProfileStatus,
    columns: [
      { name: "fiduciary_id", label: "Fiduciary ID", type: "string" },
      { name: "profile_status", label: "Status", type: "string" },
    ],
    searchableColumns: ["fiduciary_id", "profile_status"],
  },
];

const SPEC_BY_KEY = new Map(SPECS.map((s) => [s.key, s]));

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const table = url.searchParams.get("table") ?? "";
  const spec = SPEC_BY_KEY.get(table);

  if (!spec) {
    return NextResponse.json(
      {
        error: `Unknown or disallowed table: "${table}"`,
        validTables: SPECS.map((s) => s.key),
      },
      { status: 400 }
    );
  }

  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
  const offsetRaw = parseInt(url.searchParams.get("offset") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, limitRaw))
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const search = (url.searchParams.get("search") ?? "").trim();

  const sort = url.searchParams.get("sort") ?? spec.columns[0].name;
  const order = (url.searchParams.get("order") ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";

  const validColumnNames = new Set(spec.columns.map((c) => c.name));
  const sortColumn = validColumnNames.has(sort) ? sort : spec.columns[0].name;

  const columnList = spec.columns.map((c) => c.name).join(", ");

  let query = supabaseAdmin
    .from(spec.key)
    .select(columnList, { count: "exact" })
    .order(sortColumn, { ascending: order === "asc" })
    .range(offset, offset + limit - 1);

  if (search) {
    // Build an OR over ILIKE filters across the whitelisted searchable columns.
    // Escape PostgREST's special characters (",", "(", ")") inside the value.
    const safe = search.replace(/[(),]/g, " ").trim();
    if (safe) {
      const orFilter = spec.searchableColumns
        .map((c) => `${c}.ilike.*${safe}*`)
        .join(",");
      query = query.or(orFilter);
    }
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Query failed: ${error.message}` },
      { status: 500 }
    );
  }

  // Pull the latest load timestamp for this table so the UI can show "Loaded 5m ago".
  const { data: latestLoad } = await supabaseAdmin
    .from(TABLES.sourceLoadRuns)
    .select("started_at, completed_at, status, row_count")
    .eq("table_name", spec.key)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    table: spec.key,
    columns: spec.columns,
    rows: data ?? [],
    total: count ?? 0,
    limit,
    offset,
    sort: sortColumn,
    order,
    search,
    latestLoad: latestLoad ?? null,
  });
}
