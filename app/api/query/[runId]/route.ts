import { NextResponse } from "next/server";
import { req, ORG_ID, WORKSPACE_ID, parseOutputValue } from "@/lib/kognitos";
import { decodeArrowTable } from "@/lib/arrow";
import { getSqlQueryGeneratorAutomationId } from "@/lib/query-assistant";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${getSqlQueryGeneratorAutomationId()}/runs/${runId}`,
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
    for (const val of Object.values(rawOutputs) as Array<Record<string, unknown>>) {
      const b64 = (val?.table as Record<string, Record<string, string>>)?.inline?.data;
      if (b64) {
        tableData = decodeArrowTable(b64);
        break;
      }
    }

    return NextResponse.json({
      status: "completed",
      runId,
      responseText: outputs.response_text ?? null,
      generatedSql: outputs.generated_sql ?? null,
      questionCount: outputs.question_count ?? null,
      subQuestions: outputs.sub_questions ?? null,
      subQueryCount: outputs.sub_query_count ?? null,
      resultRowCount: outputs.result_row_count ?? null,
      appliedWhereClauses: outputs.applied_where_clauses ?? null,
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
