import { req, ORG_ID, WORKSPACE_ID } from "@/lib/kognitos";
import { NextResponse } from "next/server";

const TARGET_AUTOMATION_ID = "7NMPU5tknPoocOFoLfRss";

export const dynamic = "force-dynamic";

export async function GET() {
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${TARGET_AUTOMATION_ID}`;
  const res = await req(path);

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json(
      { error: `Failed to fetch automation: ${res.status}`, detail: body },
      { status: res.status },
    );
  }

  const raw = (await res.json()) as Record<string, unknown>;

  const a = raw as {
    name: string;
    display_name: string;
    create_time?: string;
    update_time?: string;
    state?: string;
    connections?: Record<string, unknown>;
  };

  const automations = [
    {
      id: a.name.split("/").pop()!,
      displayName: a.display_name,
      resourceName: a.name,
      createdAt: a.create_time ?? null,
      updatedAt: a.update_time ?? null,
      state: a.state ?? null,
      connections: a.connections ?? null,
    },
  ];

  return NextResponse.json({ automations });
}
