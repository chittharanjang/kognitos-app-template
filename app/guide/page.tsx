"use client";

import { useState } from "react";
import { Title, Text, Icon, Badge } from "@kognitos/lattice";
import { QUERY_CATEGORIES } from "@/lib/guide-queries";

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

      <div className="rounded-lg border border-border bg-card p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Icon type="Table" size="sm" className="text-muted-foreground" />
          <Text level="base" className="font-semibold">
            Account-type breakdown answers
          </Text>
        </div>
        <Text level="xSmall" color="muted">
          Questions about account types render a canonical table with{" "}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">
            Total
          </code>
          ,{" "}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">
            Open
          </code>
          , and{" "}
          <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">
            Closed
          </code>{" "}
          columns. The chat answer stays focused on the table — generated SQL,
          CSV exports, and raw rows are kept on the run-detail page (open via{" "}
          <span className="font-medium">Open run details →</span> on a DB Agent
          answer card). Filter phrases like &ldquo;open Estate accounts&rdquo;
          add a <span className="font-medium">Filter:</span> line above the
          table so the scope is unambiguous.
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
