import { NextResponse } from "next/server";
import { req, ORG_ID, WORKSPACE_ID, parseOutputValue } from "@/lib/kognitos";
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

  if (data.state?.completed) {
    const rawOutputs = data.state.completed.outputs ?? {};
    const outputs: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawOutputs)) {
      outputs[key] = parseOutputValue(val as Record<string, unknown>);
    }

    let tableData: Record<string, unknown>[] | null = null;
    const queryResultRaw = (rawOutputs.query_result as Record<string, unknown> | undefined) ?? null;
    const b64 = (queryResultRaw?.table as Record<string, Record<string, string>> | undefined)?.inline?.data;
    if (b64) {
      try {
        tableData = decodeArrowTable(b64);
      } catch {
        tableData = null;
      }
    }

    return NextResponse.json({
      status: "completed",
      runId,
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
      status: "failed",
      runId,
      error: data.state.failed.error?.description ?? "Run failed",
    });
  }

  if (data.state?.awaiting_guidance) {
    return NextResponse.json({
      status: "awaiting_guidance",
      runId,
      error:
        data.state.awaiting_guidance.exception ??
        data.state.awaiting_guidance.description ??
        "Awaiting guidance",
    });
  }

  const currentState = Object.keys(data.state ?? {})[0] ?? "unknown";
  return NextResponse.json({ status: "running", runId, state: currentState });
}
