"use client";

import { useRef, useState } from "react";
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
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
}

const SUGGESTIONS = [
  "How many clients have an open account?",
  "List all clients with profile status locked",
  "What is the total number of accounts?",
  "Give me clients who have more than 2 accounts",
];

export default function QueryPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSubmit = async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || isSending) return;
    setInput("");

    const entryId = crypto.randomUUID();
    const newEntry: ChatEntry = { id: entryId, query, result: null, error: null, loading: true };

    setEntries((prev) => [...prev, newEntry]);
    setIsSending(true);
    scrollToBottom();

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, loading: false, error: data.error ?? "Request failed" } : e,
          ),
        );
      } else {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId ? { ...e, loading: false, result: data } : e,
          ),
        );
      }
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, loading: false, error: err instanceof Error ? err.message : "Network error" }
            : e,
        ),
      );
    } finally {
      setIsSending(false);
      scrollToBottom();
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showEmpty = entries.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)]">
      <div className="p-4 border-b border-border shrink-0">
        <Title level="h3">Query Assistant</Title>
        <Text level="xSmall" color="muted">
          Ask questions about your client data — powered by SQL Query Generator
        </Text>
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
                {/* User query */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-lg px-4 py-3 bg-primary text-primary-foreground">
                    <Text level="small" className="text-primary-foreground">
                      {entry.query}
                    </Text>
                  </div>
                </div>

                {/* Loading state */}
                {entry.loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                          <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                        </div>
                        <Text level="xSmall" color="muted">
                          Running query...
                        </Text>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error */}
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

                {/* Result */}
                {entry.result && <ResultCard result={entry.result} />}
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
            disabled={isSending}
            className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button
            size="icon"
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isSending}
          >
            <Icon type="SendHorizontal" size="sm" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResultCard({ result }: { result: QueryResult }) {
  const [showSql, setShowSql] = useState(false);
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] w-full space-y-3">
        {/* Response text */}
        <div className="rounded-lg px-4 py-3 bg-muted">
          <Text level="small">{result.responseText ?? "No response text returned."}</Text>
        </div>

        {/* Metadata badges */}
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
        </div>

        {/* Filters */}
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

        {/* SQL toggle */}
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

        {/* Table data toggle */}
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
