export interface SopStep {
  step: number;
  title: string;
  description: string;
}

export interface IntegrationTable {
  name: string;
  columns: string[];
}

export interface IntegrationDef {
  name: string;
  platform: string;
  purpose: string;
  tables: IntegrationTable[];
}

export interface AutomationSopProfile {
  steps: SopStep[];
  integrations: IntegrationDef[];
  joinKey?: string;
}

const FIDO_INTEGRATION: IntegrationDef = {
  name: "FIDO",
  platform: "Snowflake",
  purpose: "Client personal and contact information",
  tables: [
    {
      name: "CLIENTS_FIDO",
      columns: [
        "FIDUCIARY_ID",
        "FIRST_NAME",
        "LAST_NAME",
        "SSN_LAST4DIGITS",
        "DATE_OF_BIRTH_OR_INCEPTION",
        "PRIMARY_EMAIL",
        "MOBILE_PHONE",
        "ONLINE_PORTAL_ACCESS",
      ],
    },
    {
      name: "CLIENT_ADDRESS",
      columns: ["FIDUCIARY_ID", "POSTAL_CODE"],
    },
  ],
};

const WEALTHX_INTEGRATION: IntegrationDef = {
  name: "WealthX",
  platform: "Snowflake",
  purpose: "Account and financial information",
  tables: [
    {
      name: "ACCOUNT_DETAILS",
      columns: ["FIDUCIARY_ID", "ACCOUNT_NUMBER", "ACCOUNT_STATUS", "ACCOUNT_TYPE"],
    },
  ],
};

const PROFILE_STATUS_INTEGRATION: IntegrationDef = {
  name: "Profile Status",
  platform: "Azure SQL",
  purpose: "Client profile activity status",
  tables: [
    {
      name: "PROFILE_STATUS",
      columns: ["FIDUCIARY_ID", "PROFILE_STATUS"],
    },
  ],
};

const OPENAI_INTEGRATION: IntegrationDef = {
  name: "OpenAI",
  platform: "OpenAI",
  purpose: "AI-driven query plan generation",
  tables: [
    {
      name: "(LLM)",
      columns: ["execution plan", "JSON contract"],
    },
  ],
};

const SQL_QUERY_GENERATOR_SOP: AutomationSopProfile = {
  joinKey: "FIDUCIARY_ID",
  steps: [
    {
      step: 1,
      title: "Receive natural-language question",
      description:
        "The user submits a plain English question via the Query Assistant UI. The system captures the raw text and passes it to the automation as an input parameter.",
    },
    {
      step: 2,
      title: "Parse intent and identify target databases",
      description:
        "The automation analyzes the question to determine which databases are relevant (FIDO, WealthX, Profile Status) and what type of answer is expected (Yes/No, count, list, lookup, or aggregation).",
    },
    {
      step: 3,
      title: "Generate SQL queries",
      description:
        "Based on the parsed intent, one or more SQL queries are dynamically constructed. Cross-database joins use the shared FIDUCIARY_ID key. Restricted columns like ONLINE_PORTAL_ACCESS are excluded unless explicitly requested.",
    },
    {
      step: 4,
      title: "Execute queries against connected databases",
      description:
        "Queries are executed against the appropriate databases: Snowflake (FIDO, WealthX) and Azure SQL (Profile Status). Results are collected in parallel when multiple databases are involved.",
    },
    {
      step: 5,
      title: "Assemble structured response",
      description:
        "Raw query results are transformed into a structured response including: response text, generated SQL, applied WHERE clauses, row counts, sub-query counts, and tabular data (encoded as Apache Arrow IPC).",
    },
    {
      step: 6,
      title: "Return results to the UI",
      description:
        "The completed run outputs are decoded and rendered in the Query Assistant as a chat-style result card with expandable sections for SQL, filters, and data tables.",
    },
  ],
  integrations: [FIDO_INTEGRATION, WEALTHX_INTEGRATION, PROFILE_STATUS_INTEGRATION],
};

const AMA_AGENT_SOP: AutomationSopProfile = {
  joinKey: "FIDUCIARY_ID",
  steps: [
    {
      step: 1,
      title: "Decompose the user query into sub-questions",
      description:
        "Splits the natural-language input on distinct, complete questions only — relative clauses and conjunctions on the same subject (e.g. 'active clients who have IRA accounts') are kept together by a post-parse merge step.",
    },
    {
      step: 2,
      title: "Generate AI execution plan (LLM)",
      description:
        "OpenAI emits a strict JSON plan: query_type (yes_no | count | data_retrieval | breakdown | single_value), databases (snowflake / wealthx / mssql), columns, filters, column_filters, intersection_filters, aggregation. The plan is the contract the rest of the pipeline operates on.",
    },
    {
      step: 3,
      title: "Apply code-level defenses",
      description:
        "Compensates for AI plan inconsistencies. Detects FID tokens (F1005), profile-status keywords (active/deactivated/inactive/locked), account-type synonyms (IRA, Estate, Investment), contact-info phrases, and force-adds the right databases plus filter rows. Disambiguates 'active clients' (profile_status) vs 'open accounts' (account_status). Skips registration filters as no-ops since the column is not exposed by FIDO.",
    },
    {
      step: 4,
      title: "Query the relevant databases",
      description:
        "Calls FIDO (Snowflake), WealthX (Snowflake), and Profile Status (Azure SQL) via Kognitos book procedures, in parallel. Joins MSSQL profile_status onto FIDO base rows, then joins WealthX accounts onto the result.",
    },
    {
      step: 5,
      title: "Run the row-filter pipeline",
      description:
        "Iterates plan.filters and plan.column_filters with case-insensitive column matching and alias canonicalization (PROFILE_STATUS_ID → profile_status). Applies intersection_filters only when ALL items target account_type (e.g. BOTH IRA AND Investment); otherwise migrates them into the regular column-filter loop.",
    },
    {
      step: 6,
      title: "Compose the response via specialized branches",
      description:
        "First-match wins: count-clients-multi → breakdown → regular count → yes_no (entity-aware narrowing) → distinct-values → single_value → data_retrieval table. Each branch sets composed_done so downstream branches don't overwrite.",
    },
    {
      step: 7,
      title: "Emit structured outputs",
      description:
        "Returns response_text (plain English), query_type, record_count, generated_sql, databases_queried, sub_questions, csv_data, and query_result (Apache Arrow IPC). The UI renders these as a chat card with a CSV download button when tabular data is present.",
    },
  ],
  integrations: [
    FIDO_INTEGRATION,
    WEALTHX_INTEGRATION,
    PROFILE_STATUS_INTEGRATION,
    OPENAI_INTEGRATION,
  ],
};

export function getAutomationSop(
  automationId: string,
): AutomationSopProfile | null {
  if (
    automationId === "7NMPU5tknPoocOFoLfRss" ||
    automationId === "HKk8dAUxXhsVqeRC4fvaT"
  )
    return SQL_QUERY_GENERATOR_SOP;
  if (automationId === "mC3GaXQfTaca9mVUSziGW") return AMA_AGENT_SOP;
  return null;
}

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  mC3GaXQfTaca9mVUSziGW: "DB Agent",
};

export function getAutomationDisplayName(
  automationId: string,
  fallback: string,
): string {
  return DISPLAY_NAME_OVERRIDES[automationId] ?? fallback;
}
