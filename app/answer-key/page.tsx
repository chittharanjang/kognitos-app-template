"use client";

import { useMemo, useState } from "react";
import { Title, Text, Badge, Icon, Button } from "@kognitos/lattice";
import { ANSWER_KEY } from "@/lib/answer-key";
import { UAT_CATEGORIES } from "@/lib/uat-questions";

/* ── Types ───────────────────────────────────────────────────────────────── */
interface CategoryGroup {
  category: number;
  categoryName: string;
  entries: typeof ANSWER_KEY;
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function AnswerKeyPage(): React.ReactElement {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

  const categories: CategoryGroup[] = useMemo(() => {
    return UAT_CATEGORIES.map(({ category, categoryName }) => ({
      category,
      categoryName,
      entries: ANSWER_KEY.filter((e) => e.category === category),
    }));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        entries: cat.entries.filter((e) => {
          const matchCat = selectedCategory === null || e.category === selectedCategory;
          const matchSearch =
            !q ||
            e.question.toLowerCase().includes(q) ||
            e.answerText.toLowerCase().includes(q);
          return matchCat && matchSearch;
        }),
      }))
      .filter((cat) => cat.entries.length > 0);
  }, [categories, search, selectedCategory]);

  function toggleExpand(qn: number) {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qn)) next.delete(qn);
      else next.add(qn);
      return next;
    });
  }

  function expandAll() {
    setExpandedQuestions(new Set(ANSWER_KEY.map((e) => e.questionNumber)));
  }

  function collapseAll() {
    setExpandedQuestions(new Set());
  }

  const totalVisible = filtered.reduce((s, c) => s + c.entries.length, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Title level="h2">Answer Key</Title>
          <Text color="muted" className="mt-1">
            Ground truth answers for all {ANSWER_KEY.length} UAT questions across{" "}
            {UAT_CATEGORIES.length} categories. Used to auto-grade UAT run outputs.
          </Text>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAll}>
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>
            Collapse All
          </Button>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Icon
            type="Search"
            size="sm"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search questions or answers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
              selectedCategory === null
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {UAT_CATEGORIES.map(({ category, categoryName }) => (
            <button
              key={category}
              onClick={() =>
                setSelectedCategory((prev) => (prev === category ? null : category))
              }
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                selectedCategory === category
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title={categoryName}
            >
              Cat {category}
            </button>
          ))}
        </div>
      </div>

      {/* Result count */}
      {(search || selectedCategory !== null) && (
        <Text level="small" color="muted">
          Showing {totalVisible} of {ANSWER_KEY.length} questions
        </Text>
      )}

      {/* Category sections */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Icon type="Search" size="xl" className="mx-auto text-muted-foreground mb-3" />
          <Text color="muted">No questions match your search.</Text>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((cat) => (
            <section key={cat.category} className="space-y-2">
              {/* Category header */}
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <Badge variant="secondary" className="text-xs font-mono">
                  Cat {cat.category}
                </Badge>
                <Text level="small" className="font-medium">
                  {cat.categoryName}
                </Text>
                <Text level="xSmall" color="muted">
                  ({cat.entries.length} question{cat.entries.length !== 1 ? "s" : ""})
                </Text>
              </div>

              {/* Questions */}
              <div className="space-y-2 pl-1">
                {cat.entries.map((entry) => {
                  const expanded = expandedQuestions.has(entry.questionNumber);
                  return (
                    <div
                      key={entry.questionNumber}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      {/* Question row — always visible */}
                      <button
                        onClick={() => toggleExpand(entry.questionNumber)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      >
                        <span className="mt-0.5 shrink-0 text-xs font-mono text-muted-foreground w-6">
                          Q{entry.questionNumber}
                        </span>
                        <Text level="small" className="flex-1 font-medium">
                          {entry.question}
                        </Text>
                        <Icon
                          type={expanded ? "ChevronUp" : "ChevronDown"}
                          size="sm"
                          className="shrink-0 mt-0.5 text-muted-foreground"
                        />
                      </button>

                      {/* Answer — shown when expanded */}
                      {expanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/20">
                          <div className="flex items-start gap-2">
                            <Icon
                              type="Check"
                              size="sm"
                              className="mt-0.5 shrink-0 text-green-600 dark:text-green-400"
                            />
                            <Text level="small" color="muted" className="whitespace-pre-wrap leading-relaxed">
                              {entry.answerText}
                            </Text>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Footer note */}
      <div className="pt-4 border-t border-border">
        <Text level="xSmall" color="muted">
          Source: ground_truth_report.md — FT Demo dataset (CLIENTS_FIDO: 26 records,
          ACCOUNTS: 40 records, PROFILE_STATUS: 30 records, CLIENTS_ADDRESS: 25 records).
          F1026 is an orphan FID present only in ACCOUNTS.
        </Text>
      </div>
    </div>
  );
}
