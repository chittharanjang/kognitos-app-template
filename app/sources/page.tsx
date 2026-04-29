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

interface LoadRun {
  id: string;
  source: string;
  table_name: string;
  source_table: string;
  run_id: string | null;
  status: "pending" | "running" | "completed" | "failed";
  row_count: number | null;
  generated_sql: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

interface SourceItem {
  key: string;
  source: string;
  sourceTable: string;
  currentRowCount: number | null;
  countError: string | null;
  latestRun: LoadRun | null;
}

interface StatusResponse {
  sources: SourceItem[];
  recentRuns: LoadRun[];
}

const SOURCE_PLATFORMS: Record<string, "Snowflake" | "Azure SQL"> = {
  FIDO: "Snowflake",
  WealthX: "Snowflake",
  "Profile Status": "Azure SQL",
};

function platformBadge(source: string) {
  const platform = SOURCE_PLATFORMS[source] ?? "—";
  return platform === "Snowflake" ? (
    <Badge variant="default">{platform}</Badge>
  ) : (
    <Badge variant="outline">{platform}</Badge>
  );
}

function statusBadge(status: LoadRun["status"] | null | undefined) {
  if (!status) return <Badge variant="secondary">Never loaded</Badge>;
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "running":
      return <Badge variant="secondary">Running…</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function SourcesPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/sources/load", { cache: "no-store" });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = (await res.json()) as StatusResponse;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll faster while any load is in flight (running/pending row visible OR a UI button is busy).
  useEffect(() => {
    const anyActive =
      busy.size > 0 ||
      (data?.sources ?? []).some(
        (s) => s.latestRun?.status === "running" || s.latestRun?.status === "pending"
      );

    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollTimerRef.current = setInterval(refresh, anyActive ? 2000 : 15000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [busy, data, refresh]);

  const totalRows = useMemo(() => {
    if (!data) return null;
    let sum = 0;
    let any = false;
    for (const s of data.sources) {
      if (s.currentRowCount != null) {
        sum += s.currentRowCount;
        any = true;
      }
    }
    return any ? sum : null;
  }, [data]);

  async function triggerLoad(table: string | "all") {
    setBusy((prev) => new Set(prev).add(table));
    setError(null);
    try {
      const res = await fetch("/api/sources/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table }),
      });
      if (!res.ok && res.status !== 207) {
        const txt = await res.text();
        throw new Error(`Load failed (${res.status}): ${txt.slice(0, 300)}`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(table);
        return next;
      });
      refresh();
    }
  }

  const loadingAll = busy.has("all");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">Source Data</Title>
          <Text level="small" color="muted">
            Mirror the live FIDO, WealthX, and Profile Status tables into Supabase via the SQL Query Generator automation.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loadingAll}
          >
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">Refresh status</span>
          </Button>
          <Button
            size="sm"
            onClick={() => triggerLoad("all")}
            disabled={loadingAll || busy.size > 0}
          >
            <Icon type="Download" size="sm" />
            <span className="ml-1.5">
              {loadingAll ? "Loading all…" : "Load all tables"}
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

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryStat label="Source tables" value={data ? `${data.sources.length}` : "—"} />
        <SummaryStat
          label="Rows in Supabase"
          value={totalRows != null ? totalRows.toLocaleString() : "—"}
        />
        <SummaryStat
          label="Last load"
          value={
            data
              ? lastLoadLabel(data.sources)
              : "—"
          }
        />
        <SummaryStat
          label="Active loads"
          value={
            data
              ? `${activeLoadsCount(data.sources, busy)}`
              : "—"
          }
        />
      </div>

      {/* Per-table cards */}
      <div className="space-y-3">
        {!data ? (
          <>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </>
        ) : (
          data.sources.map((s) => (
            <SourceCard
              key={s.key}
              item={s}
              busy={busy.has(s.key) || loadingAll}
              onLoad={() => triggerLoad(s.key)}
            />
          ))
        )}
      </div>

      {/* Recent runs */}
      {data && data.recentRuns.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Icon type="History" size="sm" className="text-muted-foreground" />
            <Text level="base" className="font-semibold">
              Recent loads
            </Text>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-2 pr-4">Source table</th>
                  <th className="text-left font-medium py-2 pr-4">Status</th>
                  <th className="text-left font-medium py-2 pr-4">Rows</th>
                  <th className="text-left font-medium py-2 pr-4">Started</th>
                  <th className="text-left font-medium py-2 pr-4">Duration</th>
                  <th className="text-left font-medium py-2 pr-4">Run</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-4 font-mono">{r.source_table}</td>
                    <td className="py-2 pr-4">{statusBadge(r.status)}</td>
                    <td className="py-2 pr-4">{r.row_count ?? "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {dayjs(r.started_at).fromNow()}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {durationLabel(r.started_at, r.completed_at)}
                    </td>
                    <td className="py-2 pr-4 font-mono text-muted-foreground truncate max-w-[160px]">
                      {r.run_id ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceCard({
  item,
  busy,
  onLoad,
}: {
  item: SourceItem;
  busy: boolean;
  onLoad: () => void;
}) {
  const latest = item.latestRun;
  const isActive = latest?.status === "running" || latest?.status === "pending";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Icon type="Database" size="md" className="text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Text level="base" className="font-semibold">
                {item.sourceTable}
              </Text>
              {platformBadge(item.source)}
            </div>
            <Text level="xSmall" color="muted" className="mt-0.5 font-mono">
              → supabase.{item.key}
            </Text>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {statusBadge(latest?.status)}
          {item.currentRowCount != null && (
            <Text level="xSmall" color="muted">
              {item.currentRowCount.toLocaleString()} row
              {item.currentRowCount === 1 ? "" : "s"} in Supabase
            </Text>
          )}
          {latest?.completed_at && (
            <Text level="xSmall" color="muted">
              Last loaded {dayjs(latest.completed_at).fromNow()}
            </Text>
          )}
        </div>
      </div>

      {latest?.status === "failed" && latest.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <Text level="xSmall" className="font-medium text-destructive">
            Last load failed
          </Text>
          <Text level="xSmall" color="muted" className="mt-1 font-mono break-words">
            {latest.error}
          </Text>
        </div>
      )}

      {latest?.generated_sql && latest.status === "completed" && (
        <details className="rounded-md border border-border bg-muted/30 p-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Generated SQL from last load
          </summary>
          <pre className="mt-2 overflow-x-auto text-[11px] font-mono whitespace-pre-wrap">
            {latest.generated_sql}
          </pre>
        </details>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onLoad}
          disabled={busy || isActive}
        >
          <Icon type="Download" size="sm" />
          <span className="ml-1.5">
            {busy || isActive ? "Loading…" : "Load now"}
          </span>
        </Button>
        {item.countError && (
          <Text level="xSmall" color="muted">
            (Could not read row count: {item.countError})
          </Text>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text level="xSmall" color="muted" className="uppercase tracking-wide">
        {label}
      </Text>
      <Text level="large" className="font-semibold mt-1">
        {value}
      </Text>
    </div>
  );
}

function lastLoadLabel(sources: SourceItem[]): string {
  let latest: string | null = null;
  for (const s of sources) {
    const t = s.latestRun?.completed_at ?? s.latestRun?.started_at;
    if (t && (!latest || t > latest)) latest = t;
  }
  return latest ? dayjs(latest).fromNow() : "Never";
}

function activeLoadsCount(
  sources: SourceItem[],
  busy: Set<string>
): number {
  let n = 0;
  for (const s of sources) {
    if (
      s.latestRun?.status === "running" ||
      s.latestRun?.status === "pending" ||
      busy.has(s.key)
    ) {
      n++;
    }
  }
  if (busy.has("all") && n === 0) n = sources.length;
  return n;
}

function durationLabel(started: string, completed: string | null): string {
  if (!started) return "—";
  const start = new Date(started).getTime();
  const end = completed ? new Date(completed).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
