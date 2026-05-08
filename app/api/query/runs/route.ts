import { NextResponse } from "next/server";
import {
  req,
  ORG_ID,
  WORKSPACE_ID,
  parseOutputValue,
  kognitosRunUrl,
} from "@/lib/kognitos";
import { getSqlQueryGeneratorAutomationId } from "@/lib/query-assistant";

export const dynamic = "force-dynamic";

interface RawRun {
  name: string;
  create_time?: string;
  update_time?: string;
  stage?: string;
  stage_version?: string;
  user_inputs?: Record<string, Record<string, unknown>>;
  state?: {
    completed?: { outputs?: Record<string, Record<string, unknown>> };
    failed?: { error?: { description?: string } };
    awaiting_guidance?: { exception?: string; description?: string };
    [key: string]: unknown;
  };
}

export interface QueryRunSummary {
  runId: string;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  /** Automation version snapshot at the time of the run (e.g. "5.8"). */
  stageVersion: string | null;
  status: string;
  question: string | null;
  answer: string | null;
  errorText: string | null;
  resultRowCount: number | null;
  subQueryCount: number | null;
  generatedSqlPreview: string | null;
  appliedWhereClauseCount: number | null;
  kognitosUrl: string;
}

const SQL_PREVIEW_CHARS = 220;

function deriveStatus(state: RawRun["state"]): string {
  if (!state) return "unknown";
  if (state.completed) return "completed";
  if (state.failed) return "failed";
  if (state.awaiting_guidance) return "awaiting_guidance";
  return Object.keys(state)[0] ?? "unknown";
}

function summarizeRun(raw: RawRun, automationId: string): QueryRunSummary {
  const runId = raw.name.split("/").pop() ?? raw.name;
  const status = deriveStatus(raw.state);

  // Support both "user_query" (Updating Version) and legacy "User Query" key.
  const userQueryRaw =
    raw.user_inputs?.["user_query"] ?? raw.user_inputs?.["User Query"];
  const question =
    userQueryRaw && typeof userQueryRaw.text === "string"
      ? (userQueryRaw.text as string)
      : null;

  let answer: string | null = null;
  let errorText: string | null = null;
  let resultRowCount: number | null = null;
  let subQueryCount: number | null = null;
  let generatedSqlPreview: string | null = null;
  let appliedWhereClauseCount: number | null = null;

  if (raw.state?.completed?.outputs) {
    const outputs = raw.state.completed.outputs;
    const parsed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(outputs)) {
      parsed[k] = parseOutputValue(v as Record<string, unknown>);
    }
    if (typeof parsed.response_text === "string") {
      answer = parsed.response_text as string;
    }
    if (typeof parsed.result_row_count === "number") {
      resultRowCount = parsed.result_row_count as number;
    }
    if (typeof parsed.sub_query_count === "number") {
      subQueryCount = parsed.sub_query_count as number;
    }
    if (typeof parsed.generated_sql === "string") {
      const sql = (parsed.generated_sql as string).trim();
      if (sql.length > 0) {
        generatedSqlPreview =
          sql.length > SQL_PREVIEW_CHARS
            ? sql.slice(0, SQL_PREVIEW_CHARS) + "…"
            : sql;
      }
    }
    if (Array.isArray(parsed.applied_where_clauses)) {
      appliedWhereClauseCount = (parsed.applied_where_clauses as unknown[]).length;
    }
  } else if (raw.state?.failed) {
    errorText = raw.state.failed.error?.description ?? "Run failed";
  } else if (raw.state?.awaiting_guidance) {
    errorText =
      raw.state.awaiting_guidance.exception ??
      raw.state.awaiting_guidance.description ??
      "Awaiting guidance";
  }

  return {
    runId,
    createdAt: raw.create_time ?? null,
    updatedAt: raw.update_time ?? null,
    stage: raw.stage ?? null,
    stageVersion: raw.stage_version ?? null,
    status,
    question,
    answer,
    errorText,
    resultRowCount,
    subQueryCount,
    generatedSqlPreview,
    appliedWhereClauseCount,
    kognitosUrl: kognitosRunUrl(runId, automationId),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pageSize = url.searchParams.get("pageSize") ?? "25";
  const pageToken = url.searchParams.get("pageToken");

  const automationId = getSqlQueryGeneratorAutomationId();
  const params = new URLSearchParams();
  params.set("pageSize", pageSize);
  if (pageToken) params.set("pageToken", pageToken);

  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs?${params.toString()}`;
  const res = await req(path);

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Failed to fetch runs: ${res.status}`, detail: text.slice(0, 300) },
      { status: res.status },
    );
  }

  const data = (await res.json()) as {
    runs?: RawRun[];
    next_page_token?: string | null;
  };

  const runs = (data.runs ?? []).map((r) => summarizeRun(r, automationId));

  return NextResponse.json({
    runs,
    nextPageToken: data.next_page_token ?? null,
  });
}
