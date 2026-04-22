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

interface QueryResult {
  status: string;
  runId: string;
  responseText: string | null;
  generatedSql: string | null;
  questionCount: number | null;
  subQuestions: string[] | null;
  subQueryCount: number | null;
  resultRowCount: number | null;
  appliedWhereClauses: string[] | null;
  tableData: Record<string, unknown>[] | null;
}

interface ChatEntry {
  id: string;
  query: string;
  runId: string | null;
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
  elapsed: number;
}

const SUGGESTIONS = [
  "How many clients have an open account?",
  "List all clients with profile status locked",
  "What is the total number of accounts?",
  "Give me clients who have more than 2 accounts",
];

const HELP_SECTIONS = [
  {
    title: "How it works",
    content:
      "Type a natural language question about your client and account data. The system invokes the SQL Query Generator automation, which parses your question, builds SQL queries, runs them against the FIDO, WealthX, and MSSQL databases, and returns a structured response.",
  },
  {
    title: "Supported question types",
    items: [
      "Yes/No — \"Does client John have an open account?\"",
      "Counts — \"How many clients have an open account?\"",
      "Lookups — \"What is Priya's email?\"",
      "Lists — \"List all clients with profile status locked\"",
      "Aggregations — \"What is the average account value?\"",
      "Grouped — \"Give me clients who have more than 2 accounts\"",
    ],
  },
  {
    title: "Understanding the response",
    items: [
      "Response text — The natural language answer to your question",
      "Applied Filters — SQL WHERE clauses used to filter the data",
      "Generated SQL — The actual SQL query built from your question",
      "Result Table — Tabular data returned for list/report queries",
      "Badges — Rows scanned, sub-queries, and filter count metadata",
    ],
  },
  {
    title: "Tips",
    items: [
      "You can send multiple queries at once — they run in parallel",
      "Be specific with column names when possible (e.g. \"profile status\" instead of just \"status\")",
      "Each query takes ~60 seconds as it runs a full automation cycle",
    ],
  },
];

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 120_000;

export default function QueryPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<Set<string>>(new Set());

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const updateEntry = useCallback(
    (entryId: string, updates: Partial<ChatEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, ...updates } : e)),
      );
    },
    [],
  );

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
              error: "Query timed out after 2 minutes",
              elapsed,
            });
            break;
          }

          await new Promise((r) => setTimeout(r, POLL_INTERVAL));

          let res: Response;
          try {
            res = await fetch(`/api/query/${runId}`);
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
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        const data = await res.json();

        if (!res.ok) {
          updateEntry(entryId, {
            loading: false,
            error: data.error ?? "Failed to start query",
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

  const activeCount = entries.filter((e) => e.loading).length;
  const showEmpty = entries.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)]">
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Title level="h3">Query Assistant</Title>
              {activeCount > 0 && (
                <Badge variant="secondary">
                  {activeCount} running
                </Badge>
              )}
            </div>
            <Text level="xSmall" color="muted">
              Ask questions about your client data — powered by SQL Query Generator
            </Text>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHelp(!showHelp)}
            className="shrink-0"
          >
            <Icon type="CircleHelp" size="sm" />
          </Button>
        </div>

        {showHelp && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 space-y-4">
            {HELP_SECTIONS.map((section) => (
              <div key={section.title}>
                <Text level="small" className="font-semibold">
                  {section.title}
                </Text>
                {section.content && (
                  <Text level="xSmall" color="muted" className="mt-1">
                    {section.content}
                  </Text>
                )}
                {section.items && (
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <Text level="xSmall" color="muted" className="inline">
                          {item}
                        </Text>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <Icon type="Search" size="xl" className="text-muted-foreground mb-3 mx-auto" />
              <Title level="h3">Ask a question</Title>
              <Text color="muted" className="mt-1">
                Type a natural language query about your client and account data.
              </Text>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  className="text-left text-sm p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
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
                  <div className="max-w-[80%] rounded-lg px-4 py-3 bg-primary text-primary-foreground">
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
                        <AlertTitle>Query failed</AlertTitle>
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

      <div className="p-4 border-t border-border shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            size="icon"
            onClick={() => handleSubmit()}
            disabled={!input.trim()}
          >
            <Icon type="SendHorizontal" size="sm" />
          </Button>
        </div>
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
      ? "Starting automation..."
      : seconds < 10
        ? "Running query..."
        : seconds < 30
          ? "Processing data..."
          : seconds < 60
            ? "Generating response..."
            : "Almost done...";

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
          <Text level="xSmall" color="muted">
            {phase}
          </Text>
          <Text level="xSmall" color="muted" className="ml-auto font-mono">
            {seconds}s
          </Text>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result, elapsed }: { result: QueryResult; elapsed: number }) {
  const [showSql, setShowSql] = useState(false);
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full space-y-3">
        <div className="rounded-lg px-4 py-3 bg-muted">
          <Text level="small">{result.responseText ?? "No response text returned."}</Text>
        </div>

        <div className="flex flex-wrap gap-2 px-1">
          {result.resultRowCount != null && (
            <Badge variant="secondary">
              {result.resultRowCount} row{result.resultRowCount !== 1 ? "s" : ""} scanned
            </Badge>
          )}
          {result.subQueryCount != null && (
            <Badge variant="secondary">
              {result.subQueryCount} sub-quer{result.subQueryCount !== 1 ? "ies" : "y"}
            </Badge>
          )}
          {result.appliedWhereClauses && result.appliedWhereClauses.length > 0 && (
            <Badge variant="secondary">
              {result.appliedWhereClauses.length} filter{result.appliedWhereClauses.length !== 1 ? "s" : ""}
            </Badge>
          )}
          <Badge variant="success">Completed</Badge>
          {elapsed > 0 && (
            <Badge variant="secondary">
              {Math.round(elapsed / 1000)}s
            </Badge>
          )}
        </div>

        {result.appliedWhereClauses &&
          result.appliedWhereClauses.length > 0 &&
          result.appliedWhereClauses[0] !== "(no filter)" && (
            <div className="rounded-lg border border-border px-4 py-3 space-y-1">
              <Text level="xSmall" className="font-medium">
                Applied Filters
              </Text>
              {result.appliedWhereClauses.map((clause, i) => (
                <Text key={i} level="xSmall" color="muted" className="font-mono">
                  {clause}
                </Text>
              ))}
            </div>
          )}

        {result.generatedSql && (
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setShowSql(!showSql)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
            >
              <Text level="xSmall" className="font-medium">
                Generated SQL
              </Text>
              <Icon type={showSql ? "ChevronUp" : "ChevronDown"} size="sm" className="text-muted-foreground" />
            </button>
            {showSql && (
              <div className="px-4 py-3 border-t border-border bg-muted/30">
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {result.generatedSql}
                </pre>
              </div>
            )}
          </div>
        )}

        {result.tableData && result.tableData.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setShowTable(!showTable)}
              className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/50 transition-colors"
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
                    <tr className="border-b border-border bg-muted/50">
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
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
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
