/**
 * Hide low-signal technical content from chat answers unless the user
 * explicitly asked for it.
 *
 * Rules:
 *   1. If the latest user message did NOT request SQL (regex below), strip
 *      any fenced ```sql ... ``` blocks from assistant content.
 *   2. Always strip fenced ```csv ... ``` blocks — CSV downloads belong on
 *      the Run History detail page, not in the chat bubble.
 *   3. Tidy up the resulting whitespace so we don't leave a trailing
 *      sentence like "Here's the SQL I ran:" with nothing after it.
 *
 * The DB Agent's run-detail page still shows the full SQL / CSV / Result
 * Table — this sanitizer only governs the chat bubble.
 */

const SQL_REQUEST_RE =
  /\b(sql|query)\b.*\b(show|share|include|see|reveal|view|return|give|tell|what)\b|\b(show|share|include|see|reveal|view|return|give|tell|what)\b.*\b(sql|query)\b|\bshow me the (sql|query)\b/i;

const SIMPLE_SQL_REQUEST_RE = /\bshow (me )?the (sql|query)\b|\binclude (the )?sql\b|\bwith (the )?sql\b/i;

export function userAskedForSql(userMessage: string | null | undefined): boolean {
  if (!userMessage) return false;
  if (SIMPLE_SQL_REQUEST_RE.test(userMessage)) return true;
  if (SQL_REQUEST_RE.test(userMessage)) return true;
  return false;
}

const SQL_FENCE_RE = /```sql[\s\S]*?```\s*/gi;
const CSV_FENCE_RE = /```csv[\s\S]*?```\s*/gi;
const SQL_LEAD_RE =
  /(?:here(?:'s| is) the (?:sql|query)(?: i (?:ran|used))?:?\s*|the (?:sql|query)(?: i (?:ran|used))? was:?\s*)$/i;

export function sanitizeChatAnswer(
  content: string,
  userMessage: string | null | undefined,
): string {
  if (!content) return content;
  let out = content;

  if (!userAskedForSql(userMessage)) {
    out = out.replace(SQL_FENCE_RE, "");
    // Drop a stray "Here's the SQL I ran:" line that is now followed by nothing.
    out = out
      .split("\n")
      .map((line) => (SQL_LEAD_RE.test(line.trim()) ? "" : line))
      .join("\n");
  }

  out = out.replace(CSV_FENCE_RE, "");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}
