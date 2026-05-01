"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders Markdown with GitHub-flavored extensions (tables, strikethrough,
 * task lists). Used for DB Agent response_text — which now produces canonical
 * Markdown tables for account-type breakdowns and other structured outputs.
 *
 * The styling is intentionally tight so it composes with Lattice Text/Card
 * shells. Tables get the "answer card" treatment: subtle borders, right-
 * aligned numeric columns when the source markdown specifies it, and a
 * sticky header for long lists.
 */
export function MarkdownText({
  text,
  className,
  compact = false,
}: {
  text: string | null | undefined;
  className?: string;
  compact?: boolean;
}): React.ReactElement | null {
  if (!text || text.trim().length === 0) return null;
  return (
    <div className={["markdown-text", compact ? "compact" : "", className ?? ""].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto rounded-lg border border-border my-2">
              <table
                {...props}
                className="w-full text-sm border-collapse [&_th]:bg-muted/50 [&_th]:text-foreground [&_th]:font-medium [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:border-b [&_th]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-border last:[&_tr_td]:border-b-0 [&_th[align=right]]:text-right [&_td[align=right]]:text-right [&_td[align=right]]:font-mono [&_td[align=right]]:tabular-nums [&_th[align=center]]:text-center [&_td[align=center]]:text-center [&_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-muted/30"
              >
                {children}
              </table>
            </div>
          ),
          p: ({ children }) => <p className="text-sm leading-relaxed [&:not(:first-child)]:mt-2">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside text-sm space-y-0.5 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside text-sm space-y-0.5 my-2">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1.5">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          code: ({ children, ...props }) => {
            const isInline = !("className" in (props as Record<string, unknown>));
            if (isInline) {
              return (
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{children}</code>
              );
            }
            return (
              <code className="block rounded-md bg-muted/60 p-3 font-mono text-xs whitespace-pre-wrap">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-primary underline-offset-2 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
