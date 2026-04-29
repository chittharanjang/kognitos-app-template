/**
 * AMAAgent automation helpers — mirrors the Query Assistant pattern
 * (lib/query-assistant.ts) but maps the AMAAgent output schema:
 *   response_text, query_type, record_count, databases_queried,
 *   query_result (Arrow table), csv_data, generated_sql, sub_questions.
 *
 * AMAAgent is invoked at the DRAFT stage while we iterate on the SOP.
 */

const DEFAULT_AMA_AGENT_ID = "mC3GaXQfTaca9mVUSziGW";

export function getAmaAgentAutomationId(): string {
  return (process.env.KOGNITOS_AMA_AGENT_ID || DEFAULT_AMA_AGENT_ID).trim();
}

export const AMA_AGENT_STAGE = "AUTOMATION_STAGE_DRAFT" as const;
