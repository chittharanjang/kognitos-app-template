"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { MarkdownText } from "../../../components/markdown-text";
import { MultiQuestionAnswer } from "../../../components/multi-question-answer";

dayjs.extend(relativeTime);

interface RunDetail {
  runId: string;
  status: string;
  question: string | null;
  requesterEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  kognitosUrl: string;
  responseText?: string | null;
  queryType?: string | null;
  recordCount?: number | null;
  databasesQueried?: string | string[] | null;
  generatedSql?: string | null;
  subQuestions?: string[] | null;
  csvData?: string | null;
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

export default function RunDetailPage({
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
    fetch(`/api/ama-agent/runs/${runId}`, { cache: "no-store" })
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
          href="/ama-agent/runs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon type="ChevronLeft" size="sm" />
          Run History
        </Link>
      </div>

      <div>
        <Title level="h2">DB Agent Run</Title>
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
  const router = useRouter();
  const [reRunning, setReRunning] = useState<boolean>(false);
  const [reRunError, setReRunError] = useState<string | null>(null);
  const isCompleted = data.status === "completed";
  const isError =
    data.status === "failed" || data.status === "awaiting_guidance";
  const dbs = Array.isArray(data.databasesQueried)
    ? data.databasesQueried.join(", ")
    : (data.databasesQueried ?? null);
  const hasCsv =
    typeof data.csvData === "string" && data.csvData.trim().length > 0;

  const handleReRun = async (): Promise<void> => {
    if (!data.question) return;
    setReRunning(true);
    setReRunError(null);
    try {
      const res = await fetch("/api/ama-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: data.question,
          requesterEmail: data.requesterEmail ?? undefined,
        }),
      });
      const json = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !json.runId) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      router.push(`/ama-agent/runs/${json.runId}`);
    } catch (e) {
      setReRunError(e instanceof Error ? e.message : "Failed to re-run");
      setReRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Question
            </div>
            <Text level="base" className="font-semibold whitespace-pre-wrap">
              {data.question ?? "(no question)"}
            </Text>
          </div>
          {data.question && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReRun}
              disabled={reRunning}
              className="shrink-0"
            >
              <Icon type="RefreshCw" size="sm" />
              <span className="ml-1.5">{reRunning ? "Re-running…" : "Re-run"}</span>
            </Button>
          )}
        </div>
        {reRunError && (
          <Alert variant="destructive">
            <AlertTitle>Re-run failed</AlertTitle>
            <AlertDescription>{reRunError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Answer
        </div>
        {isCompleted ? (
          data.responseText && data.responseText.trim().length > 0 ? (
            <MultiQuestionAnswer
              text={data.responseText}
              subQuestions={data.subQuestions}
              fallback={<MarkdownText text={data.responseText} />}
            />
          ) : (
            <Text level="small" color="muted">
              (no response text returned)
            </Text>
          )
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
          {data.queryType && (
            <Badge variant="secondary">type: {String(data.queryType)}</Badge>
          )}
          {data.recordCount != null && (
            <Badge variant="secondary">
              {String(data.recordCount)} record
              {String(data.recordCount) === "1" ? "" : "s"}
            </Badge>
          )}
          {dbs && <Badge variant="secondary">db: {dbs}</Badge>}
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
          {data.requesterEmail && (
            <MetaRow label="Requester" value={data.requesterEmail} />
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
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
            {data.generatedSql}
          </pre>
        </Section>
      )}

      {Array.isArray(data.tableData) && data.tableData.length > 0 && (
        <Section
          icon="Table"
          title="Result Table"
          subtitle={`${data.tableData.length} row${data.tableData.length === 1 ? "" : "s"}`}
        >
          <ResultTable rows={data.tableData} />
        </Section>
      )}

      {hasCsv && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex items-center justify-between gap-4">
          <div>
            <Text level="small" className="font-semibold">
              CSV export
            </Text>
            <Text level="xSmall" color="muted">
              Download the full result set produced by this run.
            </Text>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(data.csvData ?? "", `db-agent-${data.runId}.csv`)
            }
          >
            <Icon type="Download" size="sm" />
            <span className="ml-1.5">Download CSV</span>
          </Button>
        </div>
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
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
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
        <Icon
          type="ChevronDown"
          size="sm"
          className={`text-muted-foreground transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
        />
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
