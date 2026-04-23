import { NextResponse } from "next/server";
import { invokeAutomation } from "@/lib/kognitos";
import { getSqlQueryGeneratorAutomationId, QUERY_ASSISTANT_STAGE } from "@/lib/query-assistant";

export async function POST(request: Request) {
  const body = await request.json();
  const { query } = body as { query: string };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const { runId, error: invokeError } = await invokeAutomation(
    getSqlQueryGeneratorAutomationId(),
    { "User Query": { text: query.trim() } },
    QUERY_ASSISTANT_STAGE,
  );

  if (!runId) {
    return NextResponse.json(
      { error: invokeError ?? "Failed to invoke automation" },
      { status: 500 },
    );
  }

  return NextResponse.json({ runId, status: "started" });
}
