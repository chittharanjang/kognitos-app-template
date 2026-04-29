"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  Title,
  Text,
  Button,
  Icon,
  Badge,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@kognitos/lattice";

interface AmaResult {
  status: string;
  runId: string;
  responseText: string | null;
  queryType: string | null;
  recordCount: number | null;
  databasesQueried: string[] | string | null;
  generatedSql: string | null;
  subQuestions: string[] | null;
  csvData: string | null;
  tableData: Record<string, unknown>[] | null;
}

interface ChatEntry {
  id: string;
  query: string;
  runId: string | null;
  result: AmaResult | null;
  error: string | null;
  loading: boolean;
  elapsed: number;
}

const SUGGESTIONS = [
  "How many clients have an open account?",
  "Share the list of unregistered clients",
  "What is the market value of F1006?",
  "Does John Smith have portal access?",
];

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 180_000;

export default function AmaAgentPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<Set<string>>(new Set());

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const updateEntry = useCallback((entryId: string, updates: Partial<ChatEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e)));
  }, []);

  const pollForResult = useCallback(
    async (entryId: string, runId: string, startTime: number) => {
      if (pollingRef.current.has(entryId)) return;
      pollingRef.current.add(entryId);

      try {
        while (true) {
          const elapsed = Date.now() - startTime;

          if (elapsed > POLL_TIMEOUT) {
            updateEntry(entryId, {
              loading: false,
              error: "DB Agent timed out after 3 minutes",
              elapsed,
            });
            break;
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL));

          let res: Response;
          try {
            res = await fetch(`/api/ama-agent/${runId}`);
          } catch {
            continue;
          }

          const data = await res.json();
          updateEntry(entryId, { elapsed: Date.now() - startTime });

          if (data.status === "completed") {
            updateEntry(entryId, {
              loading: false,
              result: data,
              elapsed: Date.now() - startTime,
            });
            scrollToBottom();
            break;
          }

          if (data.status === "failed" || data.status === "awaiting_guidance") {
            updateEntry(entryId, {
              loading: false,
              error: data.error ?? `Run ${data.status}`,
              elapsed: Date.now() - startTime,
            });
            break;
          }
        }
      } finally {
        pollingRef.current.delete(entryId);
      }
    },
    [updateEntry, scrollToBottom],
  );

  const handleSubmit = useCallback(
    async (text?: string) => {
      const query = (text ?? input).trim();
      if (!query) return;
      setInput("");

      const entryId = crypto.randomUUID();
      const startTime = Date.now();
      const newEntry: ChatEntry = {
        id: entryId,
        query,
        runId: null,
        result: null,
        error: null,
        loading: true,
        elapsed: 0,
      };

      setEntries((prev) => [...prev, newEntry]);
      scrollToBottom();
      inputRef.current?.focus();

      try {
        const res = await fetch("/api/ama-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        const data = await res.json();

        if (!res.ok) {
          updateEntry(entryId, {
            loading: false,
            error: data.error ?? "Failed to start DB Agent run",
          });
          return;
        }

        updateEntry(entryId, { runId: data.runId });
        pollForResult(entryId, data.runId, startTime);
      } catch (err) {
        updateEntry(entryId, {
          loading: false,
          error: err instanceof Error ? err.message : "Network error",
        });
      }
    },
    [input, updateEntry, pollForResult, scrollToBottom],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearHistory = useCallback(() => setEntries([]), []);

  const activeCount = entries.filter((e) => e.loading).length;
  const showEmpty = entries.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)]">
      <div className="px-5 py-3 shadow-sm shrink-0 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <Title level="h3">DB Agent</Title>
              <Badge variant="secondary">draft</Badge>
              {activeCount > 0 && (
                <Badge variant="secondary">{activeCount} running</Badge>
              )}
            </div>
            <Text level="xSmall" color="muted">
              Ask anything about FIDO, WealthX, or Azure SQL — multi-DB intelligent query agent
            </Text>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {entries.length > 0 && (
              <Button variant="ghost" size="icon" onClick={clearHistory} title="Clear">
                <Icon type="Trash" size="sm" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 max-h-[calc(75vh-4rem)] overflow-y-auto px-5 py-4 space-y-4">
        {showEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Icon type="Sparkles" size="lg" className="text-primary" />
              </div>
              <Title level="h3">Ask DB Agent</Title>
              <Text color="muted" className="mt-1.5">
                Natural language across FIDO clients, WealthX accounts, and Azure profile status.
              </Text>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-background shadow-sm hover:shadow-md hover:border-primary/30 hover:bg-muted/40 transition-all duration-150"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <div key={entry.id} className="space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-primary text-primary-foreground shadow-sm">
                    <Text level="small" className="text-primary-foreground">
                      {entry.query}
                    </Text>
                  </div>
                </div>

                {entry.loading && <LoadingIndicator entry={entry} />}

                {entry.error && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%]">
                      <Alert variant="destructive">
                        <AlertTitle>DB Agent failed</AlertTitle>
                        <AlertDescription>{entry.error}</AlertDescription>
                      </Alert>
                    </div>
                  </div>
                )}

                {entry.result && <ResultCard result={entry.result} elapsed={entry.elapsed} />}
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm px-5 pt-3 pb-4 space-y-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask DB Agent a question..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          />
          <Button
            size="icon"
            onClick={() => handleSubmit()}
            disabled={!input.trim()}
            className="rounded-xl h-10 w-10"
          >
            <Icon type="SendHorizontal" size="sm" />
          </Button>
        </div>

        {!showEmpty && (
          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSubmit(s)}
                className="shrink-0 text-xs px-3.5 py-1.5 rounded-full border border-border bg-background shadow-sm hover:shadow-md hover:border-primary/30 hover:bg-muted/40 transition-all duration-150 text-muted-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingIndicator({ entry }: { entry: ChatEntry }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.floor(elapsed / 1000);
  const phase =
    !entry.runId
      ? "Starting DB Agent..."
      : seconds < 10
        ? "Planning query..."
        : seconds < 30
          ? "Querying databases..."
          : seconds < 90
            ? "Composing response..."
            : "Almost done...";

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted/60 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <Text level="xSmall" color="muted">
            {phase}
          </Text>
          <Text level="xSmall" color="muted" className="ml-auto font-mono tabular-nums">
            {seconds}s
          </Text>
        </div>
      </div>
    </div>
  );
}

function isMarkdownTable(text: string | null | undefined): boolean {
  if (!text) return false;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("---") && line.includes("|") && /-{3,}/.test(line)) {
      return true;
    }
  }
  return false;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultCard({ result, elapsed }: { result: AmaResult; elapsed: number }) {
  const [showSql, setShowSql] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [showSubQ, setShowSubQ] = useState(false);

  const dbs = Array.isArray(result.databasesQueried)
    ? result.databasesQueried.join(", ")
    : (result.databasesQueried ?? null);

  const hasCsv = typeof result.csvData === "string" && result.csvData.trim().length > 0;
  const responseIsTable = isMarkdownTable(result.responseText);
  const showResponseText = !(responseIsTable && hasCsv);

  const handleDownloadCsv = () => {
    if (!hasCsv || !result.csvData) return;
    const filename = `db-agent-${result.runId}.csv`;
    downloadCsv(result.csvData, filename);
  };

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full space-y-3">
        {showResponseText && (
          <div className="rounded-2xl px-4 py-3 bg-muted/50 shadow-sm">
            <Text level="small">
              {result.responseText ?? "No response text returned."}
            </Text>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 px-1 items-center">
          {result.queryType && (
            <Badge variant="secondary">type: {String(result.queryType)}</Badge>
          )}
          {result.recordCount != null && (
            <Badge variant="secondary">
              {String(result.recordCount)} record{String(result.recordCount) !== "1" ? "s" : ""}
            </Badge>
          )}
          {dbs && <Badge variant="secondary">db: {dbs}</Badge>}
          {Array.isArray(result.subQuestions) && result.subQuestions.length > 1 && (
            <Badge variant="secondary">
              {result.subQuestions.length} sub-question{result.subQuestions.length !== 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="success">Completed</Badge>
          {elapsed > 0 && (
            <Badge variant="secondary">{Math.round(elapsed / 1000)}s</Badge>
          )}
          {hasCsv && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownloadCsv}
              className="ml-1 h-6 px-2.5 text-xs gap-1.5"
            >
              <Icon type="Download" size="sm" />
              csv
            </Button>
          )}
        </div>

        {Array.isArray(result.subQuestions) && result.subQuestions.length > 1 && (
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <button
              onClick={() => setShowSubQ(!showSubQ)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <Text level="xSmall" className="font-medium">
                Sub-questions ({result.subQuestions.length})
              </Text>
              <Icon type={showSubQ ? "ChevronUp" : "ChevronDown"} size="sm" className="text-muted-foreground" />
            </button>
            {showSubQ && (
              <ul className="px-4 py-3 border-t border-border bg-muted/20 space-y-1 list-disc list-inside">
                {result.subQuestions.map((q, i) => (
                  <li key={i}>
                    <Text level="xSmall" color="muted" className="inline">
                      {String(q)}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result.generatedSql && (
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <button
              onClick={() => setShowSql(!showSql)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <Text level="xSmall" className="font-medium">
                Generated SQL
              </Text>
              <Icon type={showSql ? "ChevronUp" : "ChevronDown"} size="sm" className="text-muted-foreground" />
            </button>
            {showSql && (
              <div className="px-4 py-3 border-t border-border bg-muted/20">
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {result.generatedSql}
                </pre>
              </div>
            )}
          </div>
        )}

        {result.tableData && result.tableData.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <button
              onClick={() => setShowTable(!showTable)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <Text level="xSmall" className="font-medium">
                Result Table ({result.tableData.length} row{result.tableData.length !== 1 ? "s" : ""})
              </Text>
              <Icon type={showTable ? "ChevronUp" : "ChevronDown"} size="sm" className="text-muted-foreground" />
            </button>
            {showTable && (
              <div className="border-t border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {Object.keys(result.tableData[0]).map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.tableData.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        {Object.values(row).map((val, j) => (
                          <td key={j} className="px-3 py-2 whitespace-nowrap">
                            {val == null ? (
                              <span className="text-muted-foreground italic">null</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
