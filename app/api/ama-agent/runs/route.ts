import { NextResponse } from "next/server";
import {
  req,
  ORG_ID,
  WORKSPACE_ID,
  parseOutputValue,
  kognitosRunUrl,
} from "@/lib/kognitos";
import { getAmaAgentAutomationId } from "@/lib/ama-agent";

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

export interface RunSummary {
  runId: string;
  createdAt: string | null;
  updatedAt: string | null;
  stage: string | null;
  /** Automation version snapshot at the time of the run (e.g. "5.8"). */
  stageVersion: string | null;
  status: string;
  question: string | null;
  requesterEmail: string | null;
  answer: string | null;
  errorText: string | null;
  queryType: string | null;
  recordCount: number | null;
  databasesQueried: string | null;
  kognitosUrl: string;
}

function deriveStatus(state: RawRun["state"]): string {
  if (!state) return "unknown";
  if (state.completed) return "completed";
  if (state.failed) return "failed";
  if (state.awaiting_guidance) return "awaiting_guidance";
  return Object.keys(state)[0] ?? "unknown";
}

function summarizeRun(raw: RawRun, automationId: string): RunSummary {
  const runId = raw.name.split("/").pop() ?? raw.name;
  const status = deriveStatus(raw.state);

  const userQueryRaw = raw.user_inputs?.["User Query"];
  const requesterRaw = raw.user_inputs?.["Requester Email"];
  const question =
    userQueryRaw && typeof userQueryRaw.text === "string"
      ? (userQueryRaw.text as string)
      : null;
  const requesterEmail =
    requesterRaw && typeof requesterRaw.text === "string"
      ? (requesterRaw.text as string)
      : null;

  let answer: string | null = null;
  let errorText: string | null = null;
  let queryType: string | null = null;
  let recordCount: number | null = null;
  let databasesQueried: string | null = null;

  if (raw.state?.completed?.outputs) {
    const outputs = raw.state.completed.outputs;
    const parsed: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(outputs)) {
      parsed[k] = parseOutputValue(v as Record<string, unknown>);
    }
    if (typeof parsed.response_text === "string") {
      answer = parsed.response_text as string;
    }
    if (typeof parsed.query_type === "string") {
      queryType = parsed.query_type as string;
    }
    if (typeof parsed.record_count === "number") {
      recordCount = parsed.record_count as number;
    }
    if (typeof parsed.databases_queried === "string") {
      databasesQueried = parsed.databases_queried as string;
    } else if (Array.isArray(parsed.databases_queried)) {
      databasesQueried = (parsed.databases_queried as unknown[]).join(", ");
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
    requesterEmail,
    answer,
    errorText,
    queryType,
    recordCount,
    databasesQueried,
    kognitosUrl: kognitosRunUrl(runId, automationId),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pageSize = url.searchParams.get("pageSize") ?? "25";
  const pageToken = url.searchParams.get("pageToken");

  const automationId = getAmaAgentAutomationId();
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
