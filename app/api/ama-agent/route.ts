import { NextResponse } from "next/server";
import { invokeAutomation } from "@/lib/kognitos";
import { getAmaAgentAutomationId, AMA_AGENT_STAGE } from "@/lib/ama-agent";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();
  const { query, requesterEmail } = body as {
    query?: string;
    requesterEmail?: string;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const inputs: Record<string, unknown> = {
    "User Query": { text: query.trim() },
    "Requester Email": {
      text: requesterEmail?.trim() || "ama-app@kognitos-demo.local",
    },
  };

  const { runId, error: invokeError } = await invokeAutomation(
    getAmaAgentAutomationId(),
    inputs,
    AMA_AGENT_STAGE,
  );

  if (!runId) {
    return NextResponse.json(
      { error: invokeError ?? "Failed to invoke DB Agent" },
      { status: 500 },
    );
  }

  return NextResponse.json({ runId, status: "started" });
}
