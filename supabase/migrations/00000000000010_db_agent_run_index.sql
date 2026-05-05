-- DB Agent run index — one row per Kognitos run, optimized for grouping by
-- question. Powers the Run History Groups view (/ama-agent/run-groups), which
-- collapses the flat run list into one card per unique question and lets users
-- compare results across multiple runs of the same question.
--
-- Populated by:
--   • POST /api/ama-agent/run-groups/backfill — pages Kognitos history once
--     to fill the table from existing runs
--   • POST /api/ama-agent/runs/verdicts/bootstrap — also upserts an index row
--     for every run rendered in the UI (so new runs land in the index live,
--     without a re-scan)
--
-- Read by:
--   • GET  /api/ama-agent/run-groups          — aggregated list (1 row / question)
--   • GET  /api/ama-agent/run-groups/[questionId] — all runs for one question
--
-- `question_id` is sha1(question_norm).slice(0, 12), kept in TypeScript so the
-- list endpoint can group in SQL without recomputing per row. `question_norm`
-- is the normalized form (lowercased, trimmed, collapsed whitespace) used for
-- typeahead search.

create table if not exists db_agent_run_index (
  run_id text primary key,
  question text not null,
  question_norm text not null,
  question_id text not null,
  created_at timestamptz not null,
  status text not null,
  record_count integer,
  databases_queried text,
  answer_preview text,
  stage text,
  indexed_at timestamptz not null default now()
);

create index if not exists idx_db_agent_run_index_qid_created
  on db_agent_run_index (question_id, created_at desc);

create index if not exists idx_db_agent_run_index_qnorm
  on db_agent_run_index (question_norm);

create index if not exists idx_db_agent_run_index_created
  on db_agent_run_index (created_at desc);

alter table db_agent_run_index enable row level security;

drop policy if exists "Allow all on db_agent_run_index" on db_agent_run_index;
create policy "Allow all on db_agent_run_index"
  on db_agent_run_index
  for all
  using (true)
  with check (true);
