import { NextResponse } from "next/server";
import {
  req,
  ORG_ID,
  WORKSPACE_ID,
  invokeAutomation,
  pollRun,
  parseOutputValue,
} from "@/lib/kognitos";
import { decodeArrowTable } from "@/lib/arrow";

const AUTOMATION_ID = "7NMPU5tknPoocOFoLfRss";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const { query } = body as { query: string };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const { runId, error: invokeError } = await invokeAutomation(
    AUTOMATION_ID,
    { "User Query": { text: query.trim() } },
    "AUTOMATION_STAGE_DRAFT",
  );

  if (!runId) {
    return NextResponse.json(
      { error: invokeError ?? "Failed to invoke automation" },
      { status: 500 },
    );
  }

  const result = await pollRun(AUTOMATION_ID, runId, 90_000, 2000);

  if (result.status === "failed" || result.status === "timeout") {
    return NextResponse.json(
      {
        error: result.error ?? `Run ${result.status}`,
        status: result.status,
        runId,
      },
      { status: 500 },
    );
  }

  if (result.status === "awaiting_guidance") {
    return NextResponse.json(
      {
        error: result.error ?? "Run is awaiting guidance",
        status: "awaiting_guidance",
        runId,
      },
      { status: 422 },
    );
  }

  const outputs = result.outputs;

  let tableData: Record<string, unknown>[] | null = null;
  const runRes = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${AUTOMATION_ID}/runs/${runId}`,
  );
  if (runRes.ok) {
    const runData = await runRes.json();
    const rawOutputs = runData.state?.completed?.outputs ?? {};
    for (const val of Object.values(rawOutputs) as Array<Record<string, unknown>>) {
      const b64 = (val?.table as Record<string, Record<string, string>>)?.inline?.data;
      if (b64) {
        tableData = decodeArrowTable(b64);
        break;
      }
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
