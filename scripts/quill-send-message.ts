import "dotenv/config";
import { ORG_ID, WORKSPACE_ID, BASE_URL } from "../lib/kognitos";
import { readFileSync } from "node:fs";

/**
 * Send a `user_query` message to a Quill thread and stream the response.
 *
 * IMPORTANT: the `:sendMessage` endpoint lives under the *canonical* thread
 * path which includes the parent automation segment:
 *   /organizations/{ORG}/workspaces/{WS}/automations/{AUTO_ID}/agents/quill/threads/{THREAD_ID}:sendMessage
 * (NOT the shorter `/agents/quill/threads/...` form used to create the thread.)
 *
 * Response body is a stream of pretty-printed JSON objects separated by blank
 * lines (not strict newline-delimited JSON). We parse by tracking brace depth.
 *
 * Usage:
 *   npx tsx scripts/quill-send-message.ts <AUTOMATION_ID> <THREAD_ID> "your message"
 *   npx tsx scripts/quill-send-message.ts <AUTOMATION_ID> <THREAD_ID> --file path/to/message.txt
 *
 * Env:
 *   QUILL_DUMP=1   write each raw JSON object to stderr lines prefixed RAW:
 */

const TOKEN = process.env.KOGNITOS_TOKEN!;
if (!TOKEN) {
  console.error("Missing KOGNITOS_TOKEN");
  process.exit(1);
}

interface QuillEvent {
  name?: string;
  state?: string;
  user_message?: { content_list?: { items?: Array<{ text?: string }> } };
  progress_notification?: { message?: string };
  tool_call_request?: { tool_name?: string; arguments?: unknown };
  agent_message?: { content?: string };
  completion_response?: { content?: string; state?: string };
  artifact?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

function pickText(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.content === "string") return o.content;
    if (Array.isArray(o.items)) {
      return o.items.map((it) => pickText(it)).filter(Boolean).join(" ");
    }
  }
  return "";
}

function summarizeEvent(ev: QuillEvent): string {
  if (ev.progress_notification) {
    return `· ${ev.progress_notification.message ?? ""}`;
  }
  if (ev.tool_call_request) {
    const t = ev.tool_call_request.tool_name ?? "?";
    const args = ev.tool_call_request.arguments;
    const argText = args === undefined ? "" : JSON.stringify(args).slice(0, 140);
    return `→ tool ${t}  ${argText}${argText.length === 140 ? "…" : ""}`;
  }
  if (ev.user_message) {
    const txt = pickText(ev.user_message.content_list);
    return `← user_message  (${ev.state ?? "?"})  ${txt.slice(0, 80)}`;
  }
  if (ev.agent_message) {
    const txt = pickText(ev.agent_message.content);
    return `\n=== AGENT (${ev.state ?? "?"}) ===\n${txt}\n=====================`;
  }
  if (ev.completion_response) {
    const txt = pickText(ev.completion_response.content);
    return `\n*** COMPLETION (${ev.completion_response.state ?? ev.state ?? "?"}) ***\n${txt}\n*****************`;
  }
  if (ev.artifact) {
    return `↳ artifact ${JSON.stringify(ev.artifact).slice(0, 200)}`;
  }
  if (ev.error) {
    return `!! error ${JSON.stringify(ev.error)}`;
  }
  if (ev.state) {
    return `· state=${ev.state}${ev.name ? `  ${ev.name.split("/").pop()}` : ""}`;
  }
  return `?? ${JSON.stringify(ev).slice(0, 200)}`;
}

/**
 * Yield each top-level JSON object from a stream of text. The Quill stream
 * sends pretty-printed JSON objects separated by whitespace; tracking brace
 * depth (and respecting strings/escapes) is the safe way to chunk them.
 */
function* extractJsonObjects(buffer: string): Generator<string> {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        yield buffer.slice(start, i + 1);
        start = -1;
      }
    }
  }
}

function consumeBuffer(buffer: string): { events: string[]; rest: string } {
  const events: string[] = [];
  let lastEnd = 0;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        events.push(buffer.slice(start, i + 1));
        lastEnd = i + 1;
        start = -1;
      }
    }
  }
  return { events, rest: buffer.slice(lastEnd) };
}

async function sendMessage(
  automationId: string,
  threadId: string,
  message: string,
): Promise<void> {
  const url =
    `${BASE_URL}/organizations/${ORG_ID}/workspaces/${WORKSPACE_ID}` +
    `/automations/${automationId}` +
    `/agents/quill/threads/${threadId}:sendMessage`;

  const body = {
    user_message: {
      user_message: {
        user_message_type: "user_query",
        content_list: { items: [{ text: message }] },
      },
    },
  };

  console.log(`POST ${url.replace(BASE_URL!, "")}`);
  console.log(`Message length: ${message.length} chars\n`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
  });

  console.log(`Status: ${res.status} ${res.statusText}`);

  if (!res.ok || !res.body) {
    const text = await res.text();
    console.error("Error response:");
    console.error(text);
    process.exit(1);
  }

  const dumpRaw = !!process.env.QUILL_DUMP;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastCompletion = "";
  let agentMessages: string[] = [];

  void extractJsonObjects;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { events, rest } = consumeBuffer(buffer);
    buffer = rest;

    for (const raw of events) {
      if (dumpRaw) console.error(`RAW: ${raw}`);
      let ev: QuillEvent;
      try {
        ev = JSON.parse(raw) as QuillEvent;
      } catch {
        console.log(`?? non-json chunk: ${raw.slice(0, 200)}`);
        continue;
      }
      console.log(summarizeEvent(ev));
      if (ev.completion_response) {
        lastCompletion = pickText(ev.completion_response.content);
      } else if (ev.agent_message) {
        agentMessages.push(pickText(ev.agent_message.content));
      }
    }
  }

  if (buffer.trim()) {
    console.log(`?? trailing buffer: ${buffer.slice(0, 200)}`);
  }

  console.log("\n— stream closed —");
  if (lastCompletion) {
    console.log("\n>>> COMPLETION >>>");
    console.log(lastCompletion);
    console.log("<<< END COMPLETION <<<");
  } else if (agentMessages.length > 0) {
    console.log("\n>>> LAST AGENT MESSAGE >>>");
    console.log(agentMessages[agentMessages.length - 1]);
    console.log("<<< END AGENT MESSAGE <<<");
  }
}

function readMessageArg(): string {
  const args = process.argv.slice(4);
  const fileFlagIdx = args.indexOf("--file");
  if (fileFlagIdx >= 0) {
    const path = args[fileFlagIdx + 1];
    if (!path) {
      console.error("--file requires a path argument");
      process.exit(1);
    }
    return readFileSync(path, "utf8");
  }
  return args.join(" ");
}

async function main(): Promise<void> {
  const automationId = process.argv[2];
  const threadId = process.argv[3];
  const message = readMessageArg();
  if (!automationId || !threadId || !message) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/quill-send-message.ts <AUTOMATION_ID> <THREAD_ID> \"message\"\n" +
        "  npx tsx scripts/quill-send-message.ts <AUTOMATION_ID> <THREAD_ID> --file path/to/message.txt",
    );
    process.exit(1);
  }
  await sendMessage(automationId, threadId, message);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
