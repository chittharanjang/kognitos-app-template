import { NextResponse } from "next/server";
import {
  req,
  ORG_ID,
  WORKSPACE_ID,
  parseOutputValue,
  kognitosRunUrl,
} from "@/lib/kognitos";
import { decodeArrowTable } from "@/lib/arrow";
import { getAmaAgentAutomationId } from "@/lib/ama-agent";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const automationId = getAmaAgentAutomationId();

  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`,
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: `Failed to fetch run: ${res.status}`, status: "error" },
      { status: res.status },
    );
  }

  const data = await res.json();

  const userInputs = (data.user_inputs ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const userQuery = userInputs["User Query"];
  const requester = userInputs["Requester Email"];
  const question =
    userQuery && typeof userQuery.text === "string"
      ? (userQuery.text as string)
      : null;
  const requesterEmail =
    requester && typeof requester.text === "string"
      ? (requester.text as string)
      : null;

  const base = {
    runId,
    question,
    requesterEmail,
    createdAt: (data.create_time as string | undefined) ?? null,
    updatedAt: (data.update_time as string | undefined) ?? null,
    stage: (data.stage as string | undefined) ?? null,
    kognitosUrl: kognitosRunUrl(runId, automationId),
  };

  if (data.state?.completed) {
    const rawOutputs = data.state.completed.outputs ?? {};
    const outputs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawOutputs)) {
      outputs[key] = parseOutputValue(val as Record<string, unknown>);
    }

    let tableData: Record<string, unknown>[] | null = null;
    const queryResultRaw = (rawOutputs.query_result as
      | Record<string, unknown>
      | undefined) ?? null;
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

    return NextResponse.json({
      ...base,
      status: "completed",
      responseText: outputs.response_text ?? null,
      queryType: outputs.query_type ?? null,
      recordCount: outputs.record_count ?? null,
      databasesQueried: outputs.databases_queried ?? null,
      generatedSql: outputs.generated_sql ?? null,
      subQuestions: outputs.sub_questions ?? null,
      csvData: outputs.csv_data ?? null,
      tableData,
    });
  }

  if (data.state?.failed) {
    return NextResponse.json({
      ...base,
      status: "failed",
      error: data.state.failed.error?.description ?? "Run failed",
    });
  }

  if (data.state?.awaiting_guidance) {
    return NextResponse.json({
      ...base,
      status: "awaiting_guidance",
      error:
        data.state.awaiting_guidance.exception ??
        data.state.awaiting_guidance.description ??
        "Awaiting guidance",
    });
  }

  const currentState = Object.keys(data.state ?? {})[0] ?? "unknown";
  return NextResponse.json({ ...base, status: "running", state: currentState });
}
