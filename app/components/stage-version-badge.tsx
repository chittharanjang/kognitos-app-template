"use client";

import { Badge } from "@kognitos/lattice";

/**
 * Convert Kognitos's `stage` enum into a human-friendly word.
 *   AUTOMATION_STAGE_DRAFT      → "draft"
 *   AUTOMATION_STAGE_PUBLISHED  → "published"
 *   AUTOMATION_STAGE_FOO_BAR    → "foo bar"   (graceful fallback)
 */
export function stageWord(stage: string | null | undefined): string | null {
  if (!stage) return null;
  if (stage === "AUTOMATION_STAGE_DRAFT") return "draft";
  if (stage === "AUTOMATION_STAGE_PUBLISHED") return "published";
  return stage.replace(/^AUTOMATION_STAGE_/, "").replace(/_/g, " ").toLowerCase();
}

/**
 * Build a single badge label from stage + stage_version.
 *
 *   ("AUTOMATION_STAGE_DRAFT", "5.8")     → "draft v5.8"
 *   ("AUTOMATION_STAGE_PUBLISHED", null)  → "published"
 *   (null, "5.8")                         → "v5.8"
 *   (null, null)                          → null
 */
export function formatStageVersion(
  stage: string | null | undefined,
  version: string | null | undefined,
): string | null {
  const word = stageWord(stage);
  const v = version ? `v${version}` : null;
  if (word && v) return `${word} ${v}`;
  return word ?? v ?? null;
}

interface Props {
  stage: string | null | undefined;
  stageVersion: string | null | undefined;
  /** Lattice Badge variant. Defaults to "outline" for a quiet appearance. */
  variant?: "default" | "secondary" | "destructive" | "outline" | "success";
  className?: string;
  /** When false, returns null instead of a "—" placeholder if both inputs are missing. */
  emptyAsDash?: boolean;
}

/**
 * Compact "draft v5.8" badge used on every Run History surface so engineers
 * can tell at a glance which automation version produced a given run.
 *
 * Renders nothing (or "—") when both stage and version are unknown.
 */
export function StageVersionBadge({
  stage,
  stageVersion,
  variant = "outline",
  className,
  emptyAsDash = false,
}: Props): React.ReactElement | null {
  const label = formatStageVersion(stage, stageVersion);
  if (!label) {
    if (emptyAsDash) {
      return (
        <span className="text-xs text-muted-foreground" aria-label="no stage">
          —
        </span>
      );
    }
    return null;
  }
  return (
    <Badge
      variant={variant}
      className={className}
      title={
        stageVersion
          ? `Automation version ${stageVersion}${stage ? ` (${stageWord(stage)})` : ""}`
          : undefined
      }
    >
      {label}
    </Badge>
  );
}
