"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type Verdict,
} from "@/app/components/verdict-controls";
import { StageVersionBadge } from "@/app/components/stage-version-badge";
import {
  TrendSparkline,
  VerdictTrendDots,
  trendDirection,
} from "@/app/components/run-trend";
import { UAT_QUESTIONS, UAT_CATEGORIES } from "@/lib/uat-questions";

dayjs.extend(relativeTime);

/* ── UAT category helpers (no server deps) ──────────────────────────────── */
function normQ(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
const UAT_CAT_MAP = new Map<string, number>(
  UAT_QUESTIONS.map((q) => [normQ(q.question), q.category]),
);
const UAT_CAT_NAME_MAP = new Map<number, string>(
  UAT_CATEGORIES.map(({ category, categoryName }) => [category, categoryName]),
);
function questionCategory(text: string | null | undefined): number | null {
  if (!text) return null;
  return UAT_CAT_MAP.get(normQ(text)) ?? null;
}
const UAT_TOTAL = UAT_QUESTIONS.length;

/* ── Types ───────────────────────────────────────────────────────────────── */
interface RunSummary {
  runId: string;
  createdAt: string | null;
  stage: string | null;
  stageVersion: string | null;
  status: string;
  question: string | null;
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
interface RunGroupSummary {
  questionId: string;
  question: string;
  runCount: number;
  completedCount: number;
  failedCount: number;
  firstRunAt: string;
  lastRunAt: string;
  latestRecordCount: number | null;
  recordCountTrend: (number | null)[];
  verdictTrend: ("correct" | "incorrect")[];
  latestStatus: string;
  latestAnswerPreview: string | null;
  latestStage: string | null;
  latestStageVersion: string | null;
  versionsSeen: string[];
  databasesUsed: string[];
}
interface CategoryBucket {
  category: number | null;
  categoryName: string;
  groups: RunGroupSummary[];
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
}
type ViewMode = "all" | "by-question" | "by-category";
type StatusFilter = "all" | "completed" | "failed";
interface UatResultEntry {
  question: string;
  category: number;
  categoryName: string;
  status: string;
  runId?: string;
  recordCount?: number | null;
  responseText?: string | null;
  error?: string | null;
  durationMs: number;
  /** Auto-grading state: undefined = not graded, "grading" = in progress */
  verdict?: "correct" | "incorrect" | "grading" | "grade_error";
  gradingReason?: string;
}
interface UatProgress {
  total: number;
  completed: number;
  failed: number;
  done: boolean;
  durationMs: number;
  results: UatResultEntry[];
  categories: number[] | null;
}
interface BatchProgress {
  total: number;
  concurrency: number;
  stage: string | null;
  completed: number;
  failed: number;
  recent: { question: string; status: string; recordCount?: number; durationMs: number }[];
  startedAt: number;
}
interface TestRunResult {
  total: number;
  completed: number;
  failed: number;
  stage: string | null;
  durationMs: number;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function bucketStatus(status: string): "completed" | "failed" | "other" {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "awaiting_guidance") return "failed";
  return "other";
}
function statusBadge(status: string): React.ReactElement {
  if (status === "completed") return <Badge variant="success">completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">failed</Badge>;
  if (status === "awaiting_guidance") return <Badge variant="destructive">awaiting</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 === 0 ? `${m}m` : `${m}m ${s % 60}s`;
}
const PAGE_SIZE = 25;

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function RunsHistoryPage(): React.ReactElement {
  /* view state */
  const [view, setView] = useState<ViewMode>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  /* all-runs state */
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictEntry>>({});
  const [verdictError, setVerdictError] = useState<string | null>(null);

  /* groups state */
  const [groups, setGroups] = useState<RunGroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsNeedsBuild, setGroupsNeedsBuild] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [building, setBuilding] = useState(false);

  /* test button state */
  const [questionCount, setQuestionCount] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [lastTestResult, setLastTestResult] = useState<TestRunResult | null>(null);

  /* UAT state */
  const [uatOpen, setUatOpen] = useState(false);
  const [uatRunning, setUatRunning] = useState(false);
  const [uatProgress, setUatProgress] = useState<UatProgress | null>(null);
  const [uatError, setUatError] = useState<string | null>(null);
  const [uatCategories, setUatCategories] = useState<Set<number>>(new Set());
  const uatAbortRef = useRef<AbortController | null>(null);
  const uatLogRef = useRef<HTMLDivElement | null>(null);

  /* bulk auto-grade state */
  const [autoGrading, setAutoGrading] = useState(false);
  const [autoGradeProgress, setAutoGradeProgress] = useState<{ done: number; total: number; correct: number; incorrect: number } | null>(null);

  /* general */
  const [error, setError] = useState<string | null>(null);

  /* ── Data loading ───────────────────────────────────────────────────────── */
  const loadPage = useCallback(async (pageToken: string | null, append: boolean) => {
    const params = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`/api/ama-agent/runs?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { runs: RunSummary[]; nextPageToken: string | null };
    setNextPageToken(data.nextPageToken);
    setRuns((prev) => (append ? [...prev, ...data.runs] : data.runs));
    try {
      await fetch("/api/ama-agent/runs/verdicts/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runs: data.runs.map((r) => ({
            runId: r.runId, question: r.question, answer: r.answer,
            createdAt: r.createdAt, status: r.status, recordCount: r.recordCount,
            databasesQueried: r.databasesQueried, stage: r.stage, stageVersion: r.stageVersion,
          })),
        }),
      });
    } catch { /* ignore */ }
  }, []);

  const refresh = useCallback(async () => {
    setRunsLoading(true);
    setError(null);
    try { await loadPage(null, false); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load runs"); }
    finally { setRunsLoading(false); }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try { await loadPage(nextPageToken, true); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load more"); }
    finally { setLoadingMore(false); }
  }, [loadPage, nextPageToken]);

  const loadVerdicts = useCallback(async () => {
    try {
      const res = await fetch("/api/ama-agent/runs/verdicts", { cache: "no-store" });
      const data = (await res.json()) as { verdicts?: Record<string, VerdictEntry>; error?: string; needsMigration?: boolean };
      if (!res.ok && !data.needsMigration) { setVerdictError(data.error ?? `HTTP ${res.status}`); return; }
      setVerdicts(data.verdicts ?? {});
    } catch (e) { setVerdictError(e instanceof Error ? e.message : "Failed to load verdicts"); }
  }, []);

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true);
    setGroupsNeedsBuild(false);
    try {
      const res = await fetch("/api/ama-agent/run-groups?sort=recent", { cache: "no-store" });
      const data = (await res.json()) as { groups?: RunGroupSummary[]; needsMigration?: boolean; error?: string };
      if (data.needsMigration) { setGroupsNeedsBuild(true); return; }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setGroups(data.groups ?? []);
      setGroupsLoaded(true);
      if ((data.groups ?? []).length === 0) setGroupsNeedsBuild(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load groups"); }
    finally { setGroupsLoading(false); }
  }, []);

  const handleBuildIndex = useCallback(async () => {
    setBuilding(true);
    try {
      const res = await fetch("/api/ama-agent/run-groups/backfill", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { setError(data.error ?? `HTTP ${res.status}`); return; }
      setGroupsNeedsBuild(false);
      setGroupsLoaded(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to build index"); }
    finally { setBuilding(false); }
  }, []);

  const refreshQuestionCount = useCallback(async () => {
    try {
      const res = await fetch("/api/ama-agent/test-questions", { cache: "no-store" });
      const data = (await res.json()) as { total?: number };
      setQuestionCount(data.total ?? 0);
    } catch { setQuestionCount(0); }
  }, []);

  const saveVerdict = useCallback(async (run: RunSummary, verdict: Verdict) => {
    const prev = verdicts[run.runId];
    const optimistic: VerdictEntry = {
      verdict, notes: prev?.notes ?? null,
      question: run.question, answer: run.answer, updatedAt: new Date().toISOString(),
    };
    setVerdicts((v) => ({ ...v, [run.runId]: optimistic }));
    try {
      await fetch("/api/ama-agent/runs/verdicts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.runId, question: run.question, answer: run.answer, verdict, notes: prev?.notes ?? null }),
      });
    } catch {
      setVerdicts((v) => { const c = { ...v }; if (prev) c[run.runId] = prev; else delete c[run.runId]; return c; });
    }
  }, [verdicts]);

  /* ── Test run ─────────────────────────────────────────────────────────── */
  const handleRunTest = useCallback(async () => {
    setTesting(true);
    setLastTestResult(null);
    setProgress(null);
    setConfirmOpen(false);
    let stage: string | null = null;
    let completed = 0, failed = 0;
    const recent: BatchProgress["recent"] = [];
    let lastRefresh = 0;
    try {
      const res = await fetch("/api/ama-agent/test-questions/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concurrency: 25 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for await (const msg of readSseStream<unknown>(res)) {
        if (msg.event === "init") {
          const d = msg.data as { total: number; concurrency: number; stage: string };
          stage = d.stage;
          setProgress({ total: d.total, concurrency: d.concurrency, stage: d.stage, completed: 0, failed: 0, recent: [], startedAt: Date.now() });
        } else if (msg.event === "result") {
          const d = msg.data as { question: string; status: string; recordCount?: number; durationMs: number };
          if (d.status === "completed") completed++; else failed++;
          recent.unshift({ question: d.question, status: d.status, recordCount: d.recordCount, durationMs: d.durationMs });
          if (recent.length > 6) recent.length = 6;
          setProgress((p) => p ? { ...p, completed, failed, recent: [...recent] } : p);
          const now = Date.now();
          if (now - lastRefresh > 4000) { lastRefresh = now; refresh().catch(() => {}); }
        } else if (msg.event === "done") {
          const d = msg.data as { total: number; completed: number; failed: number; durationMs: number };
          setLastTestResult({ total: d.total, completed: d.completed, failed: d.failed, stage, durationMs: d.durationMs });
        }
      }
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Test run failed"); }
    finally { setTesting(false); setProgress(null); }
  }, [refresh]);

  /* ── UAT run ──────────────────────────────────────────────────────────── */
  const handleRunUat = useCallback(async () => {
    if (uatRunning) return;
    const cats = uatCategories.size > 0 ? Array.from(uatCategories).sort((a, b) => a - b) : null;
    const total = cats ? UAT_QUESTIONS.filter((q) => cats.includes(q.category)).length : UAT_TOTAL;
    setUatRunning(true);
    setUatError(null);
    setUatProgress({ total, completed: 0, failed: 0, done: false, durationMs: 0, results: [], categories: cats });
    const body: Record<string, unknown> = { concurrency: 5 };
    if (cats) body.categories = cats;
    const ac = new AbortController();
    uatAbortRef.current = ac;
    const startedAt = Date.now();
    try {
      const res = await fetch("/api/ama-agent/uat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      for await (const msg of readSseStream(res)) {
        const d = msg.data as Record<string, unknown>;
        if (msg.event === "result") {
          const entryStatus = String(d.status ?? "unknown");
          const entry: UatResultEntry = {
            question: String(d.question ?? ""), category: Number(d.category ?? 0),
            categoryName: String(d.categoryName ?? ""), status: entryStatus,
            runId: typeof d.runId === "string" ? d.runId : undefined,
            recordCount: typeof d.recordCount === "number" ? d.recordCount : null,
            responseText: typeof d.responseText === "string" ? d.responseText : null,
            error: typeof d.error === "string" ? d.error : null, durationMs: Number(d.durationMs ?? 0),
            verdict: entryStatus === "completed" ? "grading" : undefined,
          };
          const isOk = entryStatus === "completed";
          setUatProgress((prev) => {
            if (!prev) return prev;
            return { ...prev, completed: prev.completed + (isOk ? 1 : 0), failed: prev.failed + (isOk ? 0 : 1), durationMs: Date.now() - startedAt, results: [entry, ...prev.results].slice(0, 100) };
          });
          // Auto-grade completed runs
          if (isOk && entry.runId && entry.responseText) {
            void (async () => {
              try {
                const gr = await fetch("/api/grade-run", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ automationType: "ama-agent", runId: entry.runId, questionText: entry.question, runOutput: entry.responseText }),
                });
                const gd = (await gr.json()) as { verdict?: string; reasoning?: string };
                const v = gd.verdict === "correct" ? "correct" : gd.verdict === "incorrect" ? "incorrect" : "grade_error";
                setUatProgress((prev) => {
                  if (!prev) return prev;
                  return { ...prev, results: prev.results.map((r) => r.runId === entry.runId ? { ...r, verdict: v, gradingReason: gd.reasoning } : r) };
                });
              } catch {
                setUatProgress((prev) => {
                  if (!prev) return prev;
                  return { ...prev, results: prev.results.map((r) => r.runId === entry.runId ? { ...r, verdict: "grade_error" } : r) };
                });
              }
            })();
          }
          if (uatLogRef.current) uatLogRef.current.scrollTop = 0;
        } else if (msg.event === "done") {
          const d2 = msg.data as Record<string, unknown>;
          setUatProgress((prev) => prev ? { ...prev, done: true, durationMs: Number(d2.durationMs ?? Date.now() - startedAt) } : prev);
        }
      }
      await refresh();
      setGroupsLoaded(false);
    } catch (e) {
      if ((e as { name?: string }).name !== "AbortError") setUatError(e instanceof Error ? e.message : "UAT failed");
    } finally { setUatRunning(false); uatAbortRef.current = null; }
  }, [uatRunning, uatCategories, refresh]);

  const handleCancelUat = useCallback(() => { uatAbortRef.current?.abort(); setUatRunning(false); }, []);

  const toggleUatCategory = (cat: number) => {
    setUatCategories((prev) => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next; });
  };

  /* ── Bulk auto-grade ──────────────────────────────────────────────────── */
  const handleAutoGrade = useCallback(async () => {
    if (autoGrading) return;
    const candidates = Object.entries(verdicts).filter(([, v]) => {
      if (!v.question) return false;
      const inAnswerKey = UAT_QUESTIONS.some((q) => normQ(q.question) === normQ(v.question ?? ""));
      if (!inAnswerKey) return false;
      const alreadyGraded = v.notes?.startsWith("[Auto-graded]");
      return !alreadyGraded;
    });
    if (candidates.length === 0) { alert("No ungraded UAT runs found in the current view."); return; }
    setAutoGrading(true);
    setAutoGradeProgress({ done: 0, total: candidates.length, correct: 0, incorrect: 0 });
    const CONCURRENCY = 3;
    let idx = 0;
    let correct = 0, incorrect = 0;
    async function worker() {
      while (true) {
        const i = idx++;
        if (i >= candidates.length) return;
        const [runId, v] = candidates[i];
        try {
          const gr = await fetch("/api/grade-run", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ automationType: "ama-agent", runId, questionText: v.question, runOutput: v.answer ?? "" }),
          });
          const gd = (await gr.json()) as { verdict?: string; skipped?: boolean };
          if (!gd.skipped) {
            if (gd.verdict === "correct") correct++;
            else if (gd.verdict === "incorrect") incorrect++;
            setVerdicts((prev) => ({
              ...prev,
              [runId]: { ...prev[runId], verdict: gd.verdict === "correct" ? "correct" : "incorrect" },
            }));
          }
        } catch { /* continue */ }
        setAutoGradeProgress((p) => p ? { ...p, done: p.done + 1, correct, incorrect } : p);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, () => worker()));
    setAutoGrading(false);
  }, [autoGrading, verdicts]);

  /* ── Effects ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    refresh();
    refreshQuestionCount();
    loadVerdicts();
  }, [refresh, refreshQuestionCount, loadVerdicts]);

  useEffect(() => {
    if ((view === "by-question" || view === "by-category") && !groupsLoaded) {
      loadGroups();
    }
  }, [view, groupsLoaded, loadGroups]);

  /* ── Computed ─────────────────────────────────────────────────────────── */
  const filteredRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter === "completed" && r.status !== "completed") return false;
      if (statusFilter === "failed" && bucketStatus(r.status) !== "failed") return false;
      if (q) {
        const hay = `${r.question ?? ""} ${r.answer ?? ""} ${r.errorText ?? ""} ${r.runId}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [runs, statusFilter, search]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (statusFilter === "completed" && g.latestStatus !== "completed") return false;
      if (statusFilter === "failed" && bucketStatus(g.latestStatus) !== "failed") return false;
      if (q && !g.question.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, statusFilter, search]);

  const categoryBuckets = useMemo((): CategoryBucket[] => {
    const q = search.trim().toLowerCase();
    const byCategory = new Map<number | null, RunGroupSummary[]>();
    for (const g of groups) {
      if (statusFilter === "completed" && g.latestStatus !== "completed") continue;
      if (statusFilter === "failed" && bucketStatus(g.latestStatus) !== "failed") continue;
      if (q && !g.question.toLowerCase().includes(q)) continue;
      const cat = questionCategory(g.question);
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(g);
    }
    const buckets: CategoryBucket[] = [];
    for (const { category } of UAT_CATEGORIES) {
      const gs = byCategory.get(category) ?? [];
      if (gs.length === 0) continue;
      buckets.push({ category, categoryName: UAT_CAT_NAME_MAP.get(category) ?? `Category ${category}`, groups: gs, totalRuns: gs.reduce((s, g) => s + g.runCount, 0), completedRuns: gs.reduce((s, g) => s + g.completedCount, 0), failedRuns: gs.reduce((s, g) => s + g.failedCount, 0) });
    }
    const otherGs = byCategory.get(null) ?? [];
    if (otherGs.length > 0) {
      buckets.push({ category: null, categoryName: "Other Questions", groups: otherGs, totalRuns: otherGs.reduce((s, g) => s + g.runCount, 0), completedRuns: otherGs.reduce((s, g) => s + g.completedCount, 0), failedRuns: otherGs.reduce((s, g) => s + g.failedCount, 0) });
    }
    return buckets;
  }, [groups, statusFilter, search]);

  /* UAT progress values */
  const uatDone = uatProgress?.completed ?? 0;
  const uatFailed = uatProgress?.failed ?? 0;
  const uatTotal = uatProgress?.total ?? 0;
  const uatPct = uatTotal > 0 ? Math.round(((uatDone + uatFailed) / uatTotal) * 100) : 0;

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">DB Agent — Run History</Title>
          <Text level="small" color="muted">
            Every DB Agent run. Click a card to see the full answer, SQL, and result.
          </Text>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button variant="outline" size="sm" onClick={refresh} disabled={runsLoading}>
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">Refresh</span>
          </Button>
          {questionCount !== null && questionCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)} disabled={testing}>
              <Icon type="FlaskConical" size="sm" />
              <span className="ml-1.5">{testing ? "Running…" : `Run Tests (${questionCount})`}</span>
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setUatOpen((v) => !v)}
            variant={uatOpen ? "default" : "outline"}
          >
            <Icon type="FlaskConical" size="sm" />
            <span className="ml-1.5">Run UAT ({UAT_TOTAL})</span>
            {uatRunning && <span className="ml-1.5 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAutoGrade}
            disabled={autoGrading}
            title="Auto-grade all UAT runs in view using the answer key"
          >
            <Icon type={autoGrading ? "Loader2" : "Star"} size="sm" />
            <span className="ml-1.5">
              {autoGrading && autoGradeProgress
                ? `Grading ${autoGradeProgress.done}/${autoGradeProgress.total}…`
                : "Auto-Grade"}
            </span>
          </Button>
        </div>
      </div>
      {/* Auto-grade result banner */}
      {!autoGrading && autoGradeProgress && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-muted/40 border border-border text-sm">
          <Icon type="Star" size="sm" className="text-primary shrink-0" />
          <span>Auto-graded {autoGradeProgress.total} UAT runs:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">{autoGradeProgress.correct} correct</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-red-600 dark:text-red-400 font-medium">{autoGradeProgress.incorrect} incorrect</span>
          <button onClick={() => setAutoGradeProgress(null)} className="ml-auto text-muted-foreground hover:text-foreground"><Icon type="X" size="sm" /></button>
        </div>
      )}

      {/* ── Alerts ────────────────────────────────────────────────────── */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {verdictError && (
        <Alert variant="destructive">
          <AlertTitle>Verdicts unavailable</AlertTitle>
          <AlertDescription>{verdictError}</AlertDescription>
        </Alert>
      )}
      {lastTestResult && !progress && (
        <Alert>
          <AlertTitle>Test batch finished</AlertTitle>
          <AlertDescription>
            {lastTestResult.completed} of {lastTestResult.total} completed
            {lastTestResult.failed > 0 ? ` · ${lastTestResult.failed} failed` : ""}{" "}
            in {formatDuration(lastTestResult.durationMs)}.
          </AlertDescription>
        </Alert>
      )}

      {/* ── Test progress ──────────────────────────────────────────────── */}
      {progress && <BatchProgressCard progress={progress} label="DB Agent" />}

      {/* ── Confirm dialog ────────────────────────────────────────────── */}
      {confirmOpen && questionCount != null && questionCount > 0 && (
        <ConfirmTestDialog
          count={questionCount}
          running={testing}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleRunTest}
        />
      )}

      {/* ── UAT panel ─────────────────────────────────────────────────── */}
      {uatOpen && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 bg-muted/40 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon type="FlaskConical" size="sm" className="text-primary" />
              <span className="text-sm font-semibold">UAT — {UAT_TOTAL} questions, 16 categories</span>
              {uatRunning && <Badge variant="secondary">{uatDone + uatFailed} / {uatTotal}</Badge>}
              {uatProgress?.done && (
                <Badge variant={uatFailed > 0 ? "destructive" : "success"}>
                  {uatFailed === 0 ? `All ${uatDone} passed` : `${uatDone} passed · ${uatFailed} failed`}
                </Badge>
              )}
            </div>
            <button onClick={() => setUatOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close UAT panel">
              <Icon type="X" size="sm" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            {/* Category filter chips */}
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Filter by category
                {uatCategories.size > 0 && (
                  <button className="ml-2 text-primary hover:underline normal-case text-xs tracking-normal" onClick={() => setUatCategories(new Set())}>clear</button>
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
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${active ? "border-primary bg-primary/10 text-foreground font-medium" : "border-border bg-background text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {category}. {categoryName} <span className="opacity-60">({count})</span>
                    </button>
                  );
                })}
              </div>
              {uatCategories.size > 0 && (
                <Text level="xSmall" color="muted" className="mt-1">
                  {UAT_QUESTIONS.filter((q) => uatCategories.has(q.category)).length} of {UAT_TOTAL} questions selected
                </Text>
              )}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm" onClick={handleRunUat} disabled={uatRunning}>
                <Icon type={uatRunning ? "Loader2" : "Play"} size="sm" />
                <span className="ml-1.5">
                  {uatRunning ? "Running…" : uatCategories.size > 0
                    ? `Run ${UAT_QUESTIONS.filter((q) => uatCategories.has(q.category)).length} questions`
                    : `Run all ${UAT_TOTAL}`}
                </span>
              </Button>
              {uatRunning && (
                <Button size="sm" variant="outline" onClick={handleCancelUat}>
                  <Icon type="Square" size="sm" /><span className="ml-1.5">Cancel</span>
                </Button>
              )}
              {uatProgress?.done && !uatRunning && (
                <Button size="sm" variant="outline" onClick={() => { setUatProgress(null); setUatError(null); }}>
                  <Icon type="Trash" size="sm" /><span className="ml-1.5">Clear results</span>
                </Button>
              )}
              <Text level="xSmall" color="muted">Published automation · concurrency 5</Text>
            </div>
            {uatError && <Alert variant="destructive"><AlertTitle>UAT error</AlertTitle><AlertDescription>{uatError}</AlertDescription></Alert>}
            {/* Progress bar */}
            {uatProgress && uatTotal > 0 && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${uatFailed > 0 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${uatPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{uatDone + uatFailed} / {uatTotal} · {uatDone} ✓{uatFailed > 0 && <span className="text-red-500 ml-1">· {uatFailed} ✗</span>}</span>
                  {uatProgress.done && <span className="font-medium">Done in {(uatProgress.durationMs / 1000).toFixed(1)}s</span>}
                </div>
              </div>
            )}
            {/* Results log */}
            {uatProgress && uatProgress.results.length > 0 && (
              <div ref={uatLogRef} className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/20 text-xs divide-y divide-border">
                {uatProgress.results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2 ${r.status === "completed" ? "" : "bg-red-50 dark:bg-red-950/20"}`}>
                    <span className={`mt-0.5 shrink-0 font-semibold ${r.status === "completed" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {r.status === "completed" ? "✓" : "✗"}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="line-clamp-1 text-foreground">{r.question}</div>
                      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                        <span className="font-mono">{r.categoryName}</span>
                        {r.recordCount != null && <span>{r.recordCount} record{r.recordCount === 1 ? "" : "s"}</span>}
                        <span>{(r.durationMs / 1000).toFixed(1)}s</span>
                        {r.runId && <Link href={`/ama-agent/runs/${r.runId}`} className="text-primary hover:underline">view</Link>}
                        {r.error && <span className="text-red-500 truncate max-w-xs" title={r.error}>{r.error}</span>}
                        {/* Auto-grade verdict */}
                        {r.verdict === "grading" && (
                          <span className="flex items-center gap-1 text-muted-foreground animate-pulse">
                            <Icon type="Loader2" size="sm" />grading…
                          </span>
                        )}
                        {r.verdict === "correct" && (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title={r.gradingReason}>
                            ✓ Correct
                          </span>
                        )}
                        {r.verdict === "incorrect" && (
                          <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold" title={r.gradingReason}>
                            ✗ Incorrect
                          </span>
                        )}
                        {r.verdict === "grade_error" && (
                          <span className="text-yellow-600 dark:text-yellow-400">grade failed</span>
                        )}
                      </div>
                      {r.gradingReason && (r.verdict === "incorrect") && (
                        <div className="text-red-500 dark:text-red-400 mt-0.5 line-clamp-2">{r.gradingReason}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View tabs ─────────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-border">
        {(["all", "by-question", "by-category"] as ViewMode[]).map((v) => {
          const meta: Record<ViewMode, { label: string; icon: "List" | "Layers3" | "Tag" }> = {
            all: { label: "All Runs", icon: "List" },
            "by-question": { label: "By Question", icon: "Layers3" },
            "by-category": { label: "By Category", icon: "Tag" },
          };
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${view === v ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <Icon type={meta[v].icon} size="sm" />
              {meta[v].label}
            </button>
          );
        })}
        {(view === "by-question" || view === "by-category") && (
          <Button size="sm" variant="ghost" onClick={handleBuildIndex} disabled={building} className="ml-auto mb-0.5" title="Re-scan Kognitos history and refresh the index">
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">{building ? "Building…" : "Rebuild index"}</span>
          </Button>
        )}
      </div>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "completed", "failed"] as StatusFilter[]).map((s) => (
          <FilterChip
            key={s}
            label={s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            tone={s === "completed" ? "success" : s === "failed" ? "destructive" : "default"}
          />
        ))}
        <div className="ml-auto relative">
          <Icon type="Search" size="sm" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={view === "all" ? "Search question or answer…" : "Search questions…"}
            className="h-9 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* ── All Runs ──────────────────────────────────────────────────── */}
      {view === "all" && (
        <>
          {runsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Icon type="History" size="xl" className="text-muted-foreground" />
              <Text color="muted">No runs found for the DB Agent yet.</Text>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Icon type="Search" size="lg" className="text-muted-foreground" />
              <Text color="muted">No runs match the current filters.</Text>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRuns.map((r) => (
                <RunCard key={r.runId} run={r} verdict={verdicts[r.runId]?.verdict ?? "correct"} onSetVerdict={(v) => saveVerdict(r, v)} />
              ))}
            </div>
          )}
          {nextPageToken && !runsLoading && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <><Icon type="RefreshCw" size="sm" /><span className="ml-1.5">Loading…</span></> : <><Icon type="ChevronDown" size="sm" /><span className="ml-1.5">Load more</span></>}
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── By Question ───────────────────────────────────────────────── */}
      {view === "by-question" && (
        <>
          {groupsNeedsBuild && !groupsLoading && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center space-y-3">
              <Icon type="Layers3" size="xl" className="mx-auto text-muted-foreground" />
              <div>
                <Title level="h4">No runs indexed yet</Title>
                <Text level="small" color="muted" className="mt-1">Click <strong>Build index</strong> to scan history and group runs by question.</Text>
              </div>
              <Button onClick={handleBuildIndex} disabled={building} size="sm">
                <Icon type="Download" size="sm" /><span className="ml-1.5">{building ? "Building…" : "Build index"}</span>
              </Button>
            </div>
          )}
          {groupsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : !groupsNeedsBuild && filteredGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Icon type="Search" size="lg" className="text-muted-foreground" />
              <Text color="muted">{search ? `No questions match "${search}".` : "No question groups indexed."}</Text>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredGroups.map((g) => <QuestionGroupCard key={g.questionId} group={g} />)}
            </div>
          )}
        </>
      )}

      {/* ── By Category ───────────────────────────────────────────────── */}
      {view === "by-category" && (
        <>
          {groupsNeedsBuild && !groupsLoading && (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center space-y-3">
              <Icon type="Tag" size="xl" className="mx-auto text-muted-foreground" />
              <div>
                <Title level="h4">No runs indexed yet</Title>
                <Text level="small" color="muted" className="mt-1">Click <strong>Build index</strong> first.</Text>
              </div>
              <Button onClick={handleBuildIndex} disabled={building} size="sm">
                <Icon type="Download" size="sm" /><span className="ml-1.5">{building ? "Building…" : "Build index"}</span>
              </Button>
            </div>
          )}
          {groupsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : !groupsNeedsBuild && categoryBuckets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Icon type="Search" size="lg" className="text-muted-foreground" />
              <Text color="muted">No categories match the current filters.</Text>
            </div>
          ) : (
            <div className="space-y-2">
              {categoryBuckets.map((b) => <CategoryRow key={b.category ?? -1} bucket={b} basePath="/ama-agent" />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── RunCard ─────────────────────────────────────────────────────────────── */
function RunCard({ run, verdict, onSetVerdict }: {
  run: RunSummary;
  verdict: Verdict;
  onSetVerdict: (v: Verdict) => void;
}): React.ReactElement {
  const isCompleted = run.status === "completed";
  const isError = run.status === "failed" || run.status === "awaiting_guidance";
  return (
    <Link
      href={`/ama-agent/runs/${run.runId}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-150 group"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <Icon type="Sparkles" size="sm" className="text-primary" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Text level="base" className="font-semibold line-clamp-2">{run.question ?? "(no question)"}</Text>
          {isCompleted && run.answer && (
            <Text level="small" color="muted" className="line-clamp-2">{run.answer}</Text>
          )}
          {isError && (
            <Text level="small" className="line-clamp-2 text-red-600 dark:text-red-400">{run.errorText ?? "Run did not complete"}</Text>
          )}
        </div>
        <Icon type="ChevronRight" size="sm" className="text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
      </div>
      <div className="mt-3 pl-12 flex flex-wrap items-center gap-1.5">
        {statusBadge(run.status)}
        <StageVersionBadge stage={run.stage} stageVersion={run.stageVersion} />
        {run.recordCount != null && <Badge variant="secondary">{run.recordCount} record{run.recordCount === 1 ? "" : "s"}</Badge>}
        {run.databasesQueried && <Badge variant="secondary">db: {run.databasesQueried}</Badge>}
        {run.createdAt && <Text level="xSmall" color="muted" className="ml-auto">{dayjs(run.createdAt).fromNow()}</Text>}
      </div>
      <div className="mt-2 pl-12 flex items-center gap-3" onClick={(e) => e.preventDefault()}>
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Verdict</span>
        <VerdictToggle value={verdict} onChange={onSetVerdict} />
        {run.createdAt && (
          <span className="text-xs text-muted-foreground tabular-nums ml-auto" title={dayjs(run.createdAt).format("YYYY-MM-DD HH:mm:ss")}>
            {dayjs(run.createdAt).format("MMM D, YYYY h:mm A")}
          </span>
        )}
      </div>
    </Link>
  );
}

/* ── QuestionGroupCard ───────────────────────────────────────────────────── */
function QuestionGroupCard({ group }: { group: RunGroupSummary }): React.ReactElement {
  const direction = trendDirection(group.verdictTrend);
  return (
    <Link
      href={`/ama-agent/run-groups/${group.questionId}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
          <Icon type="Layers3" size="sm" className="text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <Text level="base" className="font-semibold line-clamp-2">{group.question}</Text>
          {group.latestAnswerPreview && (
            <Text level="small" color="muted" className="mt-0.5 line-clamp-1">{group.latestAnswerPreview}</Text>
          )}
        </div>
        <Icon type="ChevronRight" size="sm" className="text-muted-foreground group-hover:text-primary shrink-0 mt-1" />
      </div>
      <div className="mt-3 pl-12 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{group.runCount} run{group.runCount === 1 ? "" : "s"}</Badge>
        {group.completedCount > 0 && <Badge variant="success">{group.completedCount} ✓</Badge>}
        {group.failedCount > 0 && <Badge variant="destructive">{group.failedCount} ✗</Badge>}
        <StageVersionBadge stage={group.latestStage} stageVersion={group.latestStageVersion} />
        {direction === "improved" && <Badge variant="success">Improved</Badge>}
        {direction === "regressed" && <Badge variant="destructive">Regressed</Badge>}
        <span className="ml-auto text-xs text-muted-foreground">last {dayjs(group.lastRunAt).fromNow()}</span>
      </div>
      <div className="mt-2 pl-12 flex items-center gap-3">
        <TrendSparkline values={group.recordCountTrend} />
        <VerdictTrendDots verdicts={group.verdictTrend} />
      </div>
    </Link>
  );
}

/* ── CategoryRow ─────────────────────────────────────────────────────────── */
function CategoryRow({ bucket, basePath }: { bucket: CategoryBucket; basePath: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const passRate = bucket.totalRuns > 0 ? Math.round((bucket.completedRuns / bucket.totalRuns) * 100) : 0;
  const isUat = bucket.category !== null;
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
          {isUat
            ? <span className="text-primary font-bold text-sm">{bucket.category}</span>
            : <Icon type="HelpCircle" size="sm" className="text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Text level="base" className="font-semibold">{bucket.categoryName}</Text>
            <Badge variant="secondary">{bucket.groups.length} question{bucket.groups.length === 1 ? "" : "s"}</Badge>
            <Badge variant="secondary">{bucket.totalRuns} run{bucket.totalRuns === 1 ? "" : "s"}</Badge>
            {bucket.failedRuns > 0 && <Badge variant="destructive">{bucket.failedRuns} failed</Badge>}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-48">
              <div
                className={`h-full rounded-full ${passRate === 100 ? "bg-emerald-500" : passRate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${passRate}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">{passRate}% pass</span>
          </div>
        </div>
        <Icon type={open ? "ChevronUp" : "ChevronDown"} size="sm" className="text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {bucket.groups.map((g) => (
            <Link
              key={g.questionId}
              href={`${basePath}/run-groups/${g.questionId}`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <Text level="small" className="line-clamp-1">{g.question}</Text>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary">{g.runCount}</Badge>
                {g.completedCount > 0 && <Badge variant="success">{g.completedCount} ✓</Badge>}
                {g.failedCount > 0 && <Badge variant="destructive">{g.failedCount} ✗</Badge>}
                <VerdictTrendDots verdicts={g.verdictTrend} />
              </div>
              <Icon type="ChevronRight" size="sm" className="text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ConfirmTestDialog ───────────────────────────────────────────────────── */
function ConfirmTestDialog({ count, running, onCancel, onConfirm }: {
  count: number; running: boolean; onCancel: () => void; onConfirm: () => void;
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Icon type="FlaskConical" size="sm" className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <Title level="h4">Run all stored test questions?</Title>
            <Text level="small" color="muted" className="mt-1">
              {count} question{count === 1 ? "" : "s"} will be sent to the <strong>published</strong> DB Agent (concurrency 25).
            </Text>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={running}>Cancel</Button>
          <Button size="sm" onClick={onConfirm} disabled={running}>
            <Icon type="FlaskConical" size="sm" /><span className="ml-1.5">{running ? "Starting…" : `Run ${count}`}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── BatchProgressCard ───────────────────────────────────────────────────── */
function BatchProgressCard({ progress, label }: { progress: BatchProgress; label: string }): React.ReactElement {
  const { total, completed, failed, recent, concurrency, stage, startedAt } = progress;
  const finished = completed + failed;
  const pct = total === 0 ? 0 : Math.round((finished / total) * 100);
  const stageLabel = stage === "AUTOMATION_STAGE_PUBLISHED" ? "published" : (stage?.replace(/^AUTOMATION_STAGE_/, "").toLowerCase() ?? "configured");
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Icon type="FlaskConical" size="sm" className="text-primary" />
          </div>
          <div>
            <Title level="h4">Running {label} test — {finished} / {total}</Title>
            <Text level="small" color="muted">{stageLabel} · concurrency {concurrency} · {formatDuration(Date.now() - startedAt)} elapsed</Text>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary">{completed} done</Badge>
          {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      {recent.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recently finished</div>
          {recent.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${r.status === "completed" ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className="truncate flex-1">{r.question}</span>
              {typeof r.recordCount === "number" && r.recordCount > 0 && <span className="text-xs text-muted-foreground shrink-0">{r.recordCount} rec</span>}
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">{formatDuration(r.durationMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── FilterChip ──────────────────────────────────────────────────────────── */
function FilterChip({ label, active, onClick, tone = "default" }: {
  label: string; active: boolean; onClick: () => void; tone?: "default" | "success" | "destructive";
}): React.ReactElement {
  const base = "px-3 py-1 rounded-full text-xs border transition-colors";
  const inactive = "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground";
  let activeClass = "border-primary bg-primary/10 text-foreground";
  if (active && tone === "success") activeClass = "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (active && tone === "destructive") activeClass = "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300";
  return <button onClick={onClick} className={`${base} ${active ? activeClass : inactive}`}>{label}</button>;
}
