/**
 * AMAAgent automation helpers — mirrors the Query Assistant pattern
 * (lib/query-assistant.ts) but maps the AMAAgent output schema:
 *   response_text, query_type, record_count, databases_queried,
 *   query_result (Arrow table), csv_data, generated_sql, sub_questions.
 *
 * AMAAgent is invoked at the DRAFT stage while we iterate on the SOP.
 */

import {
  req,
  ORG_ID,
  WORKSPACE_ID,
  parseOutputValue,
  kognitosRunUrl,
} from "./kognitos";
import { decodeArrowTable } from "./arrow";

const DEFAULT_AMA_AGENT_ID = "mC3GaXQfTaca9mVUSziGW";

export function getAmaAgentAutomationId(): string {
  return (process.env.KOGNITOS_AMA_AGENT_ID || DEFAULT_AMA_AGENT_ID).trim();
}

export const AMA_AGENT_STAGE = "AUTOMATION_STAGE_DRAFT" as const;

export interface AmaAgentRunDetail {
  status: "completed" | "failed" | "awaiting_guidance" | "running" | "error";
  runId: string;
  /** "AUTOMATION_STAGE_DRAFT" or "AUTOMATION_STAGE_PUBLISHED" */
  stage: string | null;
  /** Semver-ish string returned by Kognitos (e.g. "5.8"). */
  stageVersion: string | null;
  question: string | null;
  requesterEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  kognitosUrl: string;
  responseText?: string | null;
  queryType?: string | null;
  recordCount?: number | null;
  databasesQueried?: string | string[] | null;
  generatedSql?: string | null;
  subQuestions?: string[] | null;
  csvData?: string | null;
  tableData?: Record<string, unknown>[] | null;
  error?: string | null;
  state?: string | null;
}

interface RawRunForDetail {
  name?: string;
  create_time?: string;
  update_time?: string;
  stage?: string;
  stage_version?: string;
  user_inputs?: Record<string, Record<string, unknown>>;
  state?: {
    completed?: { outputs?: Record<string, unknown> };
    failed?: { error?: { description?: string } };
    awaiting_guidance?: { exception?: string; description?: string };
    [key: string]: unknown;
  };
}

function readUserInputText(
  inputs: RawRunForDetail["user_inputs"],
  key: string,
): string | null {
  const v = inputs?.[key];
  if (v && typeof v.text === "string") return v.text as string;
  return null;
}

/**
 * Fetch and parse a single DB Agent run from Kognitos. Used by both the per-
 * run detail endpoint (`/api/ama-agent/[runId]`) and the compare endpoint
 * (`/api/ama-agent/run-groups/compare`) so they always see the same shape.
 */
export async function fetchAmaAgentRunDetail(
  runId: string,
): Promise<AmaAgentRunDetail> {
  const automationId = getAmaAgentAutomationId();
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`,
  );
  if (!res.ok) {
    return {
      status: "error",
      runId,
      stage: null,
      stageVersion: null,
      question: null,
      requesterEmail: null,
      createdAt: null,
      updatedAt: null,
      kognitosUrl: kognitosRunUrl(runId, automationId),
      error: `Failed to fetch run: ${res.status}`,
    };
  }
  const data = (await res.json()) as RawRunForDetail;

  // Per-run metadata that is independent of run state. Surfacing these from
  // the helper means every consumer (run detail page, compare view, scripts)
  // sees the same shape — the UI no longer has to fall back to the listing
  // endpoint just to render the stage / version / requester badges.
  const baseMeta = {
    runId,
    stage: data.stage ?? null,
    stageVersion: data.stage_version ?? null,
    question: readUserInputText(data.user_inputs, "User Query"),
    requesterEmail: readUserInputText(data.user_inputs, "Requester Email"),
    createdAt: data.create_time ?? null,
    updatedAt: data.update_time ?? null,
    kognitosUrl: kognitosRunUrl(runId, automationId),
  } as const;

  if (data.state?.completed) {
    const rawOutputs = (data.state.completed.outputs ?? {}) as Record<
      string,
      unknown
    >;
    const outputs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawOutputs)) {
      outputs[key] = parseOutputValue(val as Record<string, unknown>);
    }
    let tableData: Record<string, unknown>[] | null = null;
    const queryResultRaw =
      (rawOutputs.query_result as Record<string, unknown> | undefined) ?? null;
    const b64 = (
      queryResultRaw?.table as Record<string, Record<string, string>> | undefined
    )?.inline?.data;
    if (b64) {
      try {
        tableData = decodeArrowTable(b64);
      } catch {
        tableData = null;
      }
    }
    return {
      status: "completed",
      ...baseMeta,
      responseText: (outputs.response_text as string | null) ?? null,
      queryType: (outputs.query_type as string | null) ?? null,
      recordCount: (outputs.record_count as number | null) ?? null,
      databasesQueried:
        (outputs.databases_queried as string | string[] | null) ?? null,
      generatedSql: (outputs.generated_sql as string | null) ?? null,
      subQuestions: (outputs.sub_questions as string[] | null) ?? null,
      csvData: (outputs.csv_data as string | null) ?? null,
      tableData,
    };
  }
  if (data.state?.failed) {
    return {
      status: "failed",
      ...baseMeta,
      error: data.state.failed.error?.description ?? "Run failed",
    };
  }
  if (data.state?.awaiting_guidance) {
    return {
      status: "awaiting_guidance",
      ...baseMeta,
      error:
        data.state.awaiting_guidance.exception ??
        data.state.awaiting_guidance.description ??
        "Awaiting guidance",
    };
  }
  const currentState = Object.keys(data.state ?? {})[0] ?? "unknown";
  return { status: "running", ...baseMeta, state: currentState };
}
