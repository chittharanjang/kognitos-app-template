const TOKEN = process.env.KOGNITOS_TOKEN;
const ORG_ID = process.env.KOGNITOS_ORG_ID;
const WORKSPACE_ID = process.env.KOGNITOS_WORKSPACE_ID;
const BASE_URL = process.env.KOGNITOS_BASE_URL;
const AUTOMATION_ID = process.env.KOGNITOS_AUTOMATION_ID;

const required: Record<string, string | undefined> = {
  KOGNITOS_TOKEN: TOKEN,
  KOGNITOS_ORG_ID: ORG_ID,
  KOGNITOS_WORKSPACE_ID: WORKSPACE_ID,
  KOGNITOS_BASE_URL: BASE_URL,
};

for (const [name, value] of Object.entries(required)) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
}

if (!AUTOMATION_ID) {
  console.warn("KOGNITOS_AUTOMATION_ID not set — some features will be unavailable");
}

export { ORG_ID, WORKSPACE_ID, BASE_URL, AUTOMATION_ID };

export const APP_URL = BASE_URL!.replace("/api/v1", "");

export function kognitosRunUrl(runId: string, automationId?: string): string {
  const autoId = automationId || AUTOMATION_ID;
  return `${APP_URL}/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${autoId}/runs/${runId}`;
}

export async function req(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Automation invoke helpers                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse a single Kognitos typed output value into a plain JS value.
 * Handles text, bool_value, number (with decimal flags), and nested lists.
 */
export function parseOutputValue(v: Record<string, unknown>): unknown {
  if (typeof v.text === "string") return v.text;
  if (typeof v.bool_value === "boolean") return v.bool_value ? "true" : "false";
  if (v.number && typeof v.number === "object") {
    const n = v.number as { lo?: number; mid?: number; hi?: number; flags?: number };
    const scale = ((n.flags ?? 0) >> 16) & 0xff;
    return (n.lo ?? 0) / Math.pow(10, scale);
  }
  if (v.list && typeof v.list === "object") {
    const list = v.list as { items?: Array<Record<string, unknown>> };
    return (list.items ?? []).map((item) => parseOutputValue(item));
  }
  return v;
}

/**
 * Invoke a published Kognitos automation.
 * Returns the run ID for polling, or an error string.
 */
export async function invokeAutomation(
  automationId: string,
  inputs: Record<string, unknown>,
  stage: string = "AUTOMATION_STAGE_PUBLISHED",
): Promise<{ runId: string | null; error?: string }> {
  const res = await req(
    `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}:invoke`,
    {
      method: "POST",
      body: JSON.stringify({ inputs, stage }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    return { runId: null, error: `Invoke failed (${res.status}): ${text.slice(0, 300)}` };
  }

  const data = await res.json();
  const runId = data.run_id?.split("/runs/").pop() ?? null;
  return { runId };
}

export interface PollRunResult {
  status: "completed" | "failed" | "awaiting_guidance" | "timeout";
  outputs: Record<string, unknown>;
  error?: string;
  rawState?: unknown;
}

/**
 * Poll a Kognitos automation run until it reaches a terminal state or times out.
 * Returns parsed outputs on completion.
 */
export async function pollRun(
  automationId: string,
  runId: string,
  timeoutMs = 45_000,
  pollIntervalMs = 1500,
): Promise<PollRunResult> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    const res = await req(
      `/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}/automations/${automationId}/runs/${runId}`,
    );
    if (!res.ok) continue;

    const data = await res.json();

    if (data.state?.completed) {
      const rawOutputs = data.state.completed.outputs ?? {};
      const outputs: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rawOutputs)) {
        outputs[key] = parseOutputValue(val as Record<string, unknown>);
      }
      return { status: "completed", outputs };
    }

    if (data.state?.failed) {
      return {
        status: "failed",
        outputs: {},
        error: data.state.failed.error?.description ?? "Run failed",
      };
    }

    if (data.state?.awaiting_guidance) {
      return {
        status: "awaiting_guidance",
        outputs: {},
        rawState: data.state.awaiting_guidance,
        error:
          data.state.awaiting_guidance.exception ??
          data.state.awaiting_guidance.description ??
          "Awaiting guidance",
      };
    }
  }

  return { status: "timeout", outputs: {}, error: "Run did not complete within timeout" };
}
