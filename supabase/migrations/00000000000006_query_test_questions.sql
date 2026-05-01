-- Query (SQL Query Generator) test-question library.
--
-- A curated catalogue of natural-language questions to send through the
-- SQL Query Generator automation (the one that powers the /query chat page).
-- Populated by POST /api/query/test-questions/load (which pages through the
-- Kognitos run history for SQL Query Generator and dedupes by question text)
-- and consumed by POST /api/query/test-questions/run, which is wired to the
-- "Test" button on the Query Run History page (/query/runs).
--
-- Kept separate from db_agent_test_questions because the two automations
-- have distinct lifecycles, even though some question text may overlap.

create table if not exists query_test_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  source text not null default 'kognitos_history',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  run_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_query_test_questions_question
  on query_test_questions (question);

create index if not exists idx_query_test_questions_last_seen
  on query_test_questions (last_seen_at desc);

alter table query_test_questions enable row level security;

drop policy if exists "Allow all on query_test_questions" on query_test_questions;
create policy "Allow all on query_test_questions"
  on query_test_questions
  for all
  using (true)
  with check (true);
