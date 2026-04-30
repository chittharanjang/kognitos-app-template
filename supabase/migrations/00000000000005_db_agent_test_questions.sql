-- DB Agent test-question library.
--
-- A curated catalogue of natural-language questions to send through the
-- DB Agent automation. Populated by POST /api/ama-agent/test-questions/load
-- (which pages through the Kognitos run history and dedupes by question text)
-- and consumed by POST /api/ama-agent/test-questions/run, which is wired to the
-- "Test" button on the Run History page (/ama-agent/runs).

create table if not exists db_agent_test_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  source text not null default 'kognitos_history',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  run_count integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_db_agent_test_questions_question
  on db_agent_test_questions (question);

create index if not exists idx_db_agent_test_questions_last_seen
  on db_agent_test_questions (last_seen_at desc);

alter table db_agent_test_questions enable row level security;

drop policy if exists "Allow all on db_agent_test_questions" on db_agent_test_questions;
create policy "Allow all on db_agent_test_questions"
  on db_agent_test_questions
  for all
  using (true)
  with check (true);
