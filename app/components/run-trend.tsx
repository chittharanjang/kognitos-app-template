"use client";

import type React from "react";

/**
 * Mini trend visualizers used by the DB Agent Run History Groups view.
 * Pure SVG, no dependencies. Designed for tight cards (8–48 px tall).
 */

/**
 * Inline sparkline of record counts for the last N runs of a question.
 * Oldest → newest reading order. Nulls are rendered as gaps (no datum).
 *
 * The sparkline shape highlights stability vs. drift: a flat line means the
 * answer hasn't changed; a step up/down means the underlying agent or data
 * changed between runs (which is exactly the signal a reviewer cares about).
 */
export function TrendSparkline({
  values,
  width = 84,
  height = 22,
  color = "currentColor",
  strokeWidth = 1.5,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}): React.ReactElement {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => typeof p.v === "number");

  if (points.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className="text-muted-foreground/40"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeDasharray="2 3"
          strokeWidth={1}
        />
      </svg>
    );
  }

  const xs = values.length === 1 ? [width / 2] : values.map((_, i) => (i / (values.length - 1)) * width);
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const range = max - min || 1;
  const pad = strokeWidth + 1;
  const ys = points.map((p) =>
    height - pad - ((p.v - min) / range) * (height - pad * 2),
  );

  let pathD = "";
  let started = false;
  let pi = 0;
  for (let i = 0; i < values.length; i++) {
    if (typeof values[i] !== "number") {
      started = false;
      continue;
    }
    const x = xs[i];
    const y = ys[pi];
    pi += 1;
    if (!started) {
      pathD += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      started = true;
    } else {
      pathD += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  }

  // Last datum dot — emphasizes the most recent value
  const lastIdx = points.length - 1;
  const lastX = xs[points[lastIdx].i];
  const lastY = ys[lastIdx];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Record count trend: ${points.map((p) => p.v).join(", ")}`}
    >
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.6} fill={color} />
    </svg>
  );
}

/**
 * Row of small dots representing the verdict trend for the last N runs of a
 * question (oldest → newest). Green = correct, red = incorrect.
 *
 * A user scanning the list can see at a glance whether a question's quality
 * has been stable, improving, or regressing without opening the detail view.
 */
export function VerdictTrendDots({
  verdicts,
  size = 6,
  gap = 4,
}: {
  verdicts: ("correct" | "incorrect")[];
  size?: number;
  gap?: number;
}): React.ReactElement {
  if (verdicts.length === 0) {
    return (
      <span className="inline-flex items-center text-[10px] text-muted-foreground">
        no runs
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center"
      style={{ gap: `${gap}px` }}
      aria-label={`Verdict trend: ${verdicts.join(", ")}`}
    >
      {verdicts.map((v, i) => (
        <span
          key={i}
          className={`inline-block rounded-full ${
            v === "correct" ? "bg-emerald-500" : "bg-red-500"
          }`}
          style={{ width: `${size}px`, height: `${size}px` }}
          title={v}
        />
      ))}
    </span>
  );
}

/**
 * Returns "improved" | "regressed" | "stable" based on whether the verdict
 * trend ends differently than it began. Used to render the trend badge on
 * each group card.
 */
export function trendDirection(
  verdicts: ("correct" | "incorrect")[],
): "improved" | "regressed" | "stable" {
  if (verdicts.length < 2) return "stable";
  const first = verdicts[0];
  const last = verdicts[verdicts.length - 1];
  if (first === last) return "stable";
  return first === "incorrect" && last === "correct" ? "improved" : "regressed";
}
