"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

interface ColumnDef {
  name: string;
  label: string;
  type: "string" | "number";
}

interface DataResponse {
  table: string;
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  sort: string;
  order: "asc" | "desc";
  search: string;
  latestLoad: {
    started_at: string;
    completed_at: string | null;
    status: string;
    row_count: number | null;
  } | null;
}

interface TabDef {
  key: string;          // URL-friendly slug, also the tab label state
  label: string;        // shown to user
  table: string;        // matches API ?table=
  source: string;       // FIDO / WealthX / Profile Status
}

const TABS: TabDef[] = [
  { key: "clients",        label: "Clients",        table: "fido_clients",            source: "FIDO" },
  { key: "addresses",      label: "Addresses",      table: "fido_client_address",     source: "FIDO" },
  { key: "accounts",       label: "Accounts",       table: "wealthx_account_details", source: "WealthX" },
  { key: "profile_status", label: "Profile Status", table: "azure_profile_status",    source: "Profile Status" },
];

const SOURCE_PLATFORMS: Record<string, "Snowflake" | "Azure SQL"> = {
  FIDO: "Snowflake",
  WealthX: "Snowflake",
  "Profile Status": "Azure SQL",
};

const PAGE_SIZES = [25, 50, 100, 200];

export default function DataPage() {
  const [activeKey, setActiveKey] = useState<string>(TABS[0].key);
  const activeTab = useMemo(
    () => TABS.find((t) => t.key === activeKey) ?? TABS[0],
    [activeKey]
  );

  // Sync the active tab with the URL hash so the page is linkable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && TABS.some((t) => t.key === hash)) {
      setActiveKey(hash);
    }
  }, []);

  const handleTabChange = useCallback((key: string) => {
    setActiveKey(key);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${key}`);
    }
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">Data</Title>
          <Text level="small" color="muted">
            Browse the source-of-truth tables mirrored into Supabase.
          </Text>
        </div>
        <Link href="/sources">
          <Button variant="outline" size="sm">
            <Icon type="RefreshCw" size="sm" />
            <span className="ml-1.5">Manage data loads</span>
          </Button>
        </Link>
      </div>

      {/* Tab strip */}
      <div className="border-b border-border">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => {
            const active = t.key === activeKey;
            return (
              <button
                key={t.key}
                onClick={() => handleTabChange(t.key)}
                className={
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
                  (active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <DataTable tab={activeTab} />
    </div>
  );
}

function DataTable({ tab }: { tab: TabDef }) {
  const [data, setData] = useState<DataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<string | null>(null);
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);

  // Reset pagination + search when switching tabs.
  const lastTab = useRef(tab.table);
  useEffect(() => {
    if (lastTab.current !== tab.table) {
      lastTab.current = tab.table;
      setSearch("");
      setDebouncedSearch("");
      setSort(null);
      setOrder("asc");
      setOffset(0);
    }
  }, [tab.table]);

  // Debounce free-text search to avoid hammering the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Refetch whenever any query parameter changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("table", tab.table);
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sort) {
      params.set("sort", sort);
      params.set("order", order);
    }

    fetch(`/api/sources/data?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API ${res.status}: ${text.slice(0, 300)}`);
        }
        return res.json() as Promise<DataResponse>;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab.table, pageSize, offset, debouncedSearch, sort, order]);

  function toggleSort(col: string) {
    if (sort === col) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setOrder("asc");
    }
    setOffset(0);
  }

  const total = data?.total ?? 0;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  const platform = SOURCE_PLATFORMS[tab.source] ?? "—";
  const lastLoadAt = data?.latestLoad?.completed_at ?? data?.latestLoad?.started_at ?? null;

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <Text level="base" className="font-semibold font-mono">
              {tab.table}
            </Text>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Text level="xSmall" color="muted">
                {tab.source}
              </Text>
              <Badge variant={platform === "Snowflake" ? "default" : "outline"}>
                {platform}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Icon
              type="Search"
              size="sm"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search…"
              className="h-9 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setOffset(0);
            }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {data
            ? total === 0
              ? "0 rows"
              : `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} rows`
            : "—"}
        </span>
        <span>
          {lastLoadAt
            ? `Loaded ${dayjs(lastLoadAt).fromNow()}`
            : "Never loaded"}
        </span>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Data table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {!data && loading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
          </div>
        ) : data && data.rows.length === 0 ? (
          <EmptyState search={debouncedSearch} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="border-b border-border">
                  {data?.columns.map((c) => {
                    const isSorted = sort === c.name;
                    return (
                      <th
                        key={c.name}
                        className="text-left font-medium py-2.5 px-3 whitespace-nowrap"
                      >
                        <button
                          onClick={() => toggleSort(c.name)}
                          className="flex items-center gap-1 hover:text-foreground"
                        >
                          {c.label}
                          {isSorted && (
                            <Icon
                              type={order === "asc" ? "ChevronUp" : "ChevronDown"}
                              size="sm"
                              className="text-muted-foreground"
                            />
                          )}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    {data.columns.map((c) => (
                      <td
                        key={c.name}
                        className="py-2 px-3 align-top whitespace-nowrap font-mono text-xs"
                      >
                        {formatCell(row[c.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination footer */}
      {data && total > pageSize && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPrev || loading}
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
          >
            <Icon type="ChevronLeft" size="sm" />
            <span className="ml-1">Previous</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canNext || loading}
            onClick={() => setOffset(offset + pageSize)}
          >
            <span className="mr-1">Next</span>
            <Icon type="ChevronRight" size="sm" />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState({ search }: { search: string }) {
  if (search) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Icon type="Search" size="lg" className="text-muted-foreground" />
        <Text color="muted">No rows match “{search}”.</Text>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Icon type="Database" size="lg" className="text-muted-foreground" />
      <Text color="muted">This table is empty.</Text>
      <Link href="/sources">
        <Button variant="outline" size="sm">
          <Icon type="Download" size="sm" />
          <span className="ml-1.5">Load source data</span>
        </Button>
      </Link>
    </div>
  );
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return val.length === 0 ? "—" : val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}
