"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

interface CompareRun {
  status: string;
  runId: string;
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
  indexedQuestion?: string | null;
  indexedCreatedAt?: string | null;
  questionId?: string | null;
  stage?: string | null;
  stageVersion?: string | null;
  verdict?: "correct" | "incorrect" | null;
  notes?: string | null;
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

function dbsToString(d: CompareRun["databasesQueried"]): string {
  if (!d) return "—";
  return Array.isArray(d) ? d.join(", ") : d;
}

/**
 * Returns a per-line diff classification. Lines present in `mine` but absent
 * in `theirs` are tagged 'added'. Lines present in `theirs` but absent in
 * `mine` are not surfaced (they appear as 'added' in the other column). All
 * other lines are 'same'.
 *
 * Set-difference is preferred to a positional diff for table-shaped answers
 * (rows can re-order without being a meaningful change).
 */
function classifyLines(
  mine: string,
  others: string[],
): { line: string; cls: "same" | "added" }[] {
  const otherSet = new Set<string>();
  for (const t of others) {
    for (const l of t.split("\n")) otherSet.add(l);
  }
  return mine.split("\n").map((line) => ({
    line,
    cls: otherSet.has(line) ? "same" : "added",
  }));
}

export default function ComparePage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}): React.ReactElement {
  const { questionId } = use(params);
  const searchParams = useSearchParams();
  const runIds = useMemo(() => {
    const raw = searchParams.get("runs") ?? "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [searchParams]);

  const [runs, setRuns] = useState<CompareRun[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (runIds.length === 0) {
      setLoading(false);
      setError("No run IDs supplied. Pick 2 or more from the question page.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/ama-agent/run-groups/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runIds }),
    })
      .then(async (res) => {
        const json = (await res.json()) as { runs?: CompareRun[]; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.runs) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        setRuns(json.runs);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load runs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runIds]);

  const sharedQuestion = runs?.[0]?.indexedQuestion ?? null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/ama-agent/run-groups/${questionId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon type="ChevronLeft" size="sm" />
          Back to question
        </Link>
      </div>

      <div>
        <Title level="h2">Compare runs</Title>
        {sharedQuestion && (
          <Text level="small" className="font-semibold mt-1">
            {sharedQuestion}
          </Text>
        )}
        <Text level="xSmall" color="muted" className="mt-1">
          Differences are highlighted per column. Lines unique to each run are
          tinted; lines present in every column are plain.
        </Text>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load comparison</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${Math.max(runIds.length, 1)}, minmax(280px, 1fr))`,
          }}
        >
          {runIds.map((rid) => (
            <Skeleton key={rid} className="h-96 w-full rounded-xl" />
          ))}
        </div>
      ) : runs ? (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${runs.length}, minmax(360px, 1fr))`,
          }}
        >
          {runs.map((r, i) => {
            const others = runs.filter((_, j) => j !== i);
            return <CompareColumn key={r.runId} run={r} others={others} />;
          })}
        </div>
      ) : null}
    </div>
  );
}

function CompareColumn({
  run,
  others,
}: {
  run: CompareRun;
  others: CompareRun[];
}): React.ReactElement {
  const myAnswer = run.responseText ?? "";
  const otherAnswers = others.map((o) => o.responseText ?? "");
  const mySql = run.generatedSql ?? "";
  const otherSqls = others.map((o) => o.generatedSql ?? "");
  const tableShape = describeTable(run.tableData);
  const otherShapes = others.map((o) => describeTable(o.tableData));
  const tableShapeDiffers = otherShapes.some(
    (s) => s.rowCount !== tableShape.rowCount || s.keys !== tableShape.keys,
  );
  // Highlight the version pill if any column was produced by a different
  // automation version — it's almost always the cause of a diff.
  const versionDiffers = others.some(
    (o) => (o.stageVersion ?? null) !== (run.stageVersion ?? null),
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col min-h-0">
      <div className="p-4 border-b border-border space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {statusBadge(run.status)}
          <StageVersionBadge
            stage={run.stage}
            stageVersion={run.stageVersion}
            variant={versionDiffers ? "destructive" : "outline"}
          />
          {run.verdict === "correct" && (
            <Badge variant="success">verdict: correct</Badge>
          )}
          {run.verdict === "incorrect" && (
            <Badge variant="destructive">verdict: incorrect</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {run.indexedCreatedAt
            ? dayjs(run.indexedCreatedAt).format("MMM D, YYYY h:mm A")
            : "(no timestamp)"}
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-muted-foreground">records</span>
          <span className="font-semibold tabular-nums">
            {run.recordCount ?? "—"}
          </span>
          <span className="text-muted-foreground ml-2">DBs</span>
          <span className="font-medium">{dbsToString(run.databasesQueried)}</span>
        </div>
        <div>
          <Link
            href={`/ama-agent/runs/${run.runId}`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Open run detail
            <Icon type="ChevronRight" size="sm" />
          </Link>
        </div>
      </div>

      <DiffBlock title="Answer" mine={myAnswer} others={otherAnswers} />
      <DiffBlock title="Generated SQL" mine={mySql} others={otherSqls} mono />
      <div className="p-4 border-t border-border space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Table shape
          {tableShapeDiffers && (
            <Badge variant="destructive" className="ml-2">
              differs
            </Badge>
          )}
        </div>
        <div className="text-xs space-y-0.5">
          <div>
            <span className="text-muted-foreground">rows:</span>{" "}
            <span className="font-mono">{tableShape.rowCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">columns:</span>{" "}
            <span className="font-mono break-all">{tableShape.keys || "—"}</span>
          </div>
          {tableShape.sample && (
            <details className="mt-2">
              <summary className="text-muted-foreground cursor-pointer">
                first row
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
                {tableShape.sample}
              </pre>
            </details>
          )}
        </div>
      </div>
      {run.error && (
        <div className="p-4 border-t border-border">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Error
          </div>
          <div className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
            {run.error}
          </div>
        </div>
      )}
    </div>
  );
}

function DiffBlock({
  title,
  mine,
  others,
  mono = false,
}: {
  title: string;
  mine: string;
  others: string[];
  mono?: boolean;
}): React.ReactElement {
  const lines = classifyLines(mine, others);
  const hasContent = mine.trim().length > 0;

  return (
    <div className="p-4 border-t border-border space-y-2 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {!hasContent ? (
        <div className="text-xs text-muted-foreground italic">(empty)</div>
      ) : (
        <pre
          className={`max-h-72 overflow-auto rounded bg-muted/40 p-2 text-[12px] leading-relaxed ${
            mono ? "font-mono" : ""
          } whitespace-pre-wrap break-words`}
        >
          {lines.map((l, i) => (
            <span
              key={i}
              className={
                l.cls === "added"
                  ? "block bg-amber-100 dark:bg-amber-500/20 -mx-2 px-2"
                  : "block"
              }
            >
              {l.line || "\u00a0"}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

function describeTable(rows: Record<string, unknown>[] | null | undefined): {
  rowCount: number;
  keys: string;
  sample: string | null;
} {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return { rowCount: 0, keys: "", sample: null };
  }
  const keys = Object.keys(rows[0]).sort().join(", ");
  let sample: string | null = null;
  try {
    sample = JSON.stringify(rows[0], null, 2);
  } catch {
    sample = null;
  }
  return { rowCount: rows.length, keys, sample };
}
