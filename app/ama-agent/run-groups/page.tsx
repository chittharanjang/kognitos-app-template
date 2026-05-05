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

dayjs.extend(relativeTime);

interface RunGroupSummary {
  questionId: string;
  question: string;
  runCount: number;
  completedCount: number;
  failedCount: number;
  otherCount: number;
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

type SortMode = "recent" | "runs" | "failures";

const SORT_LABEL: Record<SortMode, string> = {
  recent: "Most recent",
  runs: "Most runs",
  failures: "Most failures",
};

export default function RunGroupsPage(): React.ReactElement {
  const router = useRouter();
  const [groups, setGroups] = useState<RunGroupSummary[]>([]);
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

  // Debounce typing → 250ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (q: string, s: SortMode) => {
      setLoading(true);
      setError(null);
      setNeedsBuild(false);
      try {
        const params = new URLSearchParams();
        if (q) params.set("search", q);
        params.set("sort", s);
        const res = await fetch(
          `/api/ama-agent/run-groups?${params.toString()}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          groups?: RunGroupSummary[];
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
        if (list.length === 0 && !q) {
          setNeedsBuild(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load groups");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(debouncedSearch, sort);
  }, [debouncedSearch, sort, load]);

  // Close the typeahead dropdown when clicking outside.
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
      const res = await fetch("/api/ama-agent/run-groups/backfill", {
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

  // Top suggestions for the typeahead — derived from the currently-loaded
  // groups (already debounced + filtered server-side), so picking one
  // navigates straight to the detail page without another network round-trip.
  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return groups.slice(0, 8);
  }, [groups, search]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">DB Agent — Run History Groups</Title>
          <Text level="small" color="muted">
            One card per question. Drill in to see every run of that question
            and compare any two side-by-side.
          </Text>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/ama-agent/runs">
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
        </div>
      </div>

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
              Click <strong>Build index</strong> to scan the DB Agent's history
              from Kognitos and group every run by its question.
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
                router.push(
                  `/ama-agent/run-groups/${suggestions[0].questionId}`,
                );
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
                    router.push(`/ama-agent/run-groups/${g.questionId}`);
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

function GroupCard({ group }: { group: RunGroupSummary }): React.ReactElement {
  const direction = trendDirection(group.verdictTrend);
  const directionBadge =
    direction === "improved" ? (
      <Badge variant="success">Improved</Badge>
    ) : direction === "regressed" ? (
      <Badge variant="destructive">Regressed</Badge>
    ) : null;

  return (
    <Link
      href={`/ama-agent/run-groups/${group.questionId}`}
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
        {group.databasesUsed.length > 0 && (
          <Badge variant="secondary">db: {group.databasesUsed.join(", ")}</Badge>
        )}
        {directionBadge}
        <span className="ml-auto text-xs text-muted-foreground">
          last run {dayjs(group.lastRunAt).fromNow()}
        </span>
      </div>

      <div className="mt-3 pl-12 grid grid-cols-[1fr_auto] gap-4 items-center">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
            Records
          </span>
          <TrendSparkline values={group.recordCountTrend} />
          <span className="text-xs text-muted-foreground tabular-nums">
            {group.recordCountTrend
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
