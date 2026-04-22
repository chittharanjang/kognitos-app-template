"use client";

import { useState } from "react";
import { Title, Text, Icon, Badge } from "@kognitos/lattice";

interface QueryCategory {
  title: string;
  description: string;
  dbTags: string[];
  queries: string[];
}

const QUERY_CATEGORIES: QueryCategory[] = [
  {
    title: "Yes/No Questions (Single DB)",
    description:
      "Concise Yes/No answer in email body. No file attachment.",
    dbTags: ["FIDO", "Profile Status"],
    queries: [
      "Is John registered in the system?",
      "Are there any clients in the database?",
      "Is F1005 a valid unregistered client?",
      "Is Sarah's profile currently active?",
      "Does the client with FIDUCIARY_ID F1010 exist?",
      "Is there any client with a locked profile?",
      "Are there any deactivated profiles in the system?",
    ],
  },
  {
    title: "Yes/No Questions (Cross-DB)",
    description:
      "Concise Yes/No answer requiring joins across databases.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Does John have any open accounts?",
      "Is the client F1005 an active client with an IRA account?",
      "Are there any clients with active profiles and Roth IRA accounts?",
      "Does Sarah have both an active profile and an open account?",
      "Is there any unregistered client who holds an Estate account?",
    ],
  },
  {
    title: "Direct Specific Information",
    description:
      "Return only the specific requested value in the email body. No extra columns. No attachment.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "What is John's email ID?",
      "Give me Sarah's phone number.",
      "What is the SSN of client F1005?",
      "What is the date of birth of client John Smith?",
      "What is the postal code for client F1010?",
      "What is the profile status of client F1005?",
      "What is the account number of John's account?",
    ],
  },
  {
    title: "Specific Column Requests",
    description:
      "Return only the requested columns in structured format. Exclude restricted columns (e.g., ONLINE_PORTAL_ACCESS) unless explicitly asked.",
    dbTags: ["FIDO"],
    queries: [
      "Share client details with phone number and email.",
      "Give me first name, last name, and SSN for all clients.",
      "Show me the name and email of all clients.",
      "List all clients with their first name, last name, and date of birth.",
      "Give me client names and their postal codes.",
      "Show me client names, phone numbers, and online portal access status.",
    ],
  },
  {
    title: "Full Table / List / File Requests",
    description:
      "Generate CSV file attachment for large datasets. Use standard business-safe columns if user doesn't specify. Exclude ONLINE_PORTAL_ACCESS unless explicitly requested.",
    dbTags: ["FIDO", "WealthX"],
    queries: [
      "Give me the list of all unregistered users.",
      "Share the file of registered clients.",
      "Export client data.",
      "Give me a list of all clients.",
      "Export all client details to a file.",
      "Share the complete list of clients with their account details.",
    ],
  },
  {
    title: "Single DB Queries - FIDO",
    description: "Query only the FIDO database (client personal/contact info).",
    dbTags: ["FIDO"],
    queries: [
      "Show me all clients whose last name is Smith.",
      "List all clients born before 1990.",
      "Give me the list of clients who have online portal access.",
      "How many clients are in the system?",
      "Show me clients from postal code 10001.",
      "List all client email addresses.",
    ],
  },
  {
    title: "Single DB Queries - WealthX",
    description:
      "Query only the WealthX database (account/financial info).",
    dbTags: ["WealthX"],
    queries: [
      "Show me all open accounts.",
      "How many IRA accounts are there?",
      "List all accounts of type Roth IRA.",
      "Give me the count of closed accounts.",
      "Show all account types available in the system.",
      "List all accounts for client F1005.",
      "How many Estate accounts are currently open?",
    ],
  },
  {
    title: "Single DB Queries - Profile Status",
    description:
      "Query only the Profile Status database (Azure SQL).",
    dbTags: ["Profile Status"],
    queries: [
      "How many active profiles are there?",
      "List all clients with locked profiles.",
      "Show me all deactivated users.",
      "What is the distribution of profile statuses?",
      "Give me the count of profiles by status.",
    ],
  },
  {
    title: "Cross-Database Joins (Two DBs)",
    description:
      "Dynamically join two databases using FIDUCIARY_ID.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Show clients with active accounts and their contact details.",
      "Give me the list of active clients who have IRA accounts.",
      "List all clients with their profile status and email.",
      "Show me clients with open accounts and their phone numbers.",
      "Give me clients with locked profiles and their account details.",
    ],
  },
  {
    title: "Cross-Database Joins (Three DBs)",
    description:
      "Dynamically join all three databases using FIDUCIARY_ID.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Give me the list of active users who have open accounts along with their contact details.",
      "Show clients with active profiles, IRA accounts, and their email addresses.",
      "List all clients with their profile status, account types, and contact information.",
      "Give me clients who have deactivated profiles but still have open accounts, along with their email and phone.",
    ],
  },
  {
    title: "IRA Account Type Handling",
    description:
      'Generic "IRA" returns all IRA variants. An exact type like "Roth IRA" returns only that type.',
    dbTags: ["WealthX"],
    queries: [
      "Give me the list of clients who have IRA accounts.",
      "List clients with Roth IRA accounts.",
      "Show me all clients with Traditional IRA accounts.",
      "Give me clients with Inherited Roth IRA accounts.",
      "How many clients have IRA accounts?",
      "How many clients have Roth IRA accounts specifically?",
    ],
  },
  {
    title: "Multiple Questions in Single Email",
    description:
      "Break into separate logical parts, process each independently, respond in structured numbered sections.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Is John registered? Also give me his email ID.",
      "How many active clients are there? And can you share the list of clients with Roth IRA accounts?",
      "What is Sarah's phone number? Is her profile active? Does she have any open accounts?",
      "Give me the count of all clients. Also, list all clients with locked profiles. And export all active client data to a file.",
      "Is F1005 a valid client? What accounts does F1005 hold? What is F1005's profile status?",
      "Are there any unregistered clients? If yes, give me their names and email addresses.",
    ],
  },
  {
    title: "Ambiguous / Poorly Structured Queries",
    description:
      "The system must infer intent from unclear or informal queries.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "john email?",
      "clients with ira",
      "anyone locked out?",
      "all data for F1005",
      "tell me about sarah",
      "who has roth",
      "active ones with accounts",
      "give me everything",
      "unregistered + ira",
      "whats johns status",
    ],
  },
  {
    title: "Long Paragraph Queries",
    description: "Parse intent from a verbose paragraph.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Hi, I need to check if we have a client named John Smith in our system, and if so, could you please share his email address and phone number? Also, I'd like to know if his profile is active or not. Thanks.",
      "I was wondering if you could pull up the list of all our clients who currently have IRA accounts and are still active in the system. If possible, please include their names and email addresses in the response.",
      "We are doing an audit and need to verify all clients whose profiles are currently locked. Please share their details including name, email, account numbers and account types.",
    ],
  },
  {
    title: "No Data Found Scenarios",
    description:
      'Respond professionally: "No records were found based on the provided criteria." Never leave blank, never expose SQL errors.',
    dbTags: ["FIDO", "WealthX"],
    queries: [
      'Show me clients with the last name "Xyzzynotexist".',
      "Is there a client with FIDUCIARY_ID F9999?",
      'List all clients with account type "Crypto Wallet".',
      'Give me details for client "NonexistentPerson".',
    ],
  },
  {
    title: "Data Governance / Security Edge Cases",
    description:
      "Exclude ONLINE_PORTAL_ACCESS unless explicitly requested. No schema names or SQL exposed.",
    dbTags: ["FIDO"],
    queries: [
      "Give me all details for client John.",
      "Export all client information.",
      "Show me client John's online portal access status.",
      "Share client details including their online portal access.",
    ],
  },
  {
    title: "Composite / Complex Business Queries",
    description:
      "Sample queries listed in the POC document itself.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "Show clients with active accounts and contact details.",
      "Give me the list of active clients who have IRA accounts.",
      "Give me the list of active users who have open accounts.",
      "Give me the list of unregistered clients who have IRA accounts.",
      "Give me the list of clients who have both open IRA accounts and Investment accounts.",
    ],
  },
  {
    title: "Aggregation / Count Queries",
    description: "Queries requiring COUNT, GROUP BY, or summary aggregations.",
    dbTags: ["FIDO", "WealthX", "Profile Status"],
    queries: [
      "How many clients are registered in the system?",
      "What is the total number of open accounts?",
      "How many clients have more than one account?",
      "What is the breakdown of account types across all clients?",
    ],
  },
];

const DB_SCHEMA = [
  {
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
  },
  {
    name: "WealthX",
    platform: "Snowflake",
    purpose: "Account and financial information",
    tables: [
      {
        name: "ACCOUNT_DETAILS",
        columns: [
          "FIDUCIARY_ID",
          "ACCOUNT_NUMBER",
          "ACCOUNT_STATUS",
          "ACCOUNT_TYPE",
        ],
      },
    ],
  },
  {
    name: "Profile Status",
    platform: "Azure SQL",
    purpose: "Client profile activity status",
    tables: [
      {
        name: "PROFILE_STATUS",
        columns: ["FIDUCIARY_ID", "PROFILE_STATUS"],
      },
    ],
  },
];

function dbBadgeVariant(db: string): "default" | "secondary" | "outline" {
  switch (db) {
    case "FIDO":
      return "default";
    case "WealthX":
      return "secondary";
    case "Profile Status":
      return "outline";
    default:
      return "secondary";
  }
}

export default function GuidePage() {
  const [openSections, setOpenSections] = useState<Set<number>>(new Set());

  function toggleSection(idx: number) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function expandAll() {
    setOpenSections(new Set(QUERY_CATEGORIES.map((_, i) => i)));
  }

  function collapseAll() {
    setOpenSections(new Set());
  }

  const totalQueries = QUERY_CATEGORIES.reduce(
    (sum, cat) => sum + cat.queries.length,
    0
  );

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <Title level="h2">User Guide</Title>
        <Text level="small" color="muted">
          Sample queries organized by category &middot; {totalQueries} queries
          across {QUERY_CATEGORIES.length} categories
        </Text>
      </div>

      {/* Database Schema Reference */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Icon type="Database" size="sm" className="text-muted-foreground" />
          <Text level="base" className="font-semibold">
            Database Schema Reference
          </Text>
        </div>
        <Text level="xSmall" color="muted">
          All databases are connected via the shared key{" "}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">
            FIDUCIARY_ID
          </code>
        </Text>
        <div className="grid gap-3 sm:grid-cols-3">
          {DB_SCHEMA.map((db) => (
            <div
              key={db.name}
              className="rounded-md border border-border p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <Text level="small" className="font-semibold">
                  {db.name}
                </Text>
                <Badge variant={dbBadgeVariant(db.name)}>{db.platform}</Badge>
              </div>
              <Text level="xSmall" color="muted">
                {db.purpose}
              </Text>
              {db.tables.map((table) => (
                <div key={table.name} className="space-y-1">
                  <Text level="xSmall" className="font-mono font-medium">
                    {table.name}
                  </Text>
                  <div className="flex flex-wrap gap-1">
                    {table.columns.map((col) => (
                      <span
                        key={col}
                        className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Expand / Collapse controls */}
      <div className="flex gap-2">
        <button
          onClick={expandAll}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          Collapse All
        </button>
      </div>

      {/* Query Categories */}
      <div className="space-y-3">
        {QUERY_CATEGORIES.map((category, catIdx) => {
          const isOpen = openSections.has(catIdx);
          return (
            <div
              key={catIdx}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <button
                onClick={() => toggleSection(catIdx)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {catIdx + 1}
                  </span>
                  <div className="min-w-0">
                    <Text level="small" className="font-semibold">
                      {category.title}
                    </Text>
                    <Text level="xSmall" color="muted" className="mt-0.5">
                      {category.queries.length} quer{category.queries.length === 1 ? "y" : "ies"}
                    </Text>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="hidden sm:flex gap-1">
                    {category.dbTags.map((tag) => (
                      <Badge key={tag} variant={dbBadgeVariant(tag)}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <Icon
                    type="ChevronDown"
                    size="sm"
                    className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                  <Text level="xSmall" color="muted" className="mb-3">
                    {category.description}
                  </Text>
                  <div className="sm:hidden flex flex-wrap gap-1 mb-3">
                    {category.dbTags.map((tag) => (
                      <Badge key={tag} variant={dbBadgeVariant(tag)}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <ol className="space-y-1.5">
                    {category.queries.map((query, qIdx) => (
                      <li
                        key={qIdx}
                        className="flex items-start gap-2 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <span className="mt-0.5 shrink-0 text-xs font-mono text-muted-foreground w-5 text-right">
                          {qIdx + 1}.
                        </span>
                        <Text level="small">{query}</Text>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-2">
        <Text level="xSmall" color="muted">
          {totalQueries} sample queries across {QUERY_CATEGORIES.length}{" "}
          categories
        </Text>
      </div>
    </div>
  );
}
