import { req, ORG_ID, WORKSPACE_ID } from "@/lib/kognitos";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface RawAutomation {
  name: string;
  display_name: string;
  create_time?: string;
  update_time?: string;
  state?: string;
  connections?: Record<string, unknown>;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${id}`;
  const res = await req(path);

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json(
      { error: `Failed to fetch automation: ${res.status}`, detail: body },
      { status: res.status },
    );
  }

  const a = (await res.json()) as RawAutomation;

  return NextResponse.json({
    automation: {
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
    },
  });
}
