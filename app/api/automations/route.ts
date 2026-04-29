import { req, ORG_ID, WORKSPACE_ID } from "@/lib/kognitos";
import { NextResponse } from "next/server";
import { getAmaAgentAutomationId } from "@/lib/ama-agent";

const TARGET_AUTOMATION_IDS = [
  "7NMPU5tknPoocOFoLfRss", // SQL Query Generator
  getAmaAgentAutomationId(), // AMAAgent
];

export const dynamic = "force-dynamic";

interface RawAutomation {
  name: string;
  display_name: string;
  create_time?: string;
  update_time?: string;
  state?: string;
  connections?: Record<string, unknown>;
}

async function fetchAutomation(id: string) {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${id}`;
  const res = await req(path);
  if (!res.ok) {
    return { id, error: `Failed to fetch (${res.status})` };
  }
  const a = (await res.json()) as RawAutomation;
  return {
    id: a.name.split("/").pop()!,
    displayName: a.display_name,
    resourceName: a.name,
    createdAt: a.create_time ?? null,
    updatedAt: a.update_time ?? null,
    state: a.state ?? null,
    connections: (a.connections ?? null) as Record<
      string,
      { connection_id?: string; endpoint?: string }
    > | null,
  };
}

export async function GET() {
  const results = await Promise.all(
    TARGET_AUTOMATION_IDS.map((id) => fetchAutomation(id)),
  );
  const automations = results.filter((r): r is Exclude<typeof r, { error: string }> => !("error" in r));
  return NextResponse.json({ automations });
}
