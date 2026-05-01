"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Title,
  Text,
  Button,
  Icon,
  Skeleton,
  Markdown,
} from "@kognitos/lattice";
import { useChatContext } from "@/lib/chat/chat-context";
import { pickStarterSuggestionsForSession } from "@/lib/guide-queries";
import { sanitizeChatAnswer } from "@/lib/chat/sanitizer";

function lastUserMessage(messages: { role: string; content: string }[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return null;
}

function lastUserMessageBefore(
  messages: { role: string; content: string }[],
  idx: number,
): string | null {
  for (let i = idx - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return null;
}

export default function ChatPage() {
  const {
    messages,
    isLoadingMessages,
    isSending,
    streamingContent,
    toolStatus,
    error,
    sendMessage,
    activeSessionId,
    followUpSuggestions,
  } = useChatContext();

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** Seed for starter chips before a Supabase session id exists; rotates when user opens a fresh chat. */
  const [draftSessionSeed, setDraftSessionSeed] = useState(
    () => `draft-${typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())}`
  );
  const prevSessionRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prevSessionRef.current !== undefined && prevSessionRef.current !== null && activeSessionId === null) {
      setDraftSessionSeed(`draft-${crypto.randomUUID()}`);
    }
    prevSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  const handleSubmit = async (text?: string) => {
    const msg = text ?? input.trim();
    if (!msg || isSending) return;
    setInput("");
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const showEmpty = !activeSessionId || (messages.length === 0 && !isLoadingMessages && !isSending);

  const sessionSeed = activeSessionId ?? draftSessionSeed;
  const sessionStarterChips = useMemo(
    () => pickStarterSuggestionsForSession(sessionSeed, 4),
    [sessionSeed]
  );

  const showFooterSuggestionChips =
    showEmpty || (!isSending && messages.length > 0 && followUpSuggestions.length > 0);
  const footerSuggestionChips = showEmpty ? sessionStarterChips : followUpSuggestions;

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)]">
      <div className="p-4 border-b border-border shrink-0">
        <Title level="h3">Chat</Title>
        <Text level="xSmall" color="muted">
          Each message runs the same SQL Query Assistant as the Query page; results can take up to a few minutes
        </Text>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoadingMessages ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-3/4" />
            ))}
          </div>
        ) : showEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="text-center">
              <Icon type="MessageSquare" size="xl" className="text-muted-foreground mb-3 mx-auto" />
              <Title level="h3">Ask a question</Title>
              <Text color="muted" className="mt-1">
                Ask about clients, accounts, and profiles (FIDO, WealthX, Profile Status). Suggested questions below the input are from the{" "}
                <Link href="/guide" className="text-primary underline underline-offset-2 hover:no-underline">
                  User Guide
                </Link>{" "}
                and stay consistent for this chat session.
              </Text>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const lastUser = lastUserMessageBefore(messages, i);
              const display =
                msg.role === "assistant"
                  ? sanitizeChatAnswer(msg.content, lastUser)
                  : msg.content;
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="chat-markdown">
                        <Markdown textProps={{ level: "small" }}>{display}</Markdown>
                      </div>
                    ) : (
                      <Text level="small" className="text-primary-foreground">{display}</Text>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && streamingContent && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-4 py-3 bg-muted">
                  <div className="chat-markdown">
                    <Markdown textProps={{ level: "small" }}>
                      {sanitizeChatAnswer(
                        streamingContent,
                        lastUserMessage(messages),
                      )}
                    </Markdown>
                  </div>
                </div>
              </div>
            )}

            {isSending && !error && (!streamingContent || toolStatus) && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-3 bg-muted">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                    <Text level="xSmall" color="muted">
                      {toolStatus ?? "Thinking..."}
                    </Text>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-3 bg-destructive/10 border border-destructive/20">
                  <Text level="small" className="text-destructive">{error}</Text>
                </div>
              </div>
            )}

          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-border shrink-0 space-y-3">
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
            disabled={!input.trim() || isSending}
          >
            <Icon type="SendHorizontal" size="sm" />
          </Button>
        </div>
        {showFooterSuggestionChips && (
          <div className="flex flex-wrap items-start gap-2">
            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
              {footerSuggestionChips.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSubmit(s)}
                  className="text-left text-xs sm:text-sm px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors max-w-full sm:max-w-[calc(50%-0.25rem)]"
                >
                  {s}
                </button>
              ))}
            </div>
            {!showEmpty && (
              <Link
                href="/guide"
                className="text-xs text-primary underline underline-offset-2 hover:no-underline shrink-0 pt-2"
              >
                User Guide
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
