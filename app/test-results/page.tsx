"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Title,
  Text,
  Button,
  Icon,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
} from "@kognitos/lattice";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

type CaseResult = {
  tag: string;
  category: string;
  question: string;
  status: "completed" | "failed" | "awaiting_guidance" | "timeout" | "error";
  runId: string | null;
  elapsedMs: number;
  queryType: string | null;
  recordCount: number | string | null;
  databasesQueried: string;
  hasCsv: boolean;
  hasGeneratedSql: boolean;
  subQuestionCount: number;
  responseText?: string | null;
  responseTextSnippet: string;
  tableData?: Record<string, unknown>[] | null;
  tableRowCount: number;
  error: string | null;
};

type Summary = {
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  errored: number;
  avgElapsedSec: number;
  byCategory: Record<string, { total: number; passed: number; failed: number; avgSec: number }>;
};

type Args = {
  base: string;
  concurrency: number;
  tags: string[] | null;
  limit: number | null;
};

type Payload = {
  args: Args;
  summary: Summary;
  results: CaseResult[];
  wallSec: number;
};

type RunMeta = {
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  error: string | null;
  isRunning: boolean;
};

type ApiResponse = {
  exists: boolean;
  mtime: string | null;
  payload: Payload | null;
  run: RunMeta | null;
};

type StatusFilter = "all" | "passed" | "failed";

function statusBadge(status: CaseResult["status"]): React.ReactElement {
  switch (status) {
    case "completed":
      return <Badge variant="success">completed</Badge>;
    case "failed":
      return <Badge variant="destructive">failed</Badge>;
    case "awaiting_guidance":
      return <Badge variant="destructive">awaiting</Badge>;
    case "timeout":
      return <Badge variant="destructive">timeout</Badge>;
    default:
      return <Badge variant="destructive">error</Badge>;
  }
}

export default function TestResultsPage(): React.ReactElement {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/test-results", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll faster while a run is in flight.
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    const isRunning = data?.run?.isRunning === true;
    pollRef.current = setInterval(refresh, isRunning ? 4000 : 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [data?.run?.isRunning, refresh]);

  const startRun = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/test-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 5 }),
      });
      if (res.status === 409) {
        const j = (await res.json()) as { error: string };
        setError(j.error);
      } else if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Start failed (${res.status}): ${txt.slice(0, 200)}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setStarting(false);
    }
  }, [refresh]);

  const payload = data?.payload ?? null;
  const summary = payload?.summary ?? null;
  const results = useMemo<CaseResult[]>(() => payload?.results ?? [], [payload]);

  const categories = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const r of results) set.add(r.category);
    return Array.from(set).sort();
  }, [results]);

  const filteredResults = useMemo<CaseResult[]>(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => {
      if (statusFilter === "passed" && r.status !== "completed") return false;
      if (statusFilter === "failed" && r.status === "completed") return false;
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (q) {
        const hay =
          `${r.tag} ${r.question} ${r.responseTextSnippet} ${r.databasesQueried} ${r.queryType ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [results, statusFilter, categoryFilter, search]);

  const isRunning = data?.run?.isRunning === true;
  const lastRunAt = data?.mtime ? dayjs(data.mtime) : null;
  const wallSec = payload?.wallSec ?? null;

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <Title level="h2">Test Results</Title>
            {isRunning && <Badge variant="secondary">Running…</Badge>}
          </div>
          <Text level="small" color="muted">
            Batch results from <span className="font-mono">scripts/run-db-agent-tests.ts</span> against the live DB Agent.
          </Text>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">Refresh</span>
          </Button>
          <Button size="sm" onClick={startRun} disabled={starting || isRunning}>
            <Icon type="Sparkles" size="sm" />
            <span className="ml-1.5">
              {isRunning ? "Running…" : starting ? "Starting…" : "Run all tests"}
            </span>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isRunning && (
        <Alert>
          <AlertTitle>Test run in progress</AlertTitle>
          <AlertDescription>
            Started {lastRunMeta(data?.run)}. Results will appear here when the run finishes (typically 4–6 minutes for all 100 questions).
          </AlertDescription>
        </Alert>
      )}

      {!loading && !payload && !isRunning && (
        <Alert>
          <AlertTitle>No results yet</AlertTitle>
          <AlertDescription>
            Click <strong>Run all tests</strong> above, or run{" "}
            <span className="font-mono">npx tsx scripts/run-db-agent-tests.ts</span> from the terminal. Results
            are written to <span className="font-mono">scripts/output/db-agent-test-results.json</span>.
          </AlertDescription>
        </Alert>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      )}

      {summary && payload && (
        <>
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <SummaryStat label="Total" value={String(summary.total)} />
              <SummaryStat
                label="Passed"
                value={`${summary.passed} (${pct(summary.passed, summary.total)}%)`}
                tone="success"
              />
              <SummaryStat
                label="Failed"
                value={String(summary.failed + summary.timedOut + summary.errored)}
                tone={summary.failed + summary.timedOut + summary.errored > 0 ? "destructive" : "default"}
              />
              <SummaryStat label="Avg / query" value={`${summary.avgElapsedSec.toFixed(1)}s`} />
              <SummaryStat
                label="Wall time"
                value={wallSec != null ? formatDuration(wallSec) : "—"}
              />
              <SummaryStat
                label="Last run"
                value={lastRunAt ? lastRunAt.fromNow() : "—"}
              />
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon type="Settings" size="sm" />
              <span>
                concurrency {payload.args.concurrency}
                {payload.args.tags ? ` • tags ${payload.args.tags.join(",")}` : ""}
                {payload.args.limit ? ` • limit ${payload.args.limit}` : ""}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Icon type="BarChart3" size="sm" className="text-muted-foreground" />
              <Text level="base" className="font-semibold">
                Pass rate by category
              </Text>
            </div>
            <CategoryTable summary={summary} onPick={setCategoryFilter} active={categoryFilter} />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Icon type="Table" size="sm" className="text-muted-foreground" />
              <Text level="base" className="font-semibold">
                Per-question results ({filteredResults.length} of {results.length})
              </Text>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterChip
                label="All"
                active={statusFilter === "all"}
                onClick={() => setStatusFilter("all")}
              />
              <FilterChip
                label={`Passed (${summary.passed})`}
                active={statusFilter === "passed"}
                onClick={() => setStatusFilter("passed")}
                tone="success"
              />
              <FilterChip
                label={`Failed (${summary.failed + summary.timedOut + summary.errored})`}
                active={statusFilter === "failed"}
                onClick={() => setStatusFilter("failed")}
                tone="destructive"
              />
              <div className="ml-auto flex items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c} ({summary.byCategory[c]?.total ?? 0})
                    </option>
                  ))}
                </select>
                <div className="relative">
                  <Icon
                    type="Search"
                    size="sm"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search question or response…"
                    className="h-9 w-72 rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium w-8" />
                    <th className="py-2 px-3 font-medium whitespace-nowrap">Tag</th>
                    <th className="py-2 px-3 font-medium">Status</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Sec</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">Type</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">Records</th>
                    <th className="py-2 px-3 font-medium whitespace-nowrap">DBs</th>
                    <th className="py-2 px-3 font-medium text-center">CSV</th>
                    <th className="py-2 px-3 font-medium text-center">SQL</th>
                    <th className="py-2 px-3 font-medium">Response</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r) => {
                    const expanded = expandedRow === r.tag;
                    return (
                      <ResultRow
                        key={r.tag}
                        r={r}
                        expanded={expanded}
                        onToggle={() => setExpandedRow(expanded ? null : r.tag)}
                      />
                    );
                  })}
                  {filteredResults.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground">
                        No results match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ResultRow({
  r,
  expanded,
  onToggle,
}: {
  r: CaseResult;
  expanded: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const recs = r.recordCount == null ? "—" : String(r.recordCount);
  const sec = (r.elapsedMs / 1000).toFixed(1);
  const snippet = r.responseTextSnippet || r.error || "";
  return (
    <>
      <tr
        className={`border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer ${expanded ? "bg-muted/20" : ""}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${r.tag} — ${r.status} — ${expanded ? "collapse" : "expand"} details`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <td className="py-2 px-3 align-top">
          <Icon
            type={expanded ? "ChevronDown" : "ChevronRight"}
            size="sm"
            className="text-muted-foreground"
          />
        </td>
        <td className="py-2 px-3 font-mono text-xs whitespace-nowrap align-top">{r.tag}</td>
        <td className="py-2 px-3 align-top">{statusBadge(r.status)}</td>
        <td className="py-2 px-3 text-right font-mono text-xs whitespace-nowrap align-top">{sec}</td>
        <td className="py-2 px-3 text-xs whitespace-nowrap align-top">{r.queryType ?? "—"}</td>
        <td className="py-2 px-3 text-right font-mono text-xs whitespace-nowrap align-top">{recs}</td>
        <td className="py-2 px-3 text-xs whitespace-nowrap align-top">{r.databasesQueried || "—"}</td>
        <td className="py-2 px-3 text-center align-top">{r.hasCsv ? "✓" : "—"}</td>
        <td className="py-2 px-3 text-center align-top">{r.hasGeneratedSql ? "✓" : "—"}</td>
        <td className="py-2 px-3 align-top max-w-md">
          <div className="text-xs text-muted-foreground line-clamp-2">{snippet}</div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={10} className="py-3 px-3">
            <div className="space-y-2">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  Question
                </div>
                <Text level="small">{r.question}</Text>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  Response
                </div>
                <ResponseRenderer r={r} />
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {r.runId && (
                  <span>
                    <span className="uppercase tracking-wide">runId</span>{" "}
                    <span className="font-mono">{r.runId}</span>
                  </span>
                )}
                {r.subQuestionCount > 1 && (
                  <span>
                    <span className="uppercase tracking-wide">sub-questions</span> {r.subQuestionCount}
                  </span>
                )}
                {r.tableRowCount > 0 && (
                  <span>
                    <span className="uppercase tracking-wide">table rows</span> {r.tableRowCount}
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ResponseRenderer({ r }: { r: CaseResult }): React.ReactElement {
  const text = r.responseText ?? r.responseTextSnippet ?? "";
  const directRows = Array.isArray(r.tableData) && r.tableData.length > 0 ? r.tableData : null;

  // Prefer the structured tableData from the API (clean column names, typed values).
  // The markdown table is essentially a textual rendering of the same data, so when
  // we have directRows we don't show it again as prose.
  if (directRows) {
    const headers = Object.keys(directRows[0] ?? {});
    return <ResultTableView headers={headers} rows={directRows} />;
  }

  // Fallback: parse a markdown table out of the response text. Show any prose that
  // appears before the table as plain text above the rendered table.
  const parsed = parseMarkdownTable(text);
  if (parsed && parsed.headers.length > 0 && parsed.rows.length > 0) {
    const before = parsed.before.trim();
    return (
      <div className="space-y-2">
        {before && (
          <div className="text-xs whitespace-pre-wrap text-foreground">{before}</div>
        )}
        <ResultTableView headers={parsed.headers} rows={parsed.rows} />
      </div>
    );
  }

  return (
    <pre className="text-xs font-mono whitespace-pre-wrap text-foreground bg-background rounded-md border border-border p-2 max-h-48 overflow-auto">
      {text || r.error || "(no response)"}
    </pre>
  );
}

function ResultTableView({
  headers,
  rows,
}: {
  headers: string[];
  rows: Record<string, unknown>[];
}): React.ReactElement {
  const MAX_ROWS = 50;
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;
  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr className="border-b border-border text-left">
              {headers.map((h) => (
                <th key={h} className="py-1.5 px-2 font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {headers.map((h) => (
                  <td key={h} className="py-1.5 px-2 align-top whitespace-nowrap">
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

// Parse a markdown table embedded in agent response text. Returns the headers,
// the parsed rows (one object per row keyed by header), and any text that
// preceded the table so we can show it alongside the rendered table.
function parseMarkdownTable(text: string): {
  headers: string[];
  rows: Record<string, unknown>[];
  before: string;
} | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  let sepIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("|") && /^\|?\s*:?-{3,}/.test(line.replace(/\s+/g, ""))) {
      sepIdx = i;
      break;
    }
  }
  if (sepIdx < 1) return null;
  const headerLine = lines[sepIdx - 1];
  const headers = splitMdRow(headerLine);
  if (headers.length === 0) return null;
  const rows: Record<string, unknown>[] = [];
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim().includes("|")) break;
    const cells = splitMdRow(raw);
    if (cells.length === 0) continue;
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cells[j] ?? "";
    }
    rows.push(row);
  }
  if (rows.length === 0) return null;
  const before = lines.slice(0, sepIdx - 1).join("\n");
  return { headers, rows, before };
}

function splitMdRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function CategoryTable({
  summary,
  onPick,
  active,
}: {
  summary: Summary;
  onPick: (cat: string) => void;
  active: string;
}): React.ReactElement {
  const rows = Object.entries(summary.byCategory)
    .map(([k, v]) => ({ key: k, ...v }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-3 font-medium">Category</th>
            <th className="py-2 pr-3 font-medium text-right">Passed</th>
            <th className="py-2 pr-3 font-medium text-right">Failed</th>
            <th className="py-2 pr-3 font-medium text-right">Total</th>
            <th className="py-2 pr-3 font-medium text-right">Pass %</th>
            <th className="py-2 pr-3 font-medium">&nbsp;</th>
            <th className="py-2 pr-3 font-medium text-right">Avg s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const p = r.total === 0 ? 0 : (100 * r.passed) / r.total;
            const isActive = active === r.key;
            return (
              <tr
                key={r.key}
                onClick={() => onPick(isActive ? "all" : r.key)}
                className={`border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 ${isActive ? "bg-muted/30" : ""}`}
              >
                <td className="py-2 pr-3 font-mono text-xs">{r.key}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">{r.passed}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">{r.failed}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">{r.total}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">{p.toFixed(0)}%</td>
                <td className="py-2 pr-3 w-48">
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${p >= 100 ? "bg-emerald-500" : p >= 80 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs text-muted-foreground">
                  {r.avgSec.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "destructive";
}): React.ReactElement {
  const valueClass =
    tone === "success" ? "text-emerald-600 dark:text-emerald-400"
    : tone === "destructive" ? "text-red-600 dark:text-red-400"
    : "";
  return (
    <div>
      <Text level="xSmall" color="muted" className="uppercase tracking-wide">
        {label}
      </Text>
      <Text level="large" className={`font-semibold mt-1 ${valueClass}`}>
        {value}
      </Text>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "success" | "destructive";
}): React.ReactElement {
  const base = "px-3 py-1 rounded-full text-xs border transition-colors";
  const inactive = "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  let activeClass = "border-primary bg-primary/10 text-foreground";
  if (active && tone === "success") activeClass = "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (active && tone === "destructive") activeClass = "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300";
  return (
    <button onClick={onClick} className={`${base} ${active ? activeClass : inactive}`}>
      {label}
    </button>
  );
}

function pct(n: number, total: number): string {
  if (!total) return "0";
  return ((100 * n) / total).toFixed(0);
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}m ${s.toFixed(0)}s`;
}

function lastRunMeta(run: RunMeta | null | undefined): string {
  if (!run) return "—";
  return dayjs(run.startedAt).fromNow();
}
