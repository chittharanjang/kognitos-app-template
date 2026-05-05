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
import { readSseStream } from "@/lib/sse";
import {
  VerdictToggle,
  NotesField,
  type Verdict,
} from "@/app/components/verdict-controls";
import { StageVersionBadge } from "@/app/components/stage-version-badge";

dayjs.extend(relativeTime);

interface RunSummary {
  runId: string;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  stageVersion: string | null;
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

interface VerdictEntry {
  verdict: Verdict;
  notes: string | null;
  question: string | null;
  answer: string | null;
  updatedAt: string | null;
}

type StatusFilter = "all" | "completed" | "failed" | "other";
type VerdictFilter = "all" | "correct" | "incorrect";

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
  completed: number;
  failed: number;
  stage: string | null;
  durationMs: number;
}

interface RecentResult {
  question: string;
  status: string;
  recordCount?: number;
  durationMs: number;
}

interface BatchProgress {
  total: number;
  concurrency: number;
  stage: string | null;
  completed: number;
  failed: number;
  recent: RecentResult[];
  startedAt: number;
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
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");

  const [verdicts, setVerdicts] = useState<Record<string, VerdictEntry>>({});
  const [verdictError, setVerdictError] = useState<string | null>(null);

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
  const [progress, setProgress] = useState<BatchProgress | null>(null);
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

      // Make sure every visible run has an explicit row in the verdict
      // table so the toggle UI always reflects a real value (default
      // 'correct'). The same call also upserts each run into the run index
      // (powering the Run History Groups view), so browsing this list keeps
      // both stores fresh without a separate request. Idempotent server-side.
      try {
        await fetch("/api/ama-agent/runs/verdicts/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runs: data.runs.map((r) => ({
              runId: r.runId,
              question: r.question,
              answer: r.answer,
              createdAt: r.createdAt,
              status: r.status,
              recordCount: r.recordCount,
              databasesQueried: r.databasesQueried,
              stage: r.stage,
              stageVersion: r.stageVersion,
            })),
          }),
        });
      } catch {
        // ignore bootstrap failures — the user can still view the list
      }
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

  const loadVerdicts = useCallback(async () => {
    try {
      const res = await fetch("/api/ama-agent/runs/verdicts", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        verdicts?: Record<string, VerdictEntry>;
        error?: string;
        needsMigration?: boolean;
      };
      if (!res.ok && !data.needsMigration) {
        setVerdictError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setVerdicts(data.verdicts ?? {});
      setVerdictError(data.needsMigration ? (data.error ?? null) : null);
    } catch (e) {
      setVerdictError(
        e instanceof Error ? e.message : "Failed to load verdicts",
      );
    }
  }, []);

  const saveVerdictRow = useCallback(
    async (
      run: RunSummary,
      next: { verdict: Verdict; notes: string | null },
    ) => {
      const previous = verdicts[run.runId] ?? null;
      const optimistic: VerdictEntry = {
        verdict: next.verdict,
        notes: next.notes,
        question: run.question,
        answer: run.answer,
        updatedAt: new Date().toISOString(),
      };

      setVerdicts((prev) => ({ ...prev, [run.runId]: optimistic }));

      try {
        const res = await fetch("/api/ama-agent/runs/verdicts", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: run.runId,
            question: run.question,
            answer: run.answer,
            verdict: next.verdict,
            notes: next.notes,
          }),
        });
        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const data = (await res.json()) as { error?: string };
            if (data.error) message = data.error;
          } catch {
            // ignore
          }
          throw new Error(message);
        }
        setVerdictError(null);
      } catch (e) {
        setVerdicts((prev) => {
          const copy = { ...prev };
          if (previous) {
            copy[run.runId] = previous;
          } else {
            delete copy[run.runId];
          }
          return copy;
        });
        setVerdictError(
          e instanceof Error ? e.message : "Failed to save verdict",
        );
      }
    },
    [verdicts],
  );

  const setVerdict = useCallback(
    (run: RunSummary, next: Verdict) => {
      const current = verdicts[run.runId];
      saveVerdictRow(run, {
        verdict: next,
        notes: current?.notes ?? null,
      });
    },
    [verdicts, saveVerdictRow],
  );

  const setNotes = useCallback(
    (run: RunSummary, notes: string | null) => {
      const current = verdicts[run.runId];
      saveVerdictRow(run, {
        verdict: current?.verdict ?? "correct",
        notes,
      });
    },
    [verdicts, saveVerdictRow],
  );

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
    setProgress(null);
    setQuestionLoadError(null);
    setConfirmOpen(false);

    let stage: string | null = null;
    try {
      const res = await fetch("/api/ama-agent/test-questions/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 25 }),
      });

      if (!res.ok) {
        // Non-streaming error response (e.g. missing migration, 500).
        let message = `HTTP ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          // ignore
        }
        setQuestionLoadError(message);
        return;
      }

      // Live SSE consumption — every `result` event nudges the runs list and
      // the progress card so the user sees rows light up as they finish.
      let total = 0;
      let completed = 0;
      let failed = 0;
      const recent: RecentResult[] = [];
      let lastListRefresh = 0;

      type InitData = {
        total: number;
        concurrency: number;
        stage: string;
      };
      type ResultData = {
        question: string;
        status: string;
        recordCount?: number;
        durationMs: number;
      };
      type DoneData = {
        total: number;
        completed: number;
        failed: number;
        durationMs: number;
      };

      for await (const msg of readSseStream<unknown>(res)) {
        if (msg.event === "init") {
          const d = msg.data as InitData;
          total = d.total;
          stage = d.stage;
          setProgress({
            total: d.total,
            concurrency: d.concurrency,
            stage: d.stage,
            completed: 0,
            failed: 0,
            recent: [],
            startedAt: Date.now(),
          });
        } else if (msg.event === "result") {
          const d = msg.data as ResultData;
          if (d.status === "completed") completed++;
          else failed++;
          recent.unshift({
            question: d.question,
            status: d.status,
            recordCount: d.recordCount,
            durationMs: d.durationMs,
          });
          if (recent.length > 6) recent.length = 6;
          setProgress((p) =>
            p
              ? {
                  ...p,
                  completed,
                  failed,
                  recent: [...recent],
                }
              : p,
          );
          // Refresh the underlying runs list at most every 4s so the user
          // sees newly-finished runs without spamming the runs API.
          const now = Date.now();
          if (now - lastListRefresh > 4000) {
            lastListRefresh = now;
            refresh().catch(() => {});
          }
        } else if (msg.event === "done") {
          const d = msg.data as DoneData;
          setLastTestResult({
            total: d.total,
            completed: d.completed,
            failed: d.failed,
            stage,
            durationMs: d.durationMs,
          });
        }
      }

      // Final refresh once the stream ends so every run is reflected, even
      // if the throttle skipped the last few results.
      await refresh().catch(() => {});
      void total;
    } catch (e) {
      setQuestionLoadError(
        e instanceof Error ? e.message : "Failed to start test run",
      );
    } finally {
      setTesting(false);
      setProgress(null);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    refreshQuestionCount();
    loadVerdicts();
  }, [refresh, refreshQuestionCount, loadVerdicts]);

  const counts = useMemo(() => {
    const c = { all: runs.length, completed: 0, failed: 0, other: 0 };
    for (const r of runs) {
      const b = bucketStatus(r.status);
      c[b] += 1;
    }
    return c;
  }, [runs]);

  const verdictCounts = useMemo(() => {
    const c = { all: runs.length, correct: 0, incorrect: 0 };
    for (const r of runs) {
      const effective: Verdict = verdicts[r.runId]?.verdict ?? "correct";
      if (effective === "correct") c.correct += 1;
      else c.incorrect += 1;
    }
    return c;
  }, [runs, verdicts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter !== "all" && bucketStatus(r.status) !== statusFilter) {
        return false;
      }
      if (verdictFilter !== "all") {
        const effective: Verdict = verdicts[r.runId]?.verdict ?? "correct";
        if (effective !== verdictFilter) return false;
      }
      if (q) {
        const hay = `${r.question ?? ""} ${r.answer ?? ""} ${r.errorText ?? ""} ${r.runId} ${verdicts[r.runId]?.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [runs, statusFilter, verdictFilter, verdicts, search]);

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

      {verdictError && (
        <Alert variant="destructive">
          <AlertTitle>Verdicts unavailable</AlertTitle>
          <AlertDescription>{verdictError}</AlertDescription>
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

      {progress && (
        <BatchProgressCard
          progress={progress}
          label="DB Agent"
        />
      )}

      {!progress && lastTestResult && (
        <Alert>
          <AlertTitle>Test batch finished</AlertTitle>
          <AlertDescription>
            Completed {lastTestResult.completed} of {lastTestResult.total} runs
            against the{" "}
            <strong>
              {lastTestResult.stage === "AUTOMATION_STAGE_PUBLISHED"
                ? "published"
                : lastTestResult.stage
                    ?.replace(/^AUTOMATION_STAGE_/, "")
                    .toLowerCase() ?? "configured"}
            </strong>{" "}
            stage of DB Agent
            {lastTestResult.failed > 0
              ? ` (${lastTestResult.failed} failed)`
              : ""}{" "}
            in {formatDuration(lastTestResult.durationMs)}. Click any row below
            to see the full answer and SQL.
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

      <div className="flex flex-wrap items-center gap-2">
        <Text level="xSmall" color="muted" className="uppercase tracking-wide">
          Verdict
        </Text>
        <FilterChip
          label={`All (${verdictCounts.all})`}
          active={verdictFilter === "all"}
          onClick={() => setVerdictFilter("all")}
        />
        <FilterChip
          label={`Correct (${verdictCounts.correct})`}
          active={verdictFilter === "correct"}
          onClick={() => setVerdictFilter("correct")}
          tone="success"
        />
        <FilterChip
          label={`Incorrect (${verdictCounts.incorrect})`}
          active={verdictFilter === "incorrect"}
          onClick={() => setVerdictFilter("incorrect")}
          tone="destructive"
        />
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
            <RunCard
              key={r.runId}
              run={r}
              verdict={verdicts[r.runId]?.verdict ?? "correct"}
              notes={verdicts[r.runId]?.notes ?? null}
              onSetVerdict={setVerdict}
              onSetNotes={setNotes}
            />
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

function RunCard({
  run,
  verdict,
  notes,
  onSetVerdict,
  onSetNotes,
}: {
  run: RunSummary;
  verdict: Verdict;
  notes: string | null;
  onSetVerdict: (run: RunSummary, next: Verdict) => void;
  onSetNotes: (run: RunSummary, notes: string | null) => void;
}): React.ReactElement {
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
        <StageVersionBadge
          stage={run.stage}
          stageVersion={run.stageVersion}
        />
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
      <div
        className="mt-3 pl-12 flex flex-wrap items-center gap-3"
        onClick={(e) => e.preventDefault()}
      >
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Verdict
        </span>
        <VerdictToggle
          value={verdict}
          onChange={(next) => onSetVerdict(run, next)}
        />
        {run.createdAt && (
          <span
            className="text-xs text-muted-foreground tabular-nums"
            title={dayjs(run.createdAt).format("YYYY-MM-DD HH:mm:ss")}
          >
            {dayjs(run.createdAt).format("MMM D, YYYY h:mm A")}
          </span>
        )}
      </div>
      <div
        className="mt-2 pl-12"
        onClick={(e) => e.preventDefault()}
      >
        <NotesField
          value={notes}
          onSave={(next) => onSetNotes(run, next)}
        />
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
              will be sent to the <strong>published</strong> DB Agent in
              parallel (concurrency 25). New runs will appear in this list as
              they start.
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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function BatchProgressCard({
  progress,
  label,
}: {
  progress: BatchProgress;
  label: string;
}): React.ReactElement {
  const { total, completed, failed, recent, concurrency, stage, startedAt } =
    progress;
  const finished = completed + failed;
  const running = Math.max(
    0,
    Math.min(concurrency, total - finished),
  );
  const pct = total === 0 ? 0 : Math.round((finished / total) * 100);
  const stageLabel =
    stage === "AUTOMATION_STAGE_PUBLISHED"
      ? "published"
      : (stage?.replace(/^AUTOMATION_STAGE_/, "").toLowerCase() ?? "configured");
  const elapsed = Date.now() - startedAt;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Icon type="FlaskConical" size="sm" className="text-primary" />
          </div>
          <div className="min-w-0">
            <Title level="h4">
              Running {label} test batch — {finished} / {total}
            </Title>
            <Text level="small" color="muted">
              {stageLabel} stage · concurrency {concurrency} · elapsed{" "}
              {formatDuration(elapsed)}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary">{running} running</Badge>
          <Badge variant="secondary">{completed} completed</Badge>
          {failed > 0 && (
            <Badge variant="destructive">{failed} failed</Badge>
          )}
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {recent.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Recently finished
          </div>
          <ul className="space-y-1">
            {recent.map((r, i) => (
              <li
                key={`${r.question}-${i}`}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full shrink-0 ${
                    r.status === "completed"
                      ? "bg-emerald-500"
                      : "bg-red-500"
                  }`}
                />
                <span className="truncate flex-1" title={r.question}>
                  {r.question}
                </span>
                {typeof r.recordCount === "number" && r.recordCount > 0 && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {r.recordCount} rec
                  </span>
                )}
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                  {formatDuration(r.durationMs)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
