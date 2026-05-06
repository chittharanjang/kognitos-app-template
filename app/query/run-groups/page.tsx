"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  TrendSparkline,
  VerdictTrendDots,
  trendDirection,
} from "@/app/components/run-trend";
import { StageVersionBadge } from "@/app/components/stage-version-badge";
import { readSseStream } from "@/lib/sse";
import { UAT_QUESTIONS, UAT_CATEGORIES } from "@/lib/uat-questions";

dayjs.extend(relativeTime);

const UAT_TOTAL = UAT_QUESTIONS.length;

/* ─────────────────────────── types ─────────────────────────────────────── */

interface QueryRunGroupSummary {
  questionId: string;
  question: string;
  runCount: number;
  completedCount: number;
  failedCount: number;
  otherCount: number;
  firstRunAt: string;
  lastRunAt: string;
  latestRowCount: number | null;
  rowCountTrend: (number | null)[];
  verdictTrend: ("correct" | "incorrect")[];
  latestStatus: string;
  latestAnswerPreview: string | null;
  latestStage: string | null;
  latestStageVersion: string | null;
  versionsSeen: string[];
}

type SortMode = "recent" | "runs" | "failures";

const SORT_LABEL: Record<SortMode, string> = {
  recent: "Most recent",
  runs: "Most runs",
  failures: "Most failures",
};

interface UatResultEntry {
  question: string;
  category: number;
  categoryName: string;
  status: string;
  runId?: string;
  resultRowCount?: number | null;
  error?: string | null;
  durationMs: number;
}

interface UatProgress {
  total: number;
  completed: number;
  failed: number;
  done: boolean;
  durationMs: number;
  results: UatResultEntry[];
  /** category numbers being run in this session */
  categories: number[] | null;
}

/* ─────────────────────────── page ──────────────────────────────────────── */

export default function QueryRunGroupsPage(): React.ReactElement {
  const router = useRouter();
  const [groups, setGroups] = useState<QueryRunGroupSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [needsBuild, setNeedsBuild] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [sort, setSort] = useState<SortMode>("recent");
  const [building, setBuilding] = useState<boolean>(false);
  const [buildResult, setBuildResult] = useState<{
    totalRunsScanned: number;
    totalIndexed: number;
    uniqueQuestions: number;
  } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchRef = useRef<HTMLDivElement | null>(null);

  // ── UAT state ────────────────────────────────────────────────────────────
  const [uatOpen, setUatOpen] = useState<boolean>(false);
  const [uatRunning, setUatRunning] = useState<boolean>(false);
  const [uatProgress, setUatProgress] = useState<UatProgress | null>(null);
  const [uatError, setUatError] = useState<string | null>(null);
  /** category numbers selected in the UAT panel filter (null = all) */
  const [uatCategories, setUatCategories] = useState<Set<number>>(new Set());
  const uatLogRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounce search → 250 ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (q: string, s: SortMode) => {
    setLoading(true);
    setError(null);
    setNeedsBuild(false);
    try {
      const params = new URLSearchParams();
      if (q) params.set("search", q);
      params.set("sort", s);
      const res = await fetch(`/api/query/run-groups?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        groups?: QueryRunGroupSummary[];
        error?: string;
        needsMigration?: boolean;
      };
      if (!res.ok && !data.needsMigration) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (data.needsMigration) {
        setNeedsBuild(true);
        setError(data.error ?? null);
        setGroups([]);
        return;
      }
      const list = data.groups ?? [];
      setGroups(list);
      if (list.length === 0 && !q) setNeedsBuild(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(debouncedSearch, sort);
  }, [debouncedSearch, sort, load]);

  // Close typeahead when clicking outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const handleBuildIndex = useCallback(async () => {
    setBuilding(true);
    setBuildResult(null);
    setError(null);
    try {
      const res = await fetch("/api/query/run-groups/backfill", {
        method: "POST",
      });
      const data = (await res.json()) as {
        totalRunsScanned?: number;
        totalIndexed?: number;
        uniqueQuestions?: number;
        error?: string;
        needsMigration?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setBuildResult({
        totalRunsScanned: data.totalRunsScanned ?? 0,
        totalIndexed: data.totalIndexed ?? 0,
        uniqueQuestions: data.uniqueQuestions ?? 0,
      });
      setNeedsBuild(false);
      await load(debouncedSearch, sort);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build index");
    } finally {
      setBuilding(false);
    }
  }, [debouncedSearch, sort, load]);

  /* ── UAT handlers ───────────────────────────────────────────────────────── */

  const handleRunUat = useCallback(async () => {
    if (uatRunning) return;

    const categories =
      uatCategories.size > 0 ? Array.from(uatCategories).sort((a, b) => a - b) : null;

    const total = categories
      ? UAT_QUESTIONS.filter((q) => categories.includes(q.category)).length
      : UAT_TOTAL;

    setUatRunning(true);
    setUatError(null);
    setUatProgress({
      total,
      completed: 0,
      failed: 0,
      done: false,
      durationMs: 0,
      results: [],
      categories,
    });

    const body: Record<string, unknown> = { concurrency: 5 };
    if (categories) body.categories = categories;

    const ac = new AbortController();
    abortRef.current = ac;

    const startedAt = Date.now();
    try {
      const res = await fetch("/api/query/uat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      for await (const msg of readSseStream(res)) {
        const event = msg.event;
        const d = msg.data as Record<string, unknown>;

        setUatProgress((prev) => {
          if (!prev) return prev;
          if (event === "result") {
            const entry: UatResultEntry = {
              question: String(d.question ?? ""),
              category: Number(d.category ?? 0),
              categoryName: String(d.categoryName ?? ""),
              status: String(d.status ?? "unknown"),
              runId: typeof d.runId === "string" ? d.runId : undefined,
              resultRowCount:
                typeof d.resultRowCount === "number" ? d.resultRowCount : null,
              error: typeof d.error === "string" ? d.error : null,
              durationMs: Number(d.durationMs ?? 0),
            };
            const isOk = entry.status === "completed";
            return {
              ...prev,
              completed: prev.completed + (isOk ? 1 : 0),
              failed: prev.failed + (isOk ? 0 : 1),
              durationMs: Date.now() - startedAt,
              // Keep the latest 100 results in the log panel
              results: [entry, ...prev.results].slice(0, 100),
            };
          }
          if (event === "done") {
            return {
              ...prev,
              done: true,
              durationMs: Number(d.durationMs ?? Date.now() - startedAt),
            };
          }
          return prev;
        });

        // Auto-scroll the log to the top (newest first)
        if (event === "result" && uatLogRef.current) {
          uatLogRef.current.scrollTop = 0;
        }
      }

      // Refresh the groups list so newly-completed runs appear
      await load(debouncedSearch, sort);
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") {
        setUatError(e instanceof Error ? e.message : "UAT run failed");
      }
    } finally {
      setUatRunning(false);
      abortRef.current = null;
    }
  }, [uatRunning, uatCategories, debouncedSearch, sort, load]);

  const handleCancelUat = useCallback(() => {
    abortRef.current?.abort();
    setUatRunning(false);
  }, []);

  const toggleUatCategory = (cat: number): void => {
    setUatCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Top typeahead suggestions
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return groups.slice(0, 8);
  }, [groups, search]);

  const uatDoneCount = uatProgress?.completed ?? 0;
  const uatFailedCount = uatProgress?.failed ?? 0;
  const uatRunTotal = uatProgress?.total ?? 0;
  const uatPct =
    uatRunTotal > 0
      ? Math.round(((uatDoneCount + uatFailedCount) / uatRunTotal) * 100)
      : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">Query — Run History Groups</Title>
          <Text level="small" color="muted">
            One card per question. Drill in to see every run of that question
            and compare any two side-by-side.
          </Text>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Link href="/query/runs">
            <Button variant="outline" size="sm">
              <Icon type="History" size="sm" />
              <span className="ml-1.5">Flat list</span>
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBuildIndex}
            disabled={building}
            title="Re-scan Kognitos history and refresh the local index"
          >
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">
              {building ? "Building…" : "Rebuild index"}
            </span>
          </Button>
          {/* UAT button */}
          <Button
            size="sm"
            onClick={() => setUatOpen((v) => !v)}
            variant={uatOpen ? "default" : "outline"}
            title={`Run the ${UAT_TOTAL}-question UAT suite against the published Query automation`}
          >
            <Icon type="FlaskConical" size="sm" />
            <span className="ml-1.5">UAT ({UAT_TOTAL})</span>
            {uatRunning && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </Button>
        </div>
      </div>

      {/* ── UAT panel ──────────────────────────────────────────────────── */}
      {uatOpen && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon type="FlaskConical" size="sm" className="text-primary" />
              <span className="text-sm font-semibold">
                UAT — {UAT_TOTAL} questions, 16 categories
              </span>
              {uatRunning && (
                <Badge variant="secondary">
                  {uatDoneCount + uatFailedCount} / {uatRunTotal}
                </Badge>
              )}
              {uatProgress?.done && (
                <Badge variant={uatFailedCount > 0 ? "destructive" : "success"}>
                  {uatFailedCount === 0
                    ? `All ${uatDoneCount} passed`
                    : `${uatDoneCount} passed · ${uatFailedCount} failed`}
                </Badge>
              )}
            </div>
            <button
              onClick={() => setUatOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close UAT panel"
            >
              <Icon type="X" size="sm" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* category filter chips */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Filter by category
                {uatCategories.size > 0 && (
                  <button
                    className="ml-2 text-primary hover:underline normal-case text-xs tracking-normal"
                    onClick={() => setUatCategories(new Set())}
                  >
                    clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {UAT_CATEGORIES.map(({ category, categoryName, count }) => {
                  const active = uatCategories.has(category);
                  return (
                    <button
                      key={category}
                      onClick={() => toggleUatCategory(category)}
                      title={categoryName}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-foreground font-medium"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {category}. {categoryName}
                      <span className="ml-1 opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>
              {uatCategories.size > 0 && (
                <Text level="xSmall" color="muted" className="mt-1">
                  {UAT_QUESTIONS.filter((q) => uatCategories.has(q.category)).length} of{" "}
                  {UAT_TOTAL} questions selected
                </Text>
              )}
            </div>

            {/* action row */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                size="sm"
                onClick={handleRunUat}
                disabled={uatRunning}
                title="Run selected UAT questions against the published SQL Query Generator automation"
              >
                <Icon type={uatRunning ? "Loader2" : "Play"} size="sm" />
                <span className="ml-1.5">
                  {uatRunning
                    ? "Running…"
                    : uatCategories.size > 0
                      ? `Run ${UAT_QUESTIONS.filter((q) => uatCategories.has(q.category)).length} questions`
                      : `Run all ${UAT_TOTAL} questions`}
                </span>
              </Button>
              {uatRunning && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelUat}
                >
                  <Icon type="Square" size="sm" />
                  <span className="ml-1.5">Cancel</span>
                </Button>
              )}
              {uatProgress && !uatRunning && uatProgress.done && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setUatProgress(null);
                    setUatError(null);
                  }}
                >
                  <Icon type="Trash" size="sm" />
                  <span className="ml-1.5">Clear results</span>
                </Button>
              )}
              <Text level="xSmall" color="muted">
                Uses the{" "}
                <strong>published</strong> automation · concurrency 5
              </Text>
            </div>

            {uatError && (
              <Alert variant="destructive">
                <AlertTitle>UAT error</AlertTitle>
                <AlertDescription>{uatError}</AlertDescription>
              </Alert>
            )}

            {/* progress bar */}
            {uatProgress && uatRunTotal > 0 && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      uatFailedCount > 0 ? "bg-red-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${uatPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {uatDoneCount + uatFailedCount} / {uatRunTotal} ·{" "}
                    {uatDoneCount} ✓{" "}
                    {uatFailedCount > 0 && (
                      <span className="text-red-500 font-medium">
                        · {uatFailedCount} ✗
                      </span>
                    )}
                  </span>
                  {uatProgress.done && (
                    <span className="font-medium">
                      Done in {(uatProgress.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* live results log */}
            {uatProgress && uatProgress.results.length > 0 && (
              <div
                ref={uatLogRef}
                className="max-h-72 overflow-y-auto rounded-lg border border-border bg-muted/20 text-xs divide-y divide-border"
              >
                {uatProgress.results.map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 px-3 py-2 ${
                      r.status === "completed"
                        ? ""
                        : "bg-red-50 dark:bg-red-950/20"
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 font-semibold ${
                        r.status === "completed"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {r.status === "completed" ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="line-clamp-2 text-foreground">
                        {r.question}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <span className="font-mono">{r.categoryName}</span>
                        {r.resultRowCount != null && (
                          <span>{r.resultRowCount} row{r.resultRowCount === 1 ? "" : "s"}</span>
                        )}
                        <span>{(r.durationMs / 1000).toFixed(1)}s</span>
                        {r.runId && (
                          <Link
                            href={`/query/runs/${r.runId}`}
                            className="text-primary hover:underline"
                          >
                            view
                          </Link>
                        )}
                        {r.error && (
                          <span
                            className="text-red-500 truncate max-w-xs"
                            title={r.error}
                          >
                            {r.error}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-muted-foreground/60 tabular-nums">
                      {(r.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── existing alerts ─────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load groups</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {buildResult && (
        <Alert>
          <AlertTitle>Index rebuilt</AlertTitle>
          <AlertDescription>
            Scanned {buildResult.totalRunsScanned} run
            {buildResult.totalRunsScanned === 1 ? "" : "s"}, indexed{" "}
            {buildResult.totalIndexed}, found {buildResult.uniqueQuestions}{" "}
            unique question
            {buildResult.uniqueQuestions === 1 ? "" : "s"}.
          </AlertDescription>
        </Alert>
      )}

      {needsBuild && !error && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center space-y-3">
          <Icon
            type="Layers3"
            size="xl"
            className="mx-auto text-muted-foreground"
          />
          <div>
            <Title level="h4">No runs indexed yet</Title>
            <Text level="small" color="muted" className="mt-1">
              Click <strong>Build index</strong> to scan the SQL Query
              Generator's history from Kognitos and group every run by its
              question.
            </Text>
          </div>
          <Button onClick={handleBuildIndex} disabled={building} size="sm">
            <Icon type="Download" size="sm" />
            <span className="ml-1.5">
              {building ? "Building…" : "Build index"}
            </span>
          </Button>
        </div>
      )}

      {/* ── search + sort ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div ref={searchRef} className="relative flex-1 min-w-[280px]">
          <Icon
            type="Search"
            size="sm"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length > 0) {
                router.push(`/query/run-groups/${suggestions[0].questionId}`);
                setShowSuggestions(false);
              } else if (e.key === "Escape") {
                setShowSuggestions(false);
              }
            }}
            placeholder="Search questions… (type to filter, Enter to open the top match)"
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-80 overflow-auto rounded-md border border-border bg-popover shadow-lg">
              {suggestions.map((g) => (
                <button
                  key={g.questionId}
                  onClick={() => {
                    router.push(`/query/run-groups/${g.questionId}`);
                    setShowSuggestions(false);
                  }}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors"
                >
                  <span className="line-clamp-1 flex-1">{g.question}</span>
                  <Badge variant="secondary">
                    {g.runCount} run{g.runCount === 1 ? "" : "s"}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {(Object.keys(SORT_LABEL) as SortMode[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                sort === s
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {/* ── group cards ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : groups.length === 0 && !needsBuild ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Icon type="Search" size="lg" className="text-muted-foreground" />
          <Text color="muted">
            {debouncedSearch
              ? `No questions match "${debouncedSearch}".`
              : "No question groups indexed."}
          </Text>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard key={g.questionId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── GroupCard ─────────────────────────────────── */

function GroupCard({
  group,
}: {
  group: QueryRunGroupSummary;
}): React.ReactElement {
  const direction = trendDirection(group.verdictTrend);
  const directionBadge =
    direction === "improved" ? (
      <Badge variant="success">Improved</Badge>
    ) : direction === "regressed" ? (
      <Badge variant="destructive">Regressed</Badge>
    ) : null;

  return (
    <Link
      href={`/query/run-groups/${group.questionId}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Icon type="Layers3" size="sm" className="text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                Question
              </div>
              <Text level="base" className="font-semibold line-clamp-2">
                {group.question}
              </Text>
            </div>
            {group.latestAnswerPreview && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  Latest answer
                </div>
                <Text level="small" className="line-clamp-2 text-muted-foreground">
                  {group.latestAnswerPreview}
                </Text>
              </div>
            )}
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

      <div className="mt-3 pl-12 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">
          {group.runCount} run{group.runCount === 1 ? "" : "s"}
        </Badge>
        {group.completedCount > 0 && (
          <Badge variant="success">{group.completedCount} ✓</Badge>
        )}
        {group.failedCount > 0 && (
          <Badge variant="destructive">{group.failedCount} ✗</Badge>
        )}
        <StageVersionBadge
          stage={group.latestStage}
          stageVersion={group.latestStageVersion}
        />
        {group.versionsSeen.length > 1 && (
          <Badge
            variant="secondary"
            title={`Versions seen across this question's runs: ${group.versionsSeen.join(", ")}`}
          >
            {group.versionsSeen.length} versions
          </Badge>
        )}
        {directionBadge}
        <span className="ml-auto text-xs text-muted-foreground">
          last run {dayjs(group.lastRunAt).fromNow()}
        </span>
      </div>

      <div className="mt-3 pl-12 grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
            Rows
          </span>
          <TrendSparkline values={group.rowCountTrend} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {group.rowCountTrend
              .filter((v): v is number => typeof v === "number")
              .join(" → ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Verdicts
          </span>
          <VerdictTrendDots verdicts={group.verdictTrend} />
        </div>
      </div>
    </Link>
  );
}
