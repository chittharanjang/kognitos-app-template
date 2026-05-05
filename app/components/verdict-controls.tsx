"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Icon, Text } from "@kognitos/lattice";

export type Verdict = "correct" | "incorrect";

/**
 * Two-state segmented toggle for marking a run Correct / Incorrect.
 *
 * Default value is `'correct'` — by convention every visible run already has
 * a row in the verdict table (see the per-app bootstrap routes), so this
 * control always renders one of the two segments as active. Clicking the
 * inactive segment flips the value.
 */
export function VerdictToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: Verdict;
  onChange: (next: Verdict) => void;
  disabled?: boolean;
}): React.ReactElement {
  const handleClick = (e: MouseEvent<HTMLButtonElement>, next: Verdict) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || value === next) return;
    onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(value === "correct" ? "incorrect" : "correct");
    }
  };

  return (
    <div
      role="group"
      aria-label="Verdict"
      onKeyDown={handleKeyDown}
      className={`inline-flex items-center rounded-full border border-border bg-background p-0.5 ${
        disabled ? "opacity-60" : ""
      }`}
    >
      <Segment
        tone="correct"
        active={value === "correct"}
        disabled={disabled}
        onClick={(e) => handleClick(e, "correct")}
      />
      <Segment
        tone="incorrect"
        active={value === "incorrect"}
        disabled={disabled}
        onClick={(e) => handleClick(e, "incorrect")}
      />
    </div>
  );
}

function Segment({
  tone,
  active,
  disabled,
  onClick,
}: {
  tone: Verdict;
  active: boolean;
  disabled: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}): React.ReactElement {
  const label = tone === "correct" ? "Correct" : "Incorrect";
  const iconType = tone === "correct" ? "CircleCheck" : "CircleX";
  const inactive =
    "text-muted-foreground hover:text-foreground hover:bg-muted/40";
  const activeClass =
    tone === "correct"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-sm"
      : "bg-red-500/15 text-red-700 dark:text-red-300 shadow-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      tabIndex={active ? 0 : -1}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors disabled:cursor-not-allowed ${
        active ? activeClass : inactive
      }`}
    >
      <Icon type={iconType} size="xs" />
      <span>{label}</span>
    </button>
  );
}

/**
 * Inline editable notes field. Shows a muted "none" placeholder when empty.
 * Saves on blur or Enter (Cmd/Ctrl+Enter for the multiline variant).
 *
 * Optimistic save is the parent's responsibility — `onSave` should accept
 * the new value, persist it, and (on failure) flip back to the previous
 * value via the `value` prop. This component reflects whatever `value` it
 * receives between edits.
 */
export function NotesField({
  value,
  onSave,
  disabled = false,
  multiline = false,
  placeholder = "none",
  label = "Notes",
}: {
  value: string | null;
  onSave: (next: string | null) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
  label?: string;
}): React.ReactElement {
  const [draft, setDraft] = useState<string>(value ?? "");
  const [editing, setEditing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // Sync the draft to the prop when not actively editing (e.g. parent
    // rolled back after a save failure, or another tab refreshed).
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim().length === 0 ? null : draft;
    if (next === (value ?? null)) return;
    onSave(next);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const startEditing = () => {
    if (disabled) return;
    setEditing(true);
    queueMicrotask(() => {
      if (multiline) textareaRef.current?.focus();
      else inputRef.current?.focus();
    });
  };

  const stop = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
  };

  if (editing) {
    return (
      <div
        className="flex flex-col gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {multiline ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                stop(e);
                cancel();
              } else if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey)
              ) {
                stop(e);
                commit();
              }
            }}
            placeholder={placeholder}
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        ) : (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                stop(e);
                cancel();
              } else if (e.key === "Enter") {
                stop(e);
                commit();
              }
            }}
            placeholder={placeholder}
            className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        )}
        <span className="text-[10px] text-muted-foreground">
          {multiline
            ? "Esc to cancel · ⌘/Ctrl + Enter to save"
            : "Esc to cancel · Enter to save"}
        </span>
      </div>
    );
  }

  const hasValue = (value ?? "").trim().length > 0;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startEditing();
      }}
      disabled={disabled}
      title={disabled ? undefined : "Click to edit notes"}
      className="group flex flex-col items-start gap-0.5 text-left rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-muted/40 transition-colors disabled:cursor-not-allowed"
    >
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {hasValue ? (
        <Text
          level="small"
          className={multiline ? "whitespace-pre-wrap" : "line-clamp-2"}
        >
          {value}
        </Text>
      ) : (
        <span className="text-sm italic text-muted-foreground/70 group-hover:text-muted-foreground">
          {placeholder}
        </span>
      )}
    </button>
  );
}
