"use client";

import { Text } from "@kognitos/lattice";
import { MarkdownText } from "./markdown-text";

/**
 * When the DB Agent decomposes a user prompt into multiple sub-questions, the
 * automation packs every sub-answer into a single `response_text` blob shaped
 * like:
 *
 *   1. Question one?
 *   Answer one (may include a markdown table)
 *
 *   2. Question two?
 *   Answer two
 *
 * Rendering that as one big Markdown blob breaks tables (each numbered item
 * becomes an `<ol>` list item, so GFM tables collapse to inline `|` text).
 *
 * This component splits the blob back into per-question sections and renders
 * each answer through MarkdownText on its own, so embedded tables, lists, and
 * paragraphs render correctly.
 */

type Section = { index: number; question: string; answer: string };

function parseMultiQuestionResponse(text: string): Section[] {
  if (!text || !text.trim()) return [];
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let current: { index: number; question: string; lines: string[] } | null = null;

  // Match "1. " or "1) " at the very start of a line. Require a space after the
  // delimiter so we don't trip on "1.5" or table cells starting with digits.
  const markerRe = /^(\d+)[.)]\s+(.+)$/;

  for (const line of lines) {
    const m = markerRe.exec(line);
    if (m) {
      if (current) {
        sections.push({
          index: current.index,
          question: current.question.trim(),
          answer: current.lines.join("\n").trim(),
        });
      }
      current = { index: Number(m[1]), question: m[2], lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    sections.push({
      index: current.index,
      question: current.question.trim(),
      answer: current.lines.join("\n").trim(),
    });
  }

  // Require at least 2 sections numbered sequentially 1..N, otherwise fall back
  // to plain Markdown rendering.
  if (sections.length < 2) return [];
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].index !== i + 1) return [];
  }
  return sections;
}

/**
 * Render `text` as a numbered set of sub-question answers. If the text doesn't
 * look like a multi-question response (single sub-question, parser couldn't
 * split, etc.), renders `fallback` instead — typically a plain MarkdownText.
 */
export function MultiQuestionAnswer({
  text,
  subQuestions,
  fallback = null,
}: {
  text: string | null | undefined;
  subQuestions: string[] | null | undefined;
  fallback?: React.ReactNode;
}): React.ReactElement | null {
  if (!text || text.trim().length === 0) {
    return fallback ? <>{fallback}</> : null;
  }
  // Only attempt the split when the agent actually reports multiple
  // sub-questions; single-question responses should render as-is.
  if (!Array.isArray(subQuestions) || subQuestions.length < 2) {
    return fallback ? <>{fallback}</> : null;
  }

  const sections = parseMultiQuestionResponse(text);
  if (sections.length === 0) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div className="space-y-2.5">
      {sections.map((s, i) => {
        // Prefer the question text from `subQuestions` (canonical), fall back
        // to whatever was inline in the response when indices line up.
        const q = subQuestions[i] ?? s.question;
        return (
          <div
            key={i}
            className="rounded-xl border border-border bg-background/60 shadow-sm overflow-hidden"
          >
            <div className="flex items-start gap-2.5 px-3.5 py-2 border-b border-border bg-muted/30">
              <span className="shrink-0 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold tabular-nums">
                {s.index}
              </span>
              <Text level="xSmall" className="font-medium leading-snug">
                {q}
              </Text>
            </div>
            <div className="px-3.5 py-2.5">
              {s.answer.length > 0 ? (
                <MarkdownText text={s.answer} compact />
              ) : (
                <Text level="xSmall" color="muted">
                  (no answer)
                </Text>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
