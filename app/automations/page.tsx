"use client";

import { useEffect, useState } from "react";
import {
  Title,
  Text,
  Badge,
  Skeleton,
  Icon,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@kognitos/lattice";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

interface Automation {
  id: string;
  displayName: string;
  resourceName: string;
  createdAt: string | null;
  updatedAt: string | null;
  state: string | null;
  connections?: Record<
    string,
    { connection_id?: string; endpoint?: string }
  > | null;
}

/* ── Static content ─────────────────────────────────────── */

const SOP_STEPS = [
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
];

const INTEGRATIONS = [
  {
    name: "FIDO",
    platform: "Snowflake",
    purpose: "Client personal and contact information",
    icon: "Database" as const,
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
    icon: "Database" as const,
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
    icon: "Database" as const,
    tables: [
      {
        name: "PROFILE_STATUS",
        columns: ["FIDUCIARY_ID", "PROFILE_STATUS"],
      },
    ],
  },
];

/* ── Helpers ─────────────────────────────────────────────── */

function stateBadge(state: string | null) {
  if (!state) return <Badge variant="secondary">Unknown</Badge>;
  const s = state.toLowerCase();
  if (s.includes("published")) return <Badge variant="success">Published</Badge>;
  if (s.includes("draft")) return <Badge variant="secondary">Draft</Badge>;
  if (s.includes("disabled")) return <Badge variant="destructive">Disabled</Badge>;
  return <Badge variant="secondary">{state.replace(/^AUTOMATION_STATE_/, "")}</Badge>;
}

function platformBadge(platform: string) {
  return platform === "Snowflake" ? (
    <Badge variant="default">{platform}</Badge>
  ) : (
    <Badge variant="outline">{platform}</Badge>
  );
}

/* ── Component ───────────────────────────────────────────── */

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSop, setExpandedSop] = useState(true);
  const [expandedIntegrations, setExpandedIntegrations] = useState(true);

  useEffect(() => {
    fetch("/api/automations")
      .then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setAutomations(data.automations ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const automation = automations[0] ?? null;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Title level="h2">Automations</Title>
        <Text level="small" color="muted">
          Automation details, SOP logic, and integrations
        </Text>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load automations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : automation ? (
        <>
          {/* ── Automation overview card ── */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Icon type="Blocks" size="md" className="text-primary" />
                </div>
                <div className="min-w-0">
                  <Text level="base" className="font-semibold">
                    {automation.displayName}
                  </Text>
                  <Text level="xSmall" color="muted" className="mt-0.5 font-mono">
                    {automation.id}
                  </Text>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {stateBadge(automation.state)}
                {automation.updatedAt && (
                  <Text level="xSmall" color="muted">
                    Updated {dayjs(automation.updatedAt).fromNow()}
                  </Text>
                )}
                {automation.createdAt && (
                  <Text level="xSmall" color="muted">
                    Created {dayjs(automation.createdAt).format("MMM D, YYYY")}
                  </Text>
                )}
              </div>
            </div>
          </div>

          {/* ── SOP Logic ── */}
          <CollapsibleSection
            title="SOP Logic"
            subtitle="Step-by-step procedure for the SQL Query Generator"
            icon="ListOrdered"
            expanded={expandedSop}
            onToggle={() => setExpandedSop(!expandedSop)}
          >
            <div className="space-y-3">
              {SOP_STEPS.map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {s.step}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <Text level="small" className="font-medium">
                      {s.title}
                    </Text>
                    <Text level="xSmall" color="muted" className="mt-0.5">
                      {s.description}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* ── Integrations ── */}
          <CollapsibleSection
            title="Integrations"
            subtitle="Connected databases and their schemas"
            icon="Database"
            expanded={expandedIntegrations}
            onToggle={() => setExpandedIntegrations(!expandedIntegrations)}
          >
            <div className="space-y-1.5 mb-4">
              <Text level="xSmall" color="muted">
                All databases are connected via the shared join key{" "}
                <code className="px-1 py-0.5 rounded bg-muted font-mono text-xs">
                  FIDUCIARY_ID
                </code>
              </Text>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {INTEGRATIONS.map((db) => (
                <div
                  key={db.name}
                  className="rounded-xl border border-border p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <Text level="small" className="font-semibold">
                      {db.name}
                    </Text>
                    {platformBadge(db.platform)}
                  </div>
                  <Text level="xSmall" color="muted">
                    {db.purpose}
                  </Text>
                  {db.tables.map((table) => (
                    <div key={table.name} className="space-y-1.5">
                      <Text level="xSmall" className="font-mono font-medium">
                        {table.name}
                      </Text>
                      <div className="flex flex-wrap gap-1">
                        {table.columns.map((col) => (
                          <span
                            key={col}
                            className="inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
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

            {automation.connections &&
              Object.keys(automation.connections).length > 0 && (
                <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                  <Text level="small" className="font-semibold">
                    Workspace connections (from Kognitos)
                  </Text>
                  <Text level="xSmall" color="muted">
                    Integration bindings attached to this automation in Kognitos Studio.
                  </Text>
                  <ul className="space-y-2 mt-2">
                    {Object.entries(automation.connections).map(([key, c]) => (
                      <li
                        key={key}
                        className="flex flex-wrap items-baseline gap-2 text-xs"
                      >
                        <span className="font-mono font-medium capitalize">{key}</span>
                        {c?.connection_id && (
                          <Badge variant="secondary">{c.connection_id}</Badge>
                        )}
                        {c?.endpoint ? (
                          <span className="text-muted-foreground font-mono truncate max-w-full">
                            {c.endpoint}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </CollapsibleSection>
        </>
      ) : (
        !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Icon type="Archive" size="xl" className="text-muted-foreground" />
            <Text color="muted">No automations found in this workspace</Text>
          </div>
        )
      )}
    </div>
  );
}

/* ── Collapsible section component ───────────────────────── */

function CollapsibleSection({
  title,
  subtitle,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon type={icon as "Code"} size="sm" className="text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <Text level="small" className="font-semibold">
              {title}
            </Text>
            <Text level="xSmall" color="muted" className="mt-0.5">
              {subtitle}
            </Text>
          </div>
        </div>
        <Icon
          type="ChevronDown"
          size="sm"
          className={`text-muted-foreground transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border px-5 py-4">
          {children}
        </div>
      )}
    </div>
  );
}
