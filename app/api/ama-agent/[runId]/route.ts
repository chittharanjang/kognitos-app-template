import { NextResponse } from "next/server";
import { fetchAmaAgentRunDetail } from "@/lib/ama-agent";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const detail = await fetchAmaAgentRunDetail(runId);
  const status =
    detail.status === "error" && detail.error?.startsWith("Failed to fetch")
      ? 502
      : 200;
  return NextResponse.json(detail, { status });
}
