/**
 * POST /api/grade-run
 *
 * Auto-grades a completed UAT run by comparing its output to the ground-truth
 * answer key using Claude as the evaluator.
 *
 * Body:
 *   automationType  "query" | "ama-agent"   — which verdict table to write
 *   runId           string                  — Kognitos run ID
 *   questionText    string                  — the question asked
 *   runOutput       string                  — the automation's answer/response
 *   force?          boolean                 — overwrite existing auto-grade (default false)
 *
 * Response:
 *   { verdict: "correct" | "incorrect", reasoning: string, skipped?: boolean }
 *
 * Behaviour:
 *   - Looks up the ground truth answer from lib/answer-key.ts.
 *   - Calls Claude to evaluate whether runOutput matches the ground truth.
 *   - Writes verdict + reasoning to the Supabase verdict table.
 *   - If the row already has a manual verdict (notes NOT starting with
 *     "[Auto-graded]"), the grade is skipped unless force=true.
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin, TABLES } from "@/lib/supabase";
import { findAnswerKeyEntry } from "@/lib/answer-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "",
});

const GRADE_MODEL = "claude-haiku-4-5";

interface GradeBody {
  automationType: "query" | "ama-agent";
  runId: string;
  questionText: string;
  runOutput: string;
  force?: boolean;
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  let body: GradeBody;
  try {
    body = (await request.json()) as GradeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { automationType, runId, questionText, runOutput, force = false } = body;

  if (!automationType || !runId || !questionText) {
    return NextResponse.json(
      { error: "automationType, runId, and questionText are required" },
      { status: 400 },
    );
  }

  // Look up ground truth
  const entry = findAnswerKeyEntry(questionText);
  if (!entry) {
    return NextResponse.json(
      { error: "Question not found in answer key", skipped: true },
      { status: 404 },
    );
  }

  const table =
    automationType === "query"
      ? TABLES.queryRunVerdicts
      : TABLES.dbAgentRunVerdicts;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Check if a manual verdict exists (don't overwrite unless forced)
  if (!force) {
    const { data: existing } = await supabaseAdmin
      .from(table)
      .select("verdict, notes")
      .eq("run_id", runId)
      .single();

    if (existing?.notes && !String(existing.notes).startsWith("[Auto-graded]")) {
      return NextResponse.json(
        { verdict: existing.verdict, reasoning: existing.notes, skipped: true },
        { status: 200 },
      );
    }
  }

  // Call Claude to grade
  const prompt = `You are a strict SQL query result evaluator. Your job is to determine whether an automation's response CORRECTLY answers a question compared to the official ground truth answer.

QUESTION:
${questionText}

GROUND TRUTH ANSWER:
${entry.answerText}

AUTOMATION'S RESPONSE:
${runOutput || "(no output)"}

Evaluate whether the automation's response is CORRECT or INCORRECT.

Rules:
- For YES/NO questions: the response must give the right YES or NO, plus match key details (client counts, names, FIDs).
- For count questions: the number must be exactly right or clearly implied by the row count.
- For list questions: the response must include the correct records. Minor ordering differences are OK. Missing key records = INCORRECT.
- For detail questions: key facts (email, phone, status, account types) must be present and accurate.
- Partial credit does NOT exist — if the response is mostly right but misses a critical detail, it is INCORRECT.
- If the automation returned an error, exception, or no output at all, it is INCORRECT.
- Minor formatting differences (e.g. "Traditional IRA" vs "traditional ira") are OK.

Respond with a JSON object ONLY (no markdown, no explanation outside the JSON):
{"verdict": "correct" | "incorrect", "reasoning": "<1-2 sentences explaining why>"}`;

  let verdict: "correct" | "incorrect";
  let reasoning: string;

  try {
    const msg = await anthropic.messages.create({
      model: GRADE_MODEL,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON from response (Claude sometimes adds markdown fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in Claude response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      verdict: "correct" | "incorrect";
      reasoning: string;
    };
    verdict = parsed.verdict === "correct" ? "correct" : "incorrect";
    reasoning = parsed.reasoning ?? "Auto-graded.";
  } catch (e) {
    return NextResponse.json(
      { error: `Grading failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const notes = `[Auto-graded] ${reasoning}`;

  // Upsert verdict into Supabase (manual verdicts are never overwritten here
  // because we checked above; force=true skips that check)
  const { error: upsertErr } = await supabaseAdmin
    .from(table)
    .upsert(
      {
        run_id: runId,
        question: questionText,
        verdict,
        notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "run_id" },
    );

  if (upsertErr) {
    // Return verdict even if save fails
    console.error("Failed to save auto-grade verdict:", upsertErr.message);
  }

  return NextResponse.json({ verdict, reasoning });
}
