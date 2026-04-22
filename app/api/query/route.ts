import { NextResponse } from "next/server";
import { invokeAutomation } from "@/lib/kognitos";

const AUTOMATION_ID = "7NMPU5tknPoocOFoLfRss";

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

  return NextResponse.json({ runId, status: "started" });
}
