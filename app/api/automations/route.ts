import { req, ORG_ID, WORKSPACE_ID } from "@/lib/kognitos";
import { NextResponse } from "next/server";

const TARGET_AUTOMATION_ID = "7NMPU5tknPoocOFoLfRss";

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

  const a = (await res.json()) as {
    name: string;
    display_name: string;
    english_code?: string;
    create_time?: string;
    update_time?: string;
    state?: string;
  };

  const automations = [
    {
      id: a.name.split("/").pop()!,
      displayName: a.display_name,
      resourceName: a.name,
      englishCode: a.english_code ?? null,
      createdAt: a.create_time ?? null,
      updatedAt: a.update_time ?? null,
      state: a.state ?? null,
    },
  ];

  return NextResponse.json({ automations });
}
