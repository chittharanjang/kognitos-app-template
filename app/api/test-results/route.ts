import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";

const RESULTS_PATH = path.resolve(process.cwd(), "scripts/output/db-agent-test-results.json");
const RUNNER_PATH = path.resolve(process.cwd(), "scripts/run-db-agent-tests.ts");

// In-memory tracker of an in-flight batch run, so the UI can show
// "Running…" without persisting state to disk. Reset on dev-server reload.
type RunState = {
  startedAt: number;
  pid: number | null;
  finishedAt: number | null;
  exitCode: number | null;
  error: string | null;
};
const g = globalThis as unknown as { __dbAgentTestRun?: RunState };
function getRun(): RunState | null {
  return g.__dbAgentTestRun ?? null;
}
function setRun(s: RunState | null): void {
  g.__dbAgentTestRun = s ?? undefined;
}

export async function GET(): Promise<Response> {
  let payload: unknown = null;
  let mtime: string | null = null;
  let exists = false;

  try {
    const st = await stat(RESULTS_PATH);
    mtime = st.mtime.toISOString();
    const raw = await readFile(RESULTS_PATH, "utf8");
    payload = JSON.parse(raw);
    exists = true;
  } catch {
    exists = false;
  }

  const run = getRun();
  const isRunning = run != null && run.finishedAt == null;

  return NextResponse.json({
    exists,
    mtime,
    payload,
    run: run
      ? {
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          exitCode: run.exitCode,
          error: run.error,
          isRunning,
        }
      : null,
  });
}

export async function POST(request: Request): Promise<Response> {
  const existing = getRun();
  if (existing && existing.finishedAt == null) {
    return NextResponse.json(
      {
        error: "A test run is already in progress.",
        startedAt: existing.startedAt,
      },
      { status: 409 },
    );
  }

  let body: { tags?: string[]; concurrency?: number; limit?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const args = ["tsx", RUNNER_PATH];
  if (body.concurrency && Number.isFinite(body.concurrency)) {
    args.push("--concurrency", String(body.concurrency));
  }
  if (Array.isArray(body.tags) && body.tags.length > 0) {
    args.push("--tag", body.tags.join(","));
  }
  if (body.limit && Number.isFinite(body.limit)) {
    args.push("--limit", String(body.limit));
  }

  const state: RunState = {
    startedAt: Date.now(),
    pid: null,
    finishedAt: null,
    exitCode: null,
    error: null,
  };
  setRun(state);

  try {
    const child = spawn("npx", args, {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    state.pid = child.pid ?? null;
    child.on("error", (err) => {
      state.error = err.message;
      state.finishedAt = Date.now();
    });
    child.on("exit", (code) => {
      state.exitCode = code;
      state.finishedAt = Date.now();
    });
    child.unref();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    state.finishedAt = Date.now();
    return NextResponse.json({ error: state.error }, { status: 500 });
  }

  return NextResponse.json({
    started: true,
    startedAt: state.startedAt,
    pid: state.pid,
    args,
  });
}
