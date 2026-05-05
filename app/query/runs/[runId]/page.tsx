"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Title,
  Text,
  Button,
  Icon,
  Badge,
  Skeleton,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@kognitos/lattice";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  VerdictToggle,
  NotesField,
  type Verdict,
} from "@/app/components/verdict-controls";

dayjs.extend(relativeTime);

interface RunDetail {
  runId: string;
  status: string;
  question: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  kognitosUrl: string;
  responseText?: string | null;
  generatedSql?: string | null;
  questionCount?: number | null;
  subQuestions?: string[] | null;
  subQueryCount?: number | null;
  resultRowCount?: number | null;
  appliedWhereClauses?: string[] | null;
  tableData?: Record<string, unknown>[] | null;
  error?: string | null;
  state?: string | null;
}

function statusBadge(status: string): React.ReactElement {
  switch (status) {
    case "completed":
      return <Badge variant="success">completed</Badge>;
    case "failed":
      return <Badge variant="destructive">failed</Badge>;
    case "awaiting_guidance":
      return <Badge variant="destructive">awaiting</Badge>;
    case "running":
      return <Badge variant="secondary">running</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const escape = (val: unknown): string => {
    if (val == null) return "";
    let s: string;
    if (typeof val === "string") s = val;
    else if (typeof val === "number" || typeof val === "boolean") s = String(val);
    else {
      try {
        s = JSON.stringify(val);
      } catch {
        s = String(val);
      }
    }
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function QueryRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}): React.ReactElement {
  const { runId } = use(params);
  const [data, setData] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/query/${runId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }
        return (await res.json()) as RunDetail;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load run");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/query/runs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon type="ChevronLeft" size="sm" />
          Run History
        </Link>
      </div>

      <div>
        <Title level="h2">Query Run</Title>
        <Text level="xSmall" color="muted" className="font-mono">
          {runId}
        </Text>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load run</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : data ? (
        <RunDetailView data={data} />
      ) : (
        !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Icon type="Archive" size="xl" className="text-muted-foreground" />
            <Text color="muted">Run not found</Text>
          </div>
        )
      )}
    </div>
  );
}

function RunDetailView({ data }: { data: RunDetail }): React.ReactElement {
  const isCompleted = data.status === "completed";
  const isError =
    data.status === "failed" || data.status === "awaiting_guidance";
  const [copied, setCopied] = useState<boolean>(false);

  const [verdict, setVerdictState] = useState<Verdict>("correct");
  const [notes, setNotesState] = useState<string | null>(null);
  const [verdictUpdatedAt, setVerdictUpdatedAt] = useState<string | null>(null);
  const [verdictLoading, setVerdictLoading] = useState<boolean>(true);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const [verdictSaving, setVerdictSaving] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    setVerdictLoading(true);

    // Bootstrap the row (idempotent) before reading, so refreshing a fresh
    // run's detail page also yields a default 'correct' row immediately.
    fetch("/api/query/runs/verdicts/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runs: [
          {
            runId: data.runId,
            question: data.question,
            answer: data.responseText ?? null,
          },
        ],
      }),
    })
      .catch(() => {
        // ignore bootstrap failures — the read below will still render
      })
      .then(() => fetch("/api/query/runs/verdicts", { cache: "no-store" }))
      .then(async (res) => {
        if (!res) return;
        const json = (await res.json()) as {
          verdicts?: Record<
            string,
            {
              verdict: Verdict;
              notes: string | null;
              question: string | null;
              answer: string | null;
              updatedAt: string | null;
            }
          >;
          error?: string;
          needsMigration?: boolean;
        };
        if (cancelled) return;
        if (!res.ok && !json.needsMigration) {
          setVerdictError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        const entry = json.verdicts?.[data.runId] ?? null;
        setVerdictState(entry?.verdict ?? "correct");
        setNotesState(entry?.notes ?? null);
        setVerdictUpdatedAt(entry?.updatedAt ?? null);
        setVerdictError(json.needsMigration ? (json.error ?? null) : null);
      })
      .catch((e) => {
        if (cancelled) return;
        setVerdictError(
          e instanceof Error ? e.message : "Failed to load verdict",
        );
      })
      .finally(() => {
        if (!cancelled) setVerdictLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data.runId, data.question, data.responseText]);

  const saveVerdictRow = async (next: {
    verdict: Verdict;
    notes: string | null;
  }): Promise<void> => {
    const previousVerdict = verdict;
    const previousNotes = notes;
    const previousUpdatedAt = verdictUpdatedAt;
    setVerdictState(next.verdict);
    setNotesState(next.notes);
    setVerdictUpdatedAt(new Date().toISOString());
    setVerdictSaving(true);
    try {
      const res = await fetch("/api/query/runs/verdicts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: data.runId,
          question: data.question,
          answer: data.responseText ?? null,
          verdict: next.verdict,
          notes: next.notes,
        }),
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      setVerdictError(null);
    } catch (e) {
      setVerdictState(previousVerdict);
      setNotesState(previousNotes);
      setVerdictUpdatedAt(previousUpdatedAt);
      setVerdictError(
        e instanceof Error ? e.message : "Failed to save verdict",
      );
    } finally {
      setVerdictSaving(false);
    }
  };

  const handleSetVerdict = (next: Verdict): void => {
    void saveVerdictRow({ verdict: next, notes });
  };

  const handleSetNotes = (next: string | null): void => {
    void saveVerdictRow({ verdict, notes: next });
  };

  const handleCopySql = async (): Promise<void> => {
    if (!data.generatedSql) return;
    try {
      await navigator.clipboard.writeText(data.generatedSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignored
    }
  };

  const hasTable =
    Array.isArray(data.tableData) && data.tableData.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Question
        </div>
        <Text level="base" className="font-semibold whitespace-pre-wrap">
          {data.question ?? "(no question)"}
        </Text>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Answer
        </div>
        {isCompleted ? (
          <Text level="small" className="whitespace-pre-wrap">
            {data.responseText && data.responseText.trim().length > 0
              ? data.responseText
              : "(no response text returned)"}
          </Text>
        ) : isError ? (
          <Text
            level="small"
            className="whitespace-pre-wrap text-red-600 dark:text-red-400"
          >
            {data.error ?? "Run did not complete"}
          </Text>
        ) : (
          <Text level="small" color="muted">
            Run still in progress…
          </Text>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          {statusBadge(data.status)}
          {data.resultRowCount != null && (
            <Badge variant="secondary">
              {String(data.resultRowCount)} row
              {String(data.resultRowCount) === "1" ? "" : "s"}
            </Badge>
          )}
          {data.subQueryCount != null && data.subQueryCount > 1 && (
            <Badge variant="secondary">
              {String(data.subQueryCount)} sub-queries
            </Badge>
          )}
          {Array.isArray(data.appliedWhereClauses) &&
            data.appliedWhereClauses.length > 0 && (
              <Badge variant="secondary">
                {data.appliedWhereClauses.length} filter
                {data.appliedWhereClauses.length === 1 ? "" : "s"}
              </Badge>
            )}
          {data.stage && (
            <Badge variant="outline">
              {data.stage.replace(/^AUTOMATION_STAGE_/, "").toLowerCase()}
            </Badge>
          )}
          <a
            href={data.kognitosUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon type="ArrowUpRight" size="sm" />
            View in Kognitos
          </a>
        </div>
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Verdict
            </span>
            <VerdictToggle
              value={verdict}
              disabled={verdictLoading || verdictSaving}
              onChange={handleSetVerdict}
            />
            {data.createdAt && (
              <span
                className="text-xs text-muted-foreground tabular-nums"
                title={dayjs(data.createdAt).format("YYYY-MM-DD HH:mm:ss")}
              >
                Run · {dayjs(data.createdAt).format("MMM D, YYYY h:mm A")}
              </span>
            )}
            {verdictUpdatedAt && (
              <Text level="xSmall" color="muted">
                Last marked {dayjs(verdictUpdatedAt).fromNow()}
              </Text>
            )}
            {verdictError && (
              <Text level="xSmall" className="text-red-600 dark:text-red-400">
                {verdictError}
              </Text>
            )}
          </div>
          <NotesField
            value={notes}
            onSave={handleSetNotes}
            disabled={verdictLoading || verdictSaving}
            multiline
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {data.createdAt && (
            <MetaRow
              label="Created"
              value={`${dayjs(data.createdAt).format("MMM D, YYYY h:mm A")} (${dayjs(data.createdAt).fromNow()})`}
            />
          )}
          {data.updatedAt && (
            <MetaRow
              label="Updated"
              value={`${dayjs(data.updatedAt).format("MMM D, YYYY h:mm A")} (${dayjs(data.updatedAt).fromNow()})`}
            />
          )}
          <MetaRow label="Run ID" value={data.runId} mono />
        </div>
      </div>

      {Array.isArray(data.subQuestions) && data.subQuestions.length > 1 && (
        <Section
          icon="ListOrdered"
          title="Sub-questions"
          subtitle={`${data.subQuestions.length} sub-question${data.subQuestions.length === 1 ? "" : "s"}`}
        >
          <ul className="list-disc list-inside space-y-1">
            {data.subQuestions.map((q, i) => (
              <li key={i}>
                <Text level="small" color="muted" className="inline">
                  {String(q)}
                </Text>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.generatedSql && (
        <Section
          icon="Code"
          title="Generated SQL"
          subtitle="Queries executed against the source databases"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCopySql();
              }}
              title="Copy SQL to clipboard"
            >
              <Icon type={copied ? "Check" : "Copy"} size="sm" />
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
          }
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {data.generatedSql}
          </pre>
        </Section>
      )}

      {Array.isArray(data.appliedWhereClauses) &&
        data.appliedWhereClauses.length > 0 && (
          <Section
            icon="Filter"
            title="Applied WHERE clauses"
            subtitle={`${data.appliedWhereClauses.length} filter${data.appliedWhereClauses.length === 1 ? "" : "s"} applied to the query`}
          >
            <ul className="space-y-1">
              {data.appliedWhereClauses.map((w, i) => (
                <li key={i}>
                  <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted text-foreground">
                    {String(w)}
                  </code>
                </li>
              ))}
            </ul>
          </Section>
        )}

      {hasTable && (
        <Section
          icon="Table"
          title="Result Table"
          subtitle={`${data.tableData!.length} row${data.tableData!.length === 1 ? "" : "s"}`}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                downloadCsv(
                  rowsToCsv(data.tableData ?? []),
                  `query-${data.runId}.csv`,
                );
              }}
            >
              <Icon type="Download" size="sm" />
              <span className="ml-1.5">Download CSV</span>
            </Button>
          }
        >
          <ResultTable rows={data.tableData ?? []} />
        </Section>
      )}
    </div>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground uppercase tracking-wide text-[10px] mt-0.5">
        {label}
      </span>
      <span
        className={`text-foreground break-all ${mono ? "font-mono" : ""}`.trim()}
      >
        {value}
      </span>
    </div>
  );
}

function Section({
  icon,
  title,
  subtitle,
  children,
  action,
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = useState<boolean>(true);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            type={icon as "Code"}
            size="sm"
            className="text-muted-foreground shrink-0"
          />
          <div className="min-w-0">
            <Text level="small" className="font-semibold">
              {title}
            </Text>
            <Text level="xSmall" color="muted" className="mt-0.5">
              {subtitle}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          <Icon
            type="ChevronDown"
            size="sm"
            className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4">{children}</div>
      )}
    </div>
  );
}

function ResultTable({
  rows,
}: {
  rows: Record<string, unknown>[];
}): React.ReactElement {
  const MAX_ROWS = 200;
  const headers = Object.keys(rows[0] ?? {});
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;
  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border text-left">
              {headers.map((h) => (
                <th
                  key={h}
                  className="py-1.5 px-2 font-medium whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border last:border-0 hover:bg-muted/20"
              >
                {headers.map((h) => (
                  <td
                    key={h}
                    className="py-1.5 px-2 align-top whitespace-nowrap"
                  >
                    {formatCell(row[h])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground">
        <span>
          {rows.length} row{rows.length === 1 ? "" : "s"}
          {hidden > 0 ? ` (showing first ${visible.length})` : ""}
        </span>
        <span>{headers.length} columns</span>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length === 0 ? "—" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

