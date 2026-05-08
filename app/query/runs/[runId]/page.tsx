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
import { StageVersionBadge } from "@/app/components/stage-version-badge";

dayjs.extend(relativeTime);

interface RunDetail {
  runId: string;
  status: string;
  question: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  stageVersion: string | null;
  kognitosUrl: string;
  responseText?: string | null;
  generatedSql?: string | null;
  questionCount?: number | null;
  subQuestions?: string[] | null;
  subQueryCount?: number | null;
  resultRowCount?: number | null;
  uniqueClientCount?: number | null;
  uniqueAccountCount?: number | null;
  appliedWhereClauses?: string[] | null;
  tableData?: Record<string, unknown>[] | null;
  error?: string | null;
  state?: string | null;
  emailSent?: boolean | null;
}

function statusConfig(status: string): { dot: string; label: string; badge: React.ReactElement } {
  switch (status) {
    case "completed":
      return {
        dot: "bg-emerald-500",
        label: "Completed",
        badge: <Badge variant="success">completed</Badge>,
      };
    case "failed":
      return {
        dot: "bg-red-500",
        label: "Failed",
        badge: <Badge variant="destructive">failed</Badge>,
      };
    case "awaiting_guidance":
      return {
        dot: "bg-red-500",
        label: "Awaiting guidance",
        badge: <Badge variant="destructive">awaiting</Badge>,
      };
    case "running":
      return {
        dot: "bg-amber-400 animate-pulse",
        label: "Running",
        badge: <Badge variant="secondary">running</Badge>,
      };
    default:
      return {
        dot: "bg-muted-foreground",
        label: status,
        badge: <Badge variant="secondary">{status}</Badge>,
      };
  }
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const escape = (val: unknown): string => {
    if (val == null) return "";
    const s = typeof val === "string" ? val : (typeof val === "number" || typeof val === "boolean") ? String(val) : JSON.stringify(val);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export default function QueryRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}): React.ReactElement {
  const { runId } = use(params);
  const [data, setData] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/query/${runId}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return (await res.json()) as RunDetail;
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load run"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [runId]);

  return (
    <div className="p-6 max-w-4xl space-y-5">
      {/* Back nav */}
      <Link
        href="/query/runs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Icon type="ChevronLeft" size="sm" />
        Run History
      </Link>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load run</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
        </div>
      ) : data ? (
        <RunDetailView data={data} />
      ) : (
        !error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Icon type="Archive" size="xl" className="text-muted-foreground/40" />
            <Text color="muted">Run not found</Text>
          </div>
        )
      )}
    </div>
  );
}

/* ── RunDetailView ─────────────────────────────────────────────────────── */
function RunDetailView({ data }: { data: RunDetail }): React.ReactElement {
  const isCompleted = data.status === "completed";
  const isError = data.status === "failed" || data.status === "awaiting_guidance";
  const cfg = statusConfig(data.status);

  const [copied, setCopied] = useState(false);
  const [verdict, setVerdictState] = useState<Verdict>("correct");
  const [notes, setNotesState] = useState<string | null>(null);
  const [verdictUpdatedAt, setVerdictUpdatedAt] = useState<string | null>(null);
  const [verdictLoading, setVerdictLoading] = useState(true);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const [verdictSaving, setVerdictSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVerdictLoading(true);
    fetch("/api/query/runs/verdicts/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runs: [{
          runId: data.runId, question: data.question, answer: data.responseText ?? null,
          createdAt: data.createdAt, status: data.status,
          resultRowCount: data.resultRowCount ?? null,
          appliedWhereClauseCount: data.appliedWhereClauses?.length ?? null,
          stage: data.stage, stageVersion: data.stageVersion ?? null,
        }],
      }),
    })
      .catch(() => {})
      .then(() => fetch("/api/query/runs/verdicts", { cache: "no-store" }))
      .then(async (res) => {
        if (!res) return;
        const json = (await res.json()) as {
          verdicts?: Record<string, { verdict: Verdict; notes: string | null; question: string | null; answer: string | null; updatedAt: string | null }>;
          error?: string; needsMigration?: boolean;
        };
        if (cancelled) return;
        if (!res.ok && !json.needsMigration) { setVerdictError(json.error ?? `HTTP ${res.status}`); return; }
        const entry = json.verdicts?.[data.runId] ?? null;
        setVerdictState(entry?.verdict ?? "correct");
        setNotesState(entry?.notes ?? null);
        setVerdictUpdatedAt(entry?.updatedAt ?? null);
        setVerdictError(json.needsMigration ? (json.error ?? null) : null);
      })
      .catch((e) => { if (!cancelled) setVerdictError(e instanceof Error ? e.message : "Failed to load verdict"); })
      .finally(() => { if (!cancelled) setVerdictLoading(false); });
    return () => { cancelled = true; };
  }, [data.runId, data.question, data.responseText]);

  const saveVerdictRow = async (next: { verdict: Verdict; notes: string | null }) => {
    const prevVerdict = verdict, prevNotes = notes, prevUpdatedAt = verdictUpdatedAt;
    setVerdictState(next.verdict);
    setNotesState(next.notes);
    setVerdictUpdatedAt(new Date().toISOString());
    setVerdictSaving(true);
    try {
      const res = await fetch("/api/query/runs/verdicts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: data.runId, question: data.question, answer: data.responseText ?? null, verdict: next.verdict, notes: next.notes }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = (await res.json()) as { error?: string }; if (j.error) msg = j.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      setVerdictError(null);
    } catch (e) {
      setVerdictState(prevVerdict);
      setNotesState(prevNotes);
      setVerdictUpdatedAt(prevUpdatedAt);
      setVerdictError(e instanceof Error ? e.message : "Failed to save verdict");
    } finally {
      setVerdictSaving(false);
    }
  };

  const handleCopySql = async () => {
    if (!data.generatedSql) return;
    try { await navigator.clipboard.writeText(data.generatedSql); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignored */ }
  };

  const hasTable = Array.isArray(data.tableData) && data.tableData.length > 0;

  return (
    <div className="space-y-4">

      {/* ── Title + status bar ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cfg.dot}`} />
          <Title level="h2" className="leading-tight">
            {data.question ?? "Query Run"}
          </Title>
        </div>
        <a
          href={data.kognitosUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
        >
          <Icon type="ArrowUpRight" size="sm" />
          View in Kognitos
        </a>
      </div>

      {/* ── Answer card ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Metadata bar */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-border bg-muted/20">
          {cfg.badge}
          <StageVersionBadge stage={data.stage} stageVersion={data.stageVersion} />
          {data.resultRowCount != null && (
            <Badge variant="secondary">
              {data.resultRowCount} row{data.resultRowCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {data.uniqueClientCount != null && data.uniqueClientCount !== data.resultRowCount && (
            <Badge variant="secondary">
              {data.uniqueClientCount} client{data.uniqueClientCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {data.uniqueAccountCount != null && data.uniqueAccountCount !== data.resultRowCount && (
            <Badge variant="secondary">
              {data.uniqueAccountCount} account{data.uniqueAccountCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {data.subQueryCount != null && data.subQueryCount > 1 && (
            <Badge variant="secondary">{data.subQueryCount} sub-queries</Badge>
          )}
          {Array.isArray(data.appliedWhereClauses) && data.appliedWhereClauses.length > 0 && (
            <Badge variant="secondary">
              {data.appliedWhereClauses.length} filter{data.appliedWhereClauses.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {data.emailSent === true && (
            <Badge variant="secondary">
              <Icon type="Mail" size="sm" className="mr-1" />
              Emailed
            </Badge>
          )}
          {data.createdAt && (
            <span
              className="ml-auto text-xs text-muted-foreground tabular-nums"
              title={dayjs(data.createdAt).format("YYYY-MM-DD HH:mm:ss")}
            >
              {dayjs(data.createdAt).format("MMM D, YYYY h:mm A")}
            </span>
          )}
        </div>

        {/* Answer body */}
        <div className="px-5 py-4">
          {isCompleted ? (
            data.responseText?.trim() ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.responseText}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No response text returned.</p>
            )
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
              {data.error ?? "Run did not complete"}
            </p>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon type="Loader2" size="sm" className="animate-spin" />
              <span className="text-sm">Run still in progress…</span>
            </div>
          )}
        </div>

        {/* Verdict + notes footer */}
        <div className="border-t border-border px-5 py-3.5 bg-muted/10 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Verdict
            </span>
            <VerdictToggle
              value={verdict}
              disabled={verdictLoading || verdictSaving}
              onChange={(v) => void saveVerdictRow({ verdict: v, notes })}
            />
            {verdictUpdatedAt && (
              <Text level="xSmall" color="muted">
                Marked {dayjs(verdictUpdatedAt).fromNow()}
              </Text>
            )}
            {verdictError && (
              <Text level="xSmall" className="text-red-500 dark:text-red-400">
                {verdictError}
              </Text>
            )}
          </div>
          <NotesField
            value={notes}
            onSave={(n) => void saveVerdictRow({ verdict, notes: n })}
            disabled={verdictLoading || verdictSaving}
            multiline
          />
        </div>
      </div>

      {/* ── Run metadata ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Run details</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-xs">
          <MetaItem label="Run ID" value={data.runId} mono />
          {data.stage && <MetaItem label="Stage" value={data.stage.replace("AUTOMATION_STAGE_", "").toLowerCase()} />}
          {data.stageVersion && <MetaItem label="Version" value={`v${data.stageVersion}`} />}
          {data.createdAt && (
            <MetaItem
              label="Created"
              value={`${dayjs(data.createdAt).format("MMM D, YYYY h:mm A")} (${dayjs(data.createdAt).fromNow()})`}
            />
          )}
          {data.updatedAt && (
            <MetaItem
              label="Updated"
              value={`${dayjs(data.updatedAt).format("MMM D, YYYY h:mm A")} (${dayjs(data.updatedAt).fromNow()})`}
            />
          )}
          {data.questionCount != null && (
            <MetaItem label="Questions detected" value={String(data.questionCount)} />
          )}
        </dl>
      </div>

      {/* ── Sub-questions ──────────────────────────────────────────────── */}
      {Array.isArray(data.subQuestions) && data.subQuestions.length > 1 && (
        <CollapsibleSection
          icon="ListOrdered"
          title="Sub-questions"
          subtitle={`${data.subQuestions.length} parts detected`}
          defaultOpen
        >
          <ol className="list-decimal list-inside space-y-1.5">
            {data.subQuestions.map((q, i) => (
              <li key={i} className="text-sm text-muted-foreground">{String(q)}</li>
            ))}
          </ol>
        </CollapsibleSection>
      )}

      {/* ── Applied WHERE clauses ──────────────────────────────────────── */}
      {Array.isArray(data.appliedWhereClauses) && data.appliedWhereClauses.length > 0 && (
        <CollapsibleSection
          icon="Filter"
          title="Applied filters"
          subtitle={`${data.appliedWhereClauses.length} WHERE clause${data.appliedWhereClauses.length !== 1 ? "s" : ""} applied`}
          defaultOpen
        >
          <div className="flex flex-wrap gap-2">
            {data.appliedWhereClauses.map((w, i) => (
              <code
                key={i}
                className="text-xs font-mono px-2 py-1 rounded-md bg-muted text-foreground border border-border/60"
              >
                {String(w)}
              </code>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Generated SQL ──────────────────────────────────────────────── */}
      {data.generatedSql && (
        <CollapsibleSection
          icon="Code"
          title="Generated SQL"
          subtitle="Queries executed against the source databases"
          defaultOpen={false}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); void handleCopySql(); }}
            >
              <Icon type={copied ? "Check" : "Copy"} size="sm" />
              <span className="ml-1.5">{copied ? "Copied" : "Copy"}</span>
            </Button>
          }
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground leading-relaxed">
            {data.generatedSql}
          </pre>
        </CollapsibleSection>
      )}

      {/* ── Result table ───────────────────────────────────────────────── */}
      {hasTable && (
        <CollapsibleSection
          icon="Table"
          title="Result data"
          subtitle={[
            `${data.tableData!.length} row${data.tableData!.length !== 1 ? "s" : ""}`,
            data.uniqueClientCount != null && data.uniqueClientCount !== data.tableData!.length
              ? `${data.uniqueClientCount} unique client${data.uniqueClientCount !== 1 ? "s" : ""}`
              : null,
            data.uniqueAccountCount != null && data.uniqueAccountCount !== data.tableData!.length
              ? `${data.uniqueAccountCount} unique account${data.uniqueAccountCount !== 1 ? "s" : ""}`
              : null,
          ].filter(Boolean).join(" · ")}
          defaultOpen
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                downloadCsv(rowsToCsv(data.tableData ?? []), `query-${data.runId}.csv`);
              }}
            >
              <Icon type="Download" size="sm" />
              <span className="ml-1.5">CSV</span>
            </Button>
          }
        >
          <ResultTable rows={data.tableData ?? []} />
        </CollapsibleSection>
      )}
    </div>
  );
}

/* ── CollapsibleSection ────────────────────────────────────────────────── */
function CollapsibleSection({
  icon,
  title,
  subtitle,
  children,
  action,
  defaultOpen = true,
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon type={icon as "Code"} size="sm" className="text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-semibold">{title}</span>
            <span className="ml-2 text-xs text-muted-foreground">{subtitle}</span>
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
      {open && <div className="border-t border-border px-5 py-4">{children}</div>}
    </div>
  );
}

/* ── MetaItem ──────────────────────────────────────────────────────────── */
function MetaItem({
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
      <dt className="text-muted-foreground uppercase tracking-wide text-[10px] mt-px shrink-0 w-24">
        {label}
      </dt>
      <dd className={`text-foreground break-all ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

/* ── ResultTable ───────────────────────────────────────────────────────── */
function ResultTable({ rows }: { rows: Record<string, unknown>[] }): React.ReactElement {
  const MAX_ROWS = 200;
  const headers = Object.keys(rows[0] ?? {});
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="border-b border-border text-left">
              {headers.map((h) => (
                <th key={h} className="py-2 px-3 font-medium whitespace-nowrap text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                {headers.map((h) => (
                  <td key={h} className="py-1.5 px-3 align-top whitespace-nowrap">
                    {formatCell(row[h])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>
          {rows.length} row{rows.length !== 1 ? "s" : ""}
          {hidden > 0 && ` · showing first ${visible.length}`}
        </span>
        <span>{headers.length} column{headers.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}

function formatCell(v: unknown): React.ReactNode {
  if (v == null) return <span className="text-muted-foreground/50">—</span>;
  if (typeof v === "string") return v.length === 0 ? <span className="text-muted-foreground/50">—</span> : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}
