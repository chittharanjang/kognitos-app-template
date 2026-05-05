"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
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
import { StageVersionBadge } from "@/app/components/stage-version-badge";

dayjs.extend(relativeTime);

const MAX_COMPARE = 4;

interface DetailRun {
  runId: string;
  createdAt: string;
  status: string;
  recordCount: number | null;
  databasesQueried: string | null;
  answerPreview: string | null;
  stage: string | null;
  stageVersion: string | null;
  verdict: "correct" | "incorrect" | null;
  notes: string | null;
}

interface DetailResponse {
  questionId: string;
  question: string | null;
  runs: DetailRun[];
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
    case "executing":
    case "pending":
      return <Badge variant="secondary">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function verdictBadge(v: DetailRun["verdict"]): React.ReactElement | null {
  if (v === "incorrect") return <Badge variant="destructive">incorrect</Badge>;
  if (v === "correct") return <Badge variant="success">correct</Badge>;
  return null;
}

export default function RunGroupDetailPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}): React.ReactElement {
  const router = useRouter();
  const { questionId } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reRunning, setReRunning] = useState<boolean>(false);
  const [reRunError, setReRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ama-agent/run-groups/${questionId}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DetailResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (runId: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
        return next;
      }
      if (next.size >= MAX_COMPARE) return prev;
      next.add(runId);
      return next;
    });
  };

  const selectedOrder = useMemo(() => {
    if (!data) return [] as string[];
    return data.runs.map((r) => r.runId).filter((rid) => selected.has(rid));
  }, [data, selected]);

  const handleCompare = (): void => {
    if (selectedOrder.length < 2) return;
    const qs = new URLSearchParams({ runs: selectedOrder.join(",") });
    router.push(
      `/ama-agent/run-groups/${questionId}/compare?${qs.toString()}`,
    );
  };

  const handleReRun = useCallback(async () => {
    if (!data?.question) return;
    setReRunning(true);
    setReRunError(null);
    try {
      const res = await fetch("/api/ama-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: data.question }),
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
  }, [data?.question, router]);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/ama-agent/run-groups"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon type="ChevronLeft" size="sm" />
          Run History Groups
        </Link>
      </div>

      <div>
        <Title level="h2">Question</Title>
        {loading ? (
          <Skeleton className="h-7 w-2/3 mt-1" />
        ) : (
          <Text level="base" className="font-semibold">
            {data?.question ?? "(question not found)"}
          </Text>
        )}
        {data && (
          <Text level="xSmall" color="muted" className="mt-1 font-mono">
            {questionId}
          </Text>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {reRunError && (
        <Alert variant="destructive">
          <AlertTitle>Failed to re-run</AlertTitle>
          <AlertDescription>{reRunError}</AlertDescription>
        </Alert>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Text level="small" color="muted">
              {data.runs.length} run{data.runs.length === 1 ? "" : "s"}
              {selected.size > 0 && (
                <>
                  {" · "}
                  <span className="text-foreground font-medium">
                    {selected.size} selected
                  </span>
                </>
              )}
            </Text>
            <div className="ml-auto flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleCompare}
                disabled={selectedOrder.length < 2}
                title={
                  selectedOrder.length < 2
                    ? "Select 2–4 runs to compare"
                    : `Compare ${selectedOrder.length} runs side-by-side`
                }
              >
                <Icon type="GalleryHorizontalEnd" size="sm" />
                <span className="ml-1.5">
                  Compare {selectedOrder.length > 0
                    ? `(${selectedOrder.length})`
                    : ""}
                </span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReRun}
                disabled={!data.question || reRunning}
              >
                <Icon type="Sparkles" size="sm" />
                <span className="ml-1.5">
                  {reRunning ? "Starting…" : "Re-run question"}
                </span>
              </Button>
            </div>
          </div>

          {data.runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Icon type="Archive" size="lg" className="text-muted-foreground" />
              <Text color="muted">No runs found for this question.</Text>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 w-[40px]"></th>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Records</th>
                    <th className="px-3 py-2 text-left">Databases</th>
                    <th
                      className="px-3 py-2 text-left"
                      title="Automation stage and version when this run executed"
                    >
                      Stage / Version
                    </th>
                    <th className="px-3 py-2 text-left">Verdict</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => {
                    const isSel = selected.has(r.runId);
                    return (
                      <tr
                        key={r.runId}
                        className={`border-t border-border ${
                          isSel ? "bg-primary/5" : "hover:bg-muted/30"
                        } transition-colors`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggle(r.runId)}
                            disabled={!isSel && selected.size >= MAX_COMPARE}
                            aria-label={`Select run ${r.runId} for comparison`}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                        </td>
                        <td
                          className="px-3 py-2 whitespace-nowrap"
                          title={dayjs(r.createdAt).format(
                            "YYYY-MM-DD HH:mm:ss",
                          )}
                        >
                          <div>{dayjs(r.createdAt).fromNow()}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {dayjs(r.createdAt).format("MMM D, h:mm A")}
                          </div>
                        </td>
                        <td className="px-3 py-2">{statusBadge(r.status)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.recordCount ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.databasesQueried || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <StageVersionBadge
                            stage={r.stage}
                            stageVersion={r.stageVersion}
                            emptyAsDash
                          />
                        </td>
                        <td className="px-3 py-2">
                          {verdictBadge(r.verdict) ?? (
                            <Text level="xSmall" color="muted">
                              —
                            </Text>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/ama-agent/runs/${r.runId}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Open
                            <Icon type="ChevronRight" size="sm" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      )}
    </div>
  );
}
