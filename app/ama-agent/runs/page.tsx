"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

dayjs.extend(relativeTime);

interface RunSummary {
  runId: string;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  status: string;
  question: string | null;
  requesterEmail: string | null;
  answer: string | null;
  errorText: string | null;
  queryType: string | null;
  recordCount: number | null;
  databasesQueried: string | null;
  kognitosUrl: string;
}

type StatusFilter = "all" | "completed" | "failed" | "other";

const PAGE_SIZE = 25;

function statusBadge(status: string): React.ReactElement {
  switch (status) {
    case "completed":
      return <Badge variant="success">completed</Badge>;
    case "failed":
      return <Badge variant="destructive">failed</Badge>;
    case "awaiting_guidance":
      return <Badge variant="destructive">awaiting</Badge>;
    case "executing":
    case "pending":
    case "running":
      return <Badge variant="secondary">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function bucketStatus(status: string): "completed" | "failed" | "other" {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "awaiting_guidance") return "failed";
  return "other";
}

interface TestRunResult {
  total: number;
  started: number;
  failed: number;
}

interface LoadResult {
  totalRunsScanned: number;
  uniqueQuestions: number;
  upserted: number;
}

export default function RunsHistoryPage(): React.ReactElement {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [questionLoadError, setQuestionLoadError] = useState<string | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [lastTestResult, setLastTestResult] = useState<TestRunResult | null>(
    null,
  );
  const [lastLoadResult, setLastLoadResult] = useState<LoadResult | null>(
    null,
  );

  const loadPage = useCallback(
    async (pageToken: string | null, append: boolean) => {
      const params = new URLSearchParams();
      params.set("pageSize", String(PAGE_SIZE));
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`/api/ama-agent/runs?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        runs: RunSummary[];
        nextPageToken: string | null;
      };
      setNextPageToken(data.nextPageToken);
      setRuns((prev) => (append ? [...prev, ...data.runs] : data.runs));
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPage(null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!nextPageToken) return;
    setLoadingMore(true);
    setError(null);
    try {
      await loadPage(nextPageToken, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [loadPage, nextPageToken]);

  const refreshQuestionCount = useCallback(async () => {
    try {
      const res = await fetch("/api/ama-agent/test-questions", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        total?: number;
        error?: string;
        needsMigration?: boolean;
      };
      if (!res.ok && !data.needsMigration) {
        setQuestionCount(0);
        setQuestionLoadError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setQuestionCount(data.total ?? 0);
      setQuestionLoadError(data.needsMigration ? (data.error ?? null) : null);
    } catch (e) {
      setQuestionCount(0);
      setQuestionLoadError(
        e instanceof Error ? e.message : "Failed to load test questions",
      );
    }
  }, []);

  const handleLoadQuestions = useCallback(async () => {
    setLoadingQuestions(true);
    setQuestionLoadError(null);
    setLastLoadResult(null);
    try {
      const res = await fetch("/api/ama-agent/test-questions/load", {
        method: "POST",
      });
      const data = (await res.json()) as Partial<LoadResult> & {
        error?: string;
      };
      if (!res.ok) {
        setQuestionLoadError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setLastLoadResult({
        totalRunsScanned: data.totalRunsScanned ?? 0,
        uniqueQuestions: data.uniqueQuestions ?? 0,
        upserted: data.upserted ?? 0,
      });
      await refreshQuestionCount();
    } catch (e) {
      setQuestionLoadError(
        e instanceof Error ? e.message : "Failed to load questions",
      );
    } finally {
      setLoadingQuestions(false);
    }
  }, [refreshQuestionCount]);

  const handleRunTest = useCallback(async () => {
    setTesting(true);
    setLastTestResult(null);
    setQuestionLoadError(null);
    try {
      const res = await fetch("/api/ama-agent/test-questions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 25 }),
      });
      const data = (await res.json()) as Partial<TestRunResult> & {
        error?: string;
      };
      if (!res.ok) {
        setQuestionLoadError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setLastTestResult({
        total: data.total ?? 0,
        started: data.started ?? 0,
        failed: data.failed ?? 0,
      });
      setConfirmOpen(false);
      // Refresh runs immediately, then once more after a few seconds so the
      // newly-started runs surface even if Kognitos lags slightly.
      await refresh();
      setTimeout(() => {
        refresh();
      }, 3000);
    } catch (e) {
      setQuestionLoadError(
        e instanceof Error ? e.message : "Failed to start test run",
      );
    } finally {
      setTesting(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    refreshQuestionCount();
  }, [refresh, refreshQuestionCount]);

  const counts = useMemo(() => {
    const c = { all: runs.length, completed: 0, failed: 0, other: 0 };
    for (const r of runs) {
      const b = bucketStatus(r.status);
      c[b] += 1;
    }
    return c;
  }, [runs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter !== "all" && bucketStatus(r.status) !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${r.question ?? ""} ${r.answer ?? ""} ${r.errorText ?? ""} ${r.runId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [runs, statusFilter, search]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">DB Agent — Run History</Title>
          <Text level="small" color="muted">
            Every DB Agent run from Kognitos. Click a card to see the full
            answer, SQL, and result table.
          </Text>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">Refresh</span>
          </Button>
          {questionCount === null ? (
            <Button variant="outline" size="sm" disabled>
              <Icon type="FlaskConical" size="sm" />
              <span className="ml-1.5">Test…</span>
            </Button>
          ) : questionCount === 0 ? (
            <Button
              size="sm"
              onClick={handleLoadQuestions}
              disabled={loadingQuestions}
            >
              <Icon type="Download" size="sm" />
              <span className="ml-1.5">
                {loadingQuestions ? "Loading…" : "Load questions"}
              </span>
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={testing}
            >
              <Icon type="FlaskConical" size="sm" />
              <span className="ml-1.5">
                {testing ? "Starting…" : `Test (${questionCount})`}
              </span>
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load runs</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {questionLoadError && (
        <Alert variant="destructive">
          <AlertTitle>Test question library unavailable</AlertTitle>
          <AlertDescription>{questionLoadError}</AlertDescription>
        </Alert>
      )}

      {lastLoadResult && (
        <Alert>
          <AlertTitle>Loaded test questions</AlertTitle>
          <AlertDescription>
            Scanned {lastLoadResult.totalRunsScanned} historical runs and stored{" "}
            {lastLoadResult.uniqueQuestions} unique question
            {lastLoadResult.uniqueQuestions === 1 ? "" : "s"} in the local
            database.
          </AlertDescription>
        </Alert>
      )}

      {lastTestResult && (
        <Alert>
          <AlertTitle>Test batch started</AlertTitle>
          <AlertDescription>
            Kicked off {lastTestResult.started} of {lastTestResult.total} runs
            {lastTestResult.failed > 0
              ? ` (${lastTestResult.failed} failed to start)`
              : ""}
            . They will appear below as Kognitos picks them up — refresh again
            in a few seconds.
          </AlertDescription>
        </Alert>
      )}

      {confirmOpen && questionCount !== null && questionCount > 0 && (
        <ConfirmTestDialog
          count={questionCount}
          running={testing}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleRunTest}
          onReload={handleLoadQuestions}
          reloading={loadingQuestions}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label={`All (${counts.all})`}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <FilterChip
          label={`Completed (${counts.completed})`}
          active={statusFilter === "completed"}
          onClick={() => setStatusFilter("completed")}
          tone="success"
        />
        <FilterChip
          label={`Failed (${counts.failed})`}
          active={statusFilter === "failed"}
          onClick={() => setStatusFilter("failed")}
          tone="destructive"
        />
        <FilterChip
          label={`Other (${counts.other})`}
          active={statusFilter === "other"}
          onClick={() => setStatusFilter("other")}
        />
        <div className="ml-auto relative">
          <Icon
            type="Search"
            size="sm"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question or answer…"
            className="h-9 w-72 rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : runs.length === 0 ? (
        !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Icon type="History" size="xl" className="text-muted-foreground" />
            <Text color="muted">No runs found for the DB Agent yet.</Text>
            <Link href="/ama-agent">
              <Button variant="outline" size="sm">
                <Icon type="Sparkles" size="sm" />
                <span className="ml-1.5">Open DB Agent</span>
              </Button>
            </Link>
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Icon type="Search" size="lg" className="text-muted-foreground" />
          <Text color="muted">No runs match the current filters.</Text>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <RunCard key={r.runId} run={r} />
          ))}
        </div>
      )}

      {nextPageToken && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <>
                <Icon type="RefreshCw" size="sm" />
                <span className="ml-1.5">Loading…</span>
              </>
            ) : (
              <>
                <Icon type="ChevronDown" size="sm" />
                <span className="ml-1.5">Load more</span>
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: RunSummary }): React.ReactElement {
  const isCompleted = run.status === "completed";
  const isError = run.status === "failed" || run.status === "awaiting_guidance";
  const dbs = run.databasesQueried ?? null;

  return (
    <Link
      href={`/ama-agent/runs/${run.runId}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Icon type="Sparkles" size="sm" className="text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Question
              </div>
              <Text level="base" className="font-semibold line-clamp-2">
                {run.question ?? "(no question)"}
              </Text>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Answer
              </div>
              {isCompleted ? (
                <Text level="small" className="line-clamp-3 whitespace-pre-wrap">
                  {run.answer && run.answer.trim().length > 0
                    ? run.answer
                    : "(no response text returned)"}
                </Text>
              ) : isError ? (
                <Text
                  level="small"
                  className="line-clamp-3 text-red-600 dark:text-red-400"
                >
                  {run.errorText ?? "Run did not complete"}
                </Text>
              ) : (
                <Text level="small" color="muted">
                  Run still in progress…
                </Text>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <Icon
            type="ChevronRight"
            size="sm"
            className="text-muted-foreground group-hover:text-primary transition-colors"
          />
        </div>
      </div>
      <div className="mt-3 pl-12 flex flex-wrap items-center gap-1.5">
        {statusBadge(run.status)}
        {run.queryType && (
          <Badge variant="secondary">type: {run.queryType}</Badge>
        )}
        {run.recordCount != null && (
          <Badge variant="secondary">
            {run.recordCount} record{run.recordCount === 1 ? "" : "s"}
          </Badge>
        )}
        {dbs && <Badge variant="secondary">db: {dbs}</Badge>}
        {run.createdAt && (
          <Text level="xSmall" color="muted" className="ml-auto">
            {dayjs(run.createdAt).fromNow()}
          </Text>
        )}
      </div>
    </Link>
  );
}

function ConfirmTestDialog({
  count,
  running,
  onConfirm,
  onCancel,
  onReload,
  reloading,
}: {
  count: number;
  running: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onReload: () => void;
  reloading: boolean;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm test run"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Icon type="FlaskConical" size="sm" className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <Title level="h4">Run all stored test questions?</Title>
            <Text level="small" color="muted" className="mt-1">
              {count} question{count === 1 ? "" : "s"} from the local library
              will be sent to DB Agent in parallel (concurrency 25). New runs
              will appear in this list as they start.
            </Text>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReload}
            disabled={reloading || running}
            title="Re-scan Kognitos history and update the question library"
          >
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">
              {reloading ? "Reloading…" : "Reload library"}
            </span>
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={running}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm} disabled={running}>
              <Icon type="FlaskConical" size="sm" />
              <span className="ml-1.5">
                {running ? "Starting…" : `Run ${count}`}
              </span>
            </Button>
          </div>
        </div>
      </div>
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
  const inactive =
    "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  let activeClass = "border-primary bg-primary/10 text-foreground";
  if (active && tone === "success")
    activeClass =
      "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (active && tone === "destructive")
    activeClass =
      "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300";
  return (
    <button
      onClick={onClick}
      className={`${base} ${active ? activeClass : inactive}`}
    >
      {label}
    </button>
  );
}
