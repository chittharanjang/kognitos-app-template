import { createHash } from "node:crypto";

/**
 * Helpers shared by the DB Agent "Run History Groups" feature
 * (/ama-agent/run-groups). Keeping the normalization + hashing in one place
 * means the indexer and the URL builder always agree.
 */

export function normalizeQuestion(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function questionIdOf(raw: string | null | undefined): string {
  const norm = normalizeQuestion(raw);
  if (!norm) return "";
  return createHash("sha1").update(norm).digest("hex").slice(0, 12);
}

/**
 * Build a short, single-line preview of an answer text — used as the
 * answer_preview column in db_agent_run_index so the list view doesn't have to
 * fetch full responses just to render a card.
 */
export function answerPreviewOf(
  raw: string | null | undefined,
  maxChars = 280,
): string | null {
  if (!raw) return null;
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > maxChars
    ? collapsed.slice(0, maxChars - 1) + "…"
    : collapsed;
}
